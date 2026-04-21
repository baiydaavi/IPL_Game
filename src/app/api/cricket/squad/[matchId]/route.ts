import { NextResponse } from "next/server";

import { getCachedSquad } from "@/lib/cricket-cache";
import { getEffectiveUser } from "@/lib/effective-user";

/**
 * GET /api/cricket/squad/[matchId]
 *
 * Returns the cached squad for a match. Authed users only.
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
    const squad = await getCachedSquad(matchId);
    return NextResponse.json({ squad });
  } catch (err) {
    console.error("[/api/cricket/squad]", matchId, err);
    return NextResponse.json(
      { error: "upstream_failed", message: (err as Error).message },
      { status: 502 },
    );
  }
}
