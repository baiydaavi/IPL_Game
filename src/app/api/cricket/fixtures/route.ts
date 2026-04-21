import { NextResponse } from "next/server";

import { getCachedFixtures } from "@/lib/cricket-cache";
import { getEffectiveUser } from "@/lib/effective-user";

/**
 * GET /api/cricket/fixtures
 *
 * Returns cached upcoming IPL fixtures. Any authed user may call this.
 * Read-through: refreshes from upstream if the cache is stale.
 *
 * Query:
 *   ?refresh=1   Force upstream refresh (rate-limited; primarily for admin).
 */
export async function GET(request: Request) {
  const user = await getEffectiveUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    const fixtures = await getCachedFixtures({ forceRefresh });
    return NextResponse.json({ fixtures });
  } catch (err) {
    console.error("[/api/cricket/fixtures] failed", err);
    return NextResponse.json(
      { error: "upstream_failed", message: (err as Error).message },
      { status: 502 },
    );
  }
}
