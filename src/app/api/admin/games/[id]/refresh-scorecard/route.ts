import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { scoreGame } from "@/lib/game-lifecycle";

/**
 * POST /api/admin/games/[id]/refresh-scorecard
 *
 * Force-repull the match's scorecard from CricAPI (bypassing the cache)
 * and then rescore the game. This is the escape hatch for the case where
 * CricAPI has already flipped a match to "final" but the scorecard it
 * returned was incomplete, so we scored the game against partial data.
 * A later `match_scorecard` response usually has the missing rows; this
 * button pulls it and recomputes totals.
 *
 * Differences from the existing buttons:
 *   - `Rescore` re-runs the pure scoring function against the CACHED
 *     scorecard (no CricAPI hit). Use after pick / impact-sub / bowler
 *     edits, or a rule change.
 *   - `Refresh live` on the home card calls the generic refresh route,
 *     which throttles per-user and writes provisional scores while live.
 *
 * This route is the "make the final scorecard actually final" action.
 * Costs 1 CricAPI hit.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  // allowRescore + requireFinal:false so this also works on a locked
  // (not-yet-final) game — admin may want to re-pull mid-match if the
  // cached copy looks stale.
  const result = await scoreGame(id, {
    forceScorecardRefresh: true,
    allowRescore: true,
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
