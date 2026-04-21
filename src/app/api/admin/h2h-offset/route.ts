import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/h2h-offset
 * Body: { offset: Record<user_id, wins> }
 *
 * Replaces the `h2h_offset` JSON on the app_config singleton row. These
 * wins are added to the in-app H2H tally (see `getHeadToHead`). Typical
 * use-case: baking in a pre-app score history (e.g. WhatsApp-era tally).
 *
 * Only admins (or identity-bypass mode users) can call.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    offset?: Record<string, unknown>;
  };
  if (!body.offset || typeof body.offset !== "object") {
    return NextResponse.json({ error: "missing_offset" }, { status: 400 });
  }

  // Coerce all values to non-negative integers. Drop invalid entries rather
  // than 400 — admin UI is trusted but we still want the DB clean.
  const sanitized: Record<string, number> = {};
  for (const [userId, val] of Object.entries(body.offset)) {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) continue;
    sanitized[userId] = Math.floor(n);
  }

  const admin = createSupabaseServiceClient();
  const { error } = await admin
    .from("app_config")
    .upsert(
      {
        key: "singleton",
        h2h_offset: sanitized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  if (error) {
    console.error("[h2h-offset] upsert failed", error);
    return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, offset: sanitized });
}
