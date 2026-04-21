import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { scoreGame } from "@/lib/game-lifecycle";

/**
 * POST /api/admin/games/[id]/override-winner
 * Body: { team_code: "CSK" | "MI" | ... | null }
 *
 * Forces the `team_bonus` to be awarded based on `team_code` (or revokes it
 * if null), then re-runs `scoreGame` so the totals + winner update.
 *
 * Used when CricketData returns a garbled winner field.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    team_code?: string | null;
  };

  const result = await scoreGame(id, {
    winnerOverride: body.team_code ?? null,
    requireFinal: false,
  });

  if (!result.scored) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, winnerUserId: result.winnerUserId });
}
