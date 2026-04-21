import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { scoreGame } from "@/lib/game-lifecycle";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  // Rescore uses the cached scorecard — no CricAPI hit. The scorecard,
  // picks, impact subs, and bowler designations are all already in Supabase
  // by the time an admin clicks Rescore; this button exists to re-run the
  // pure scoring function after a rule change or pick edit. If the admin
  // wants fresh CricAPI data, they can hit "Refresh live" on the game card.
  //
  // `requireFinal: false` lets this work on locked (in-progress) games too.
  // `allowRescore: true` bypasses the already-scored short-circuit.
  const result = await scoreGame(id, {
    forceScorecardRefresh: false,
    requireFinal: false,
    allowRescore: true,
  });

  if (!result.scored) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, winnerUserId: result.winnerUserId });
}
