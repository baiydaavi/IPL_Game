"use server";

import { headers } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SendMagicLinkResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Send a magic-link email via Supabase Auth. The user clicks the link in their
 * inbox, lands on `/auth/callback`, and we exchange the code for a session
 * cookie.
 */
export async function sendMagicLink({
  email,
  displayName,
  next,
}: {
  email: string;
  displayName: string;
  next?: string;
}): Promise<SendMagicLinkResult> {
  const supabase = await createSupabaseServerClient();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host) {
    return { ok: false, error: "Could not resolve site origin." };
  }
  const origin = `${proto}://${host}`;
  const redirectTo = new URL("/auth/callback", origin);
  if (next) redirectTo.searchParams.set("next", next);
  // Pass display_name through the callback so returning users get their
  // `public.users.display_name` updated after the session is exchanged.
  redirectTo.searchParams.set("display_name", displayName);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo.toString(),
      shouldCreateUser: true,
      // The `handle_new_user` trigger reads this on first sign-up and uses
      // it as the initial display_name instead of the email local-part.
      data: { display_name: displayName },
    },
  });

  if (error) {
    console.error("[login] signInWithOtp failed", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
