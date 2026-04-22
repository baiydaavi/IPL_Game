import "server-only";

import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin-auth";
import { isIdentityBypassMode } from "@/lib/demo";
import { getEffectiveUser } from "@/lib/effective-user";

/**
 * Shared auth guard for all /api/admin/* routes. Returns `null` when the
 * caller is a valid admin, or a NextResponse to return if not.
 *
 * In demo mode every user is treated as an admin so the /admin UI works.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const user = await getEffectiveUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isIdentityBypassMode()) return null;
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
