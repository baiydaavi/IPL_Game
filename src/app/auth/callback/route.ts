import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase magic-link callback.
 *
 * The email link lands here with `?code=...&next=/path`. We exchange the code
 * for a session cookie and redirect to `next` (defaults to `/`).
 *
 * If there's no code or the exchange fails, bounce back to /login with an
 * error flag.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const displayName = url.searchParams.get("display_name");

  if (!code) {
    const bounce = new URL("/login", url.origin);
    bounce.searchParams.set("error", "Missing sign-in code.");
    return NextResponse.redirect(bounce);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchange failed", error);
    const bounce = new URL("/login", url.origin);
    bounce.searchParams.set("error", "Sign-in link was invalid or expired.");
    return NextResponse.redirect(bounce);
  }

  // First-time users get their display_name from the DB trigger
  // (raw_user_meta_data.display_name). Returning users already have a row,
  // so we update it here if they typed a new name on this login.
  if (displayName && displayName.trim()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("users")
        .update({ display_name: displayName.trim() })
        .eq("id", user.id);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
