import "server-only";

import type { UserRow } from "@/lib/db-types";
import { getEffectiveUser } from "@/lib/effective-user";

/**
 * Return the logged-in user's public profile, or `null` if not signed in.
 * Safe to call from server components — this is the canonical way to fetch
 * the current user.
 *
 * Thin wrapper around `getEffectiveUser()` so demo mode works transparently.
 */
export async function getCurrentUser(): Promise<UserRow | null> {
  return await getEffectiveUser();
}
