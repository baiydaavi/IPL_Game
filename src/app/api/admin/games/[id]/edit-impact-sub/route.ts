import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { rescoreAfterEdit } from "@/lib/admin-rescore";
import type { GameRow } from "@/lib/db-types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getCachedSquad } from "@/lib/cricket-cache";
import { iplTeamCode } from "@/lib/ipl-teams";

/**
 * POST /api/admin/games/[id]/edit-impact-sub
 * Body:
 *   { team_code: string; out_player_id: string; in_player_id: string } // upsert
 * | { team_code: string; clear: true }                                 // delete
 *
 * Admin override of an impact-sub report for one team. Mirrors the
 * user-facing /api/games/[id]/impact-sub route but bypasses membership
 * checks and runs a rescore on success.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id: gameId } = await params;
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
  const teamCode = body.team_code.toUpperCase();

  const { data: gameData } = await admin
    .from("games")
    .select("id, match_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const game = gameData as Pick<GameRow, "id" | "match_id">;

  if (body.clear) {
    const { error } = await admin
      .from("impact_subs")
      .delete()
      .eq("game_id", gameId)
      .eq("team_code", teamCode);
    if (error) {
      console.error("[admin edit-impact-sub] delete failed", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
    const rescore = await rescoreAfterEdit(gameId);
    return NextResponse.json({ ok: true, cleared: true, rescored: rescore.rescored });
  }

  if (!body.out_player_id || !body.in_player_id) {
    return NextResponse.json({ error: "missing_player_ids" }, { status: 400 });
  }
  if (body.out_player_id === body.in_player_id) {
    return NextResponse.json({ error: "out_and_in_must_differ" }, { status: 400 });
  }

  // Resolve player names from the cached squad for the team.
  let outPlayerName: string | null = null;
  let inPlayerName: string | null = null;
  try {
    const squad = await getCachedSquad(game.match_id);
    const team = squad.find((t) => iplTeamCode(t.teamName) === teamCode);
    if (!team) {
      return NextResponse.json({ error: "team_not_in_match" }, { status: 400 });
    }
    outPlayerName =
      team.players.find((p) => p.id === body.out_player_id)?.name ?? null;
    inPlayerName =
      team.players.find((p) => p.id === body.in_player_id)?.name ?? null;
  } catch (err) {
    console.warn("[admin edit-impact-sub] squad lookup failed; proceeding without name resolution", err);
  }
  // If the squad lookup failed to resolve a name, fall back to the id as
  // the display string. Admin is trusted, so we don't hard-block here.
  if (!outPlayerName) outPlayerName = body.out_player_id;
  if (!inPlayerName) inPlayerName = body.in_player_id;

  // `reported_by` requires a user id. Use the first game member as a stand-in
  // for admin-authored rows so the FK constraint is satisfied.
  const { data: memberRow } = await admin
    .from("game_members")
    .select("user_id")
    .eq("game_id", gameId)
    .limit(1)
    .maybeSingle();
  const reportedBy = memberRow?.user_id ?? null;
  if (!reportedBy) {
    return NextResponse.json({ error: "no_game_members" }, { status: 500 });
  }

  const { error } = await admin.from("impact_subs").upsert(
    {
      game_id: gameId,
      team_code: teamCode,
      out_player_id: body.out_player_id,
      out_player_name: outPlayerName,
      in_player_id: body.in_player_id,
      in_player_name: inPlayerName,
      reported_by: reportedBy,
    },
    { onConflict: "game_id,team_code" },
  );
  if (error) {
    console.error("[admin edit-impact-sub] upsert failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const rescore = await rescoreAfterEdit(gameId);
  return NextResponse.json({ ok: true, rescored: rescore.rescored });
}
