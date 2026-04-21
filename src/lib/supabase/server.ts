import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase client bound to the logged-in user's cookies. Use this inside
 * server components, route handlers, and server actions whenever you want
 * RLS to apply.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // `cookies()` in a read-only context (e.g. pure server component)
            // will throw on set. That's fine — sessions get refreshed next
            // time a mutating handler runs.
          }
        },
      },
    },
  );
}

/**
 * Service-role Supabase client. Bypasses RLS entirely. Use ONLY in:
 *   - cron handlers writing to `*_cached` tables
 *   - server routes that perform turn validation on `/api/games/*`
 *   - admin overrides
 *
 * Never call this from a page/server-component where the request is
 * user-driven; prefer `createSupabaseServerClient()` so RLS enforces auth.
 */
export function createSupabaseServiceClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}
