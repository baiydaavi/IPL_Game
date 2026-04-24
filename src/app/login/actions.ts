"use server";

import { headers } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeDisplayName, normalizeEmail } from "@/lib/user-profile";

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

  // Re-normalize on the server so bypassing the client form (curl, older
  // tab, etc.) can't smuggle a differently-cased email or multi-word name
  // past our duplicate-prevention invariants. Callers that already ran
  // these helpers will get identical strings back.
  const normalizedEmail = normalizeEmail(email);
  const normalizedDisplayName = normalizeDisplayName(displayName);
  if (!normalizedEmail || !normalizedDisplayName) {
    return { ok: false, error: "Email and name are required." };
  }

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
  redirectTo.searchParams.set("display_name", normalizedDisplayName);

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: redirectTo.toString(),
      shouldCreateUser: true,
      // The `handle_new_user` trigger reads this on first sign-up and uses
      // it as the initial display_name instead of the email local-part.
      data: { display_name: normalizedDisplayName },
    },
  });

  if (error) {
    console.error("[login] signInWithOtp failed", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
