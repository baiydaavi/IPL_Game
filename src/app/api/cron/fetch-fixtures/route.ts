import { NextResponse } from "next/server";

import { refreshFixtures } from "@/lib/cricket-cache";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Cron: fetch IPL fixtures from CricketData and refresh the cache.
 *
 * Scheduled by `vercel.json` twice a day (morning + evening UTC).
 * Cost: 1 CricketData hit per invocation.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshFixtures();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron fetch-fixtures] failed", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
