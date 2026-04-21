import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { getCachedSquad } from "@/lib/cricket-cache";
import type { GameRow } from "@/lib/db-types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/games/[id]/refresh-squad
 *
 * Force-repull the match's squad from CricAPI, bypassing our cache TTL.
 * Used when CricAPI's roster lags a real-world trade / late addition, so
 * the admin impact-sub editor can surface the missing player.
 *
 * Costs 1 CricAPI hit.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id: gameId } = await params;

  const admin = createSupabaseServiceClient();
  const { data: gameData } = await admin
    .from("games")
    .select("match_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const game = gameData as Pick<GameRow, "match_id">;

  try {
    const squad = await getCachedSquad(game.match_id, { forceRefresh: true });
    const totalPlayers = squad.reduce((acc, t) => acc + t.players.length, 0);
    return NextResponse.json({
      ok: true,
      teams: squad.map((t) => ({ name: t.teamName, players: t.players.length })),
      totalPlayers,
    });
  } catch (err) {
    console.error("[refresh-squad] failed", err);
    return NextResponse.json(
      { error: "upstream_failed", message: (err as Error).message },
      { status: 502 },
    );
  }
}
