import { NextResponse } from "next/server";

import type { CricApiSquadEntry } from "@/lib/cricket";
import { getCachedSquad } from "@/lib/cricket-cache";
import type { GameRow } from "@/lib/db-types";
import { getEffectiveUser } from "@/lib/effective-user";
import { iplTeamCode } from "@/lib/ipl-teams";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/games/[id]/impact-sub
 * Body:
 *   { team_code: string; out_player_id: string; in_player_id: string }
 * OR { team_code: string; clear: true }   // remove any record for this team
 *
 * Either player in the game can report an impact substitution — we can't
 * automate this because the free CricAPI tier doesn't expose impact-player
 * data. Last write wins. One row per (game_id, team_code).
 *
 * Validates:
 *   - Caller is a member of the game.
 *   - team_code matches one of the match's two teams.
 *   - out/in player_ids are present in the cached squad for that team.
 *   - out_player_id != in_player_id.
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
    team_code?: string;
    out_player_id?: string;
    in_player_id?: string;
    clear?: boolean;
  };
  if (!body.team_code) {
    return NextResponse.json({ error: "missing_team_code" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();

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

  const { data: gameData } = await admin
    .from("games")
    .select("id, match_id, status")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const game = gameData as Pick<GameRow, "id" | "match_id" | "status">;

  const teamCode = body.team_code.toUpperCase();

  if (body.clear) {
    const { error } = await admin
      .from("impact_subs")
      .delete()
      .eq("game_id", gameId)
      .eq("team_code", teamCode);
    if (error) {
      console.error("[impact-sub] delete failed", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (!body.out_player_id || !body.in_player_id) {
    return NextResponse.json(
      { error: "missing_player_ids" },
      { status: 400 },
    );
  }
  if (body.out_player_id === body.in_player_id) {
    return NextResponse.json(
      { error: "out_and_in_must_differ" },
      { status: 400 },
    );
  }

  // Validate that both player IDs exist in the squad for that team.
  let squad: CricApiSquadEntry[];
  try {
    squad = await getCachedSquad(game.match_id);
  } catch (err) {
    console.error("[impact-sub] squad read failed", err);
    return NextResponse.json({ error: "squad_unavailable" }, { status: 502 });
  }

  const team = squad.find((t) => iplTeamCode(t.teamName) === teamCode);
  if (!team) {
    return NextResponse.json(
      { error: "team_not_in_match" },
      { status: 400 },
    );
  }
  const outPlayer = team.players.find((p) => p.id === body.out_player_id);
  const inPlayer = team.players.find((p) => p.id === body.in_player_id);
  if (!outPlayer || !inPlayer) {
    return NextResponse.json(
      { error: "player_not_in_team_squad" },
      { status: 400 },
    );
  }

  const { error } = await admin.from("impact_subs").upsert(
    {
      game_id: gameId,
      team_code: teamCode,
      out_player_id: outPlayer.id,
      out_player_name: outPlayer.name,
      in_player_id: inPlayer.id,
      in_player_name: inPlayer.name,
      reported_by: user.id,
    },
    { onConflict: "game_id,team_code" },
  );
  if (error) {
    console.error("[impact-sub] upsert failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
