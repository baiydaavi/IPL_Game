import { NextResponse } from "next/server";

import type { GameMemberRow, GameRow, PickRow } from "@/lib/db-types";
import { partitionMembers, validatePick } from "@/lib/draft";
import { getEffectiveUser } from "@/lib/effective-user";
import { lockIfReady } from "@/lib/game-lifecycle";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/games/[id]/pick
 *
 * Body:
 *   { pick_type: 'player', player_id: string, player_name: string }
 *   | { pick_type: 'team',   team_code: string }
 *
 * Authoritative turn/alternation/duplicate validation happens here using the
 * service-role client (bypasses RLS for atomic read+insert). RLS on `picks`
 * is a secondary belt-and-braces check.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: gameId } = await params;

  const user = await getEffectiveUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const proposed = parseProposedPick(body);
  if (!proposed) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();

  const { data: gameData, error: gameError } = await admin
    .from("games")
    .select("*")
    .eq("id", gameId)
    .maybeSingle();
  if (gameError || !gameData) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const game = gameData as GameRow;
  if (game.status !== "drafting") {
    return NextResponse.json(
      { error: "game_not_drafting", status: game.status },
      { status: 409 },
    );
  }

  const { data: memberRows, error: membersError } = await admin
    .from("game_members")
    .select("*")
    .eq("game_id", gameId);
  if (membersError || !memberRows || memberRows.length !== 2) {
    return NextResponse.json({ error: "invalid_game_members" }, { status: 500 });
  }
  const members = partitionMembers(memberRows as GameMemberRow[]);

  // Require the caller to be one of the two members.
  if (members.p1.user_id !== user.id && members.p2.user_id !== user.id) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const { data: pickRows, error: picksError } = await admin
    .from("picks")
    .select("id, turn_index, pick_type, player_id")
    .eq("game_id", gameId)
    .order("turn_index", { ascending: true });
  if (picksError) {
    return NextResponse.json({ error: "picks_read_failed" }, { status: 500 });
  }
  const existingPicks = (pickRows ?? []) as Pick<
    PickRow,
    "turn_index" | "pick_type" | "player_id"
  >[];

  const validation = validatePick({
    userId: user.id,
    game,
    members,
    existingPicks,
    proposed,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: "invalid_pick", detail: validation.error }, { status: 409 });
  }

  const row = {
    game_id: gameId,
    user_id: user.id,
    turn_index: validation.turn_index,
    pick_type: proposed.pick_type,
    player_id: proposed.pick_type === "player" ? proposed.player_id : null,
    player_name: proposed.pick_type === "player" ? proposed.player_name : null,
    team_code: proposed.pick_type === "team" ? proposed.team_code : null,
  };

  const { data: inserted, error: insertError } = await admin
    .from("picks")
    .insert(row)
    .select("*")
    .single();

  if (insertError) {
    // Most likely a race where the other user beat us to this turn_index;
    // report it cleanly so the client can refetch state.
    console.warn("[pick] insert failed", insertError);
    return NextResponse.json(
      { error: "insert_failed", message: insertError.message },
      { status: 409 },
    );
  }

  // If this was the 8th pick, flip the game to `locked` immediately.
  const lockResult = await lockIfReady(gameId, admin);

  return NextResponse.json({ pick: inserted, locked: lockResult.locked });
}

type ProposedPick =
  | { pick_type: "player"; player_id: string; player_name: string }
  | { pick_type: "team"; team_code: string };

function parseProposedPick(body: unknown): ProposedPick | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.pick_type === "player") {
    if (
      typeof b.player_id === "string" &&
      b.player_id.length > 0 &&
      typeof b.player_name === "string" &&
      b.player_name.length > 0
    ) {
      return {
        pick_type: "player",
        player_id: b.player_id,
        player_name: b.player_name,
      };
    }
    return null;
  }
  if (b.pick_type === "team") {
    if (typeof b.team_code === "string" && b.team_code.length > 0) {
      return { pick_type: "team", team_code: b.team_code };
    }
    return null;
  }
  return null;
}
