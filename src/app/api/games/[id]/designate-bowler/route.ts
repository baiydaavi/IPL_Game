import { NextResponse } from "next/server";

import type { GameRow, PickRow } from "@/lib/db-types";
import { getEffectiveUser } from "@/lib/effective-user";
import { parseMatchDate } from "@/lib/match-time";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/games/[id]/designate-bowler
 * Body: { player_id: string }
 *
 * Records the caller's designated "bowler" for this game. The designation
 * must be one of the caller's 3 drafted player picks.
 *
 * This is a ONE-SHOT commitment: once a user has set their designation for
 * a game it cannot be changed. Calls that try to overwrite an existing row
 * are rejected with 409 `already_designated`. (The scoring engine's bowler
 * penalty only keys off whether ANY of the user's 3 picks bowled — so the
 * designation is purely a commitment/bet the user locks in.)
 *
 * Allowed any time after the user has made their 3 player picks and until
 * the match has started. After match start, locked with `match_already_started`.
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

  const body = (await request.json().catch(() => ({}))) as {
    player_id?: string;
  };
  if (!body.player_id) {
    return NextResponse.json({ error: "missing_player_id" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();

  const { data: gameData } = await admin
    .from("games")
    .select("id, match_id, status")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const game = gameData as Pick<GameRow, "id" | "match_id" | "status">;

  // Caller must be a member of this game.
  const { data: memberRow } = await admin
    .from("game_members")
    .select("user_id")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!memberRow) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  // Locked once the match has started. We read the cached fixture date.
  const { data: matchRow } = await admin
    .from("matches_cached")
    .select("date")
    .eq("match_id", game.match_id)
    .maybeSingle();
  if (matchRow?.date && parseMatchDate(matchRow.date).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "match_already_started" },
      { status: 409 },
    );
  }

  // One-shot: if the caller already has a designation for this game, bail.
  const { data: existing } = await admin
    .from("bowler_designations")
    .select("player_id")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "already_designated" },
      { status: 409 },
    );
  }

  // The designation must be one of this user's drafted player picks.
  const { data: pickRows } = await admin
    .from("picks")
    .select("*")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .eq("pick_type", "player");
  const picks = (pickRows ?? []) as PickRow[];
  const match = picks.find((p) => p.player_id === body.player_id);
  if (!match) {
    return NextResponse.json(
      { error: "player_not_in_your_picks" },
      { status: 400 },
    );
  }

  // Plain insert (not upsert) — the pre-check above already confirmed no
  // row exists, and we want a unique-constraint violation if two requests
  // race so the second one loses.
  const { error } = await admin.from("bowler_designations").insert({
    game_id: gameId,
    user_id: user.id,
    player_id: match.player_id,
    player_name: match.player_name ?? "",
  });
  if (error) {
    // 23505 = unique_violation; someone else beat us to it.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "already_designated" },
        { status: 409 },
      );
    }
    console.error("[designate-bowler] insert failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
