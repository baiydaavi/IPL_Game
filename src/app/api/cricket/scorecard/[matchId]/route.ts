import { NextResponse } from "next/server";

import { getCachedScorecard } from "@/lib/cricket-cache";
import { getEffectiveUser } from "@/lib/effective-user";

/**
 * GET /api/cricket/scorecard/[matchId]
 *
 * Returns the cached scorecard for a match (may be partial if live).
 * Authed users only.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;

  const user = await getEffectiveUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { scorecard, isFinal } = await getCachedScorecard(matchId);
    return NextResponse.json({ scorecard, isFinal });
  } catch (err) {
    console.error("[/api/cricket/scorecard]", matchId, err);
    return NextResponse.json(
      { error: "upstream_failed", message: (err as Error).message },
      { status: 502 },
    );
  }
}
