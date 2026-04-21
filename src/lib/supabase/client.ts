"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses the public anon key; all access is governed
 * by Row-Level Security policies in `supabase/migrations/0001_init.sql`.
 *
 * Returns `null` if the public env vars aren't available (e.g. dev server
 * wasn't restarted after editing `.env.local`). Callers MUST handle the
 * null case — for Realtime-only uses they can simply skip subscribing.
 *
 * Call this inside client components / hooks only.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    if (typeof window !== "undefined") {
      console.warn(
        "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in the browser bundle. Restart the dev server after editing .env.local.",
      );
    }
    return null;
  }
  return createBrowserClient(url, anon);
}
