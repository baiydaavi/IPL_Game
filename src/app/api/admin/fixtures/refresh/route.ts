import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { refreshFixtures } from "@/lib/cricket-cache";

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const result = await refreshFixtures();
    return NextResponse.json({ ok: true, count: result.upserted });
  } catch (err) {
    console.error("[admin/fixtures/refresh] failed", err);
    return NextResponse.json(
      { error: "upstream_failed", message: (err as Error).message },
      { status: 502 },
    );
  }
}
