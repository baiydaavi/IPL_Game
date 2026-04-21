import { NextResponse } from "next/server";

import {
  DEMO_COOKIE,
  DEMO_EMAIL_P1,
  DEMO_EMAIL_P2,
  isIdentityBypassMode,
} from "@/lib/demo";

/**
 * POST /api/demo/switch
 * Body: { email: "avinash@demo.local" | "sanchit@demo.local" }
 *
 * Sets the `demo_user` cookie so the next request sees the caller as the
 * selected identity. Available in DEMO_MODE and BETA_MODE.
 */
export async function POST(request: Request) {
  if (!isIdentityBypassMode()) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  if (body.email !== DEMO_EMAIL_P1 && body.email !== DEMO_EMAIL_P2) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, email: body.email });
  res.cookies.set(DEMO_COOKIE, body.email, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
