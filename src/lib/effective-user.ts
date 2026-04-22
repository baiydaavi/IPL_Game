import "server-only";

import type { UserRow } from "@/lib/db-types";
import {
  ensureDemoSeed,
  getDemoCurrentUser,
  isDemoMode,
} from "@/lib/demo";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Return the identity of the current caller. Prefers `DEMO_MODE` when set
 * (returns the demo-cookie user) and otherwise falls back to the real
 * Supabase Auth session.
 *
 * All auth-gated routes should call this instead of `supabase.auth.getUser()`
 * directly so demo mode works transparently.
 */
export async function getEffectiveUser(): Promise<UserRow | null> {
  if (isDemoMode()) {
    await ensureDemoSeed();
    return await getDemoCurrentUser();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, display_name, created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[getEffectiveUser] profile lookup failed", error);
    return null;
  }
  if (data) return data as UserRow;

  return {
    id: user.id,
    email: user.email ?? "",
    display_name:
      (user.user_metadata?.display_name as string | undefined) ?? user.email ?? "Player",
    created_at: user.created_at ?? new Date().toISOString(),
  };
}
