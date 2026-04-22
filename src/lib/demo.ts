import "server-only";

import { cookies } from "next/headers";

import type { UserRow } from "@/lib/db-types";
import {
  DEMO_MATCH_ID,
  DEMO_SQUADS,
  demoFixture,
  type DemoScenario,
} from "@/lib/demo-fixtures";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Demo mode lets you click through the whole app without real magic-link
 * signin and without any CricAPI calls. Gated behind `DEMO_MODE=1` so it
 * can't accidentally activate in production.
 *
 * What it does:
 *   - Seeds two fake users (Player A, Player B) + a `demo_user` cookie that
 *     picks which one you're "logged in" as.
 *   - Seeds a fake fixture (CSK vs MI) + fake squads into the cache tables
 *     so the home-state resolver finds them.
 *   - Stores a shared `demo_state` row that the cricket-cache + scorecard
 *     fetch helpers consult: it decides whether the match is
 *     not-started/live/finished and which scenario's scorecard to serve.
 *
 * What it does NOT do: hit CricAPI. When DEMO_MODE=1, the fetch helpers in
 * `cricket.ts` short-circuit to the in-memory presets.
 */

export const DEMO_COOKIE = "demo_user";

/**
 * Stable UUIDs so seeding is idempotent. The auth.admin.createUser API
 * requires a real auth user, so we generate these at seed time rather
 * than hardcoding (Supabase rejects arbitrary UUIDs for new auth users).
 * We look up the demo user ids by email instead.
 */
export const DEMO_EMAIL_P1 = "avinash@demo.local";
export const DEMO_EMAIL_P2 = "sanchit@demo.local";

export const DEMO_USERS = [
  { email: DEMO_EMAIL_P1, display_name: "Player A" },
  { email: DEMO_EMAIL_P2, display_name: "Player B" },
] as const;

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/**
 * True whenever we're bypassing real auth. Today that only means demo mode;
 * kept as its own helper so identity-layer call sites read clearly and so
 * any future bypass mode can be added in one place.
 */
export function isIdentityBypassMode(): boolean {
  return isDemoMode();
}

/** Read the `demo_user` cookie; fall back to P1 (Avinash) on first visit. */
export async function getDemoActiveEmail(): Promise<string> {
  const jar = await cookies();
  const value = jar.get(DEMO_COOKIE)?.value;
  if (value === DEMO_EMAIL_P2) return DEMO_EMAIL_P2;
  return DEMO_EMAIL_P1;
}

/**
 * Look up the demo user (P1 by default, P2 if the cookie says so) and
 * return a UserRow. Assumes the seeder has run; callers should invoke
 * `ensureDemoSeed()` before this.
 */
export async function getDemoCurrentUser(): Promise<UserRow | null> {
  const activeEmail = await getDemoActiveEmail();
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("users")
    .select("id, email, display_name, created_at")
    .eq("email", activeEmail)
    .maybeSingle();
  return (data as UserRow | null) ?? null;
}

export type DemoSeedResult = {
  userP1Id: string;
  userP2Id: string;
};

export type DemoMatchState = "not-started" | "live" | "finished";

export type DemoStateRow = {
  key: "singleton";
  match_state: DemoMatchState;
  scenario: DemoScenario;
  updated_at: string;
};

/**
 * Idempotent seeder for demo mode. Creates:
 *   - The two demo auth users (Avinash, Sanchit) if missing.
 *   - The single demo_state row (defaulted to 'not-started' / 'normal').
 *   - The demo fixture in matches_cached and the demo squads in
 *     squads_cached, so home-state and the draft UI can find them.
 *
 * Safe to call on every request — it's a handful of cheap upserts.
 *
 * We refresh the match's `date` and `status` fields on every call based on
 * the current demo_state, so flipping match_state in the demo panel actually
 * moves the fixture forward/backward in time.
 */
/**
 * Seed (or re-read) the two fake users. Used by demo mode.
 */
async function ensureDemoUsers(): Promise<Record<string, string>> {
  const admin = createSupabaseServiceClient();
  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    // Fast path: public.users row already present. Reconcile the display
    // name in case DEMO_USERS was updated after this row was first seeded
    // (e.g. renaming "Avinash" -> "Player A").
    const existing = await admin
      .from("users")
      .select("id, display_name")
      .eq("email", u.email)
      .maybeSingle();
    if (existing.data?.id) {
      userIds[u.email] = existing.data.id;
      if (existing.data.display_name !== u.display_name) {
        await admin
          .from("users")
          .update({ display_name: u.display_name })
          .eq("id", existing.data.id);
      }
      continue;
    }

    // No public.users row. Try to create a fresh auth user (which will
    // auto-create the public.users row via the handle_new_user trigger).
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
      user_metadata: { display_name: u.display_name },
      password: crypto.randomUUID(),
    });
    if (!error && data.user) {
      userIds[u.email] = data.user.id;
      continue;
    }

    // createUser failed. The most common reason is that the auth user
    // exists but the public.users mirror row was dropped (e.g. after a
    // one-off user migration that re-pointed game data to real-auth
    // users and deleted the beta public.users rows). Look up the
    // existing auth user's id and create a public.users row using THAT
    // id — public.users.id is a FK to auth.users.id, so we can't just
    // invent a random UUID.
    if (error && (error as { code?: string }).code === "email_exists") {
      const { data: authList } = await admin.auth.admin.listUsers();
      const authUser = authList?.users.find((x) => x.email === u.email);
      if (authUser) {
        await admin.from("users").upsert(
          { id: authUser.id, email: u.email, display_name: u.display_name },
          { onConflict: "id" },
        );
        userIds[u.email] = authUser.id;
        continue;
      }
    }

    // Truly unexpected — log once and keep going so we don't spam the
    // console on every request.
    console.warn("[demo seed] could not resolve demo user", u.email, error);
  }
  return userIds;
}

export async function ensureDemoSeed(): Promise<DemoSeedResult> {
  const admin = createSupabaseServiceClient();
  const userIds = await ensureDemoUsers();

  // Ensure the shared demo_state row exists.
  await admin
    .from("demo_state")
    .upsert(
      { key: "singleton", match_state: "not-started", scenario: "normal" },
      { onConflict: "key", ignoreDuplicates: true },
    );

  // Read current state so the seeded fixture date matches.
  const state = await readDemoState(admin);

  // Seed / refresh the fake fixture. Date shifts based on match_state.
  const fixture = demoFixture(state.match_state);
  await admin.from("matches_cached").upsert(
    {
      match_id: fixture.id,
      date: fixture.dateTimeGMT,
      team_a: fixture.teams[0],
      team_b: fixture.teams[1],
      status: fixture.status,
      venue: fixture.venue,
      raw_json: fixture,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );

  // Seed squads (static). Upsert so a reset doesn't wipe them.
  await admin.from("squads_cached").upsert(
    {
      match_id: DEMO_MATCH_ID,
      raw_json: DEMO_SQUADS,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );

  return {
    userP1Id: userIds[DEMO_EMAIL_P1]!,
    userP2Id: userIds[DEMO_EMAIL_P2]!,
  };
}

/**
 * Read the singleton demo_state row, creating it on first call if missing.
 * Always returns safe defaults so demo flows work even before the panel is
 * interacted with.
 */
export async function readDemoState(
  admin = createSupabaseServiceClient(),
): Promise<DemoStateRow> {
  const { data } = await admin
    .from("demo_state")
    .select("key, match_state, scenario, updated_at")
    .eq("key", "singleton")
    .maybeSingle();
  if (data) return data as DemoStateRow;

  const fallback: DemoStateRow = {
    key: "singleton",
    match_state: "not-started",
    scenario: "normal",
    updated_at: new Date().toISOString(),
  };
  await admin.from("demo_state").upsert(
    {
      key: "singleton",
      match_state: fallback.match_state,
      scenario: fallback.scenario,
    },
    { onConflict: "key" },
  );
  return fallback;
}

/** Update the singleton demo_state row. Used by /api/demo/simulate. */
export async function writeDemoState(
  patch: Partial<Pick<DemoStateRow, "match_state" | "scenario">>,
): Promise<DemoStateRow> {
  const admin = createSupabaseServiceClient();
  const current = await readDemoState(admin);
  const next: Pick<DemoStateRow, "match_state" | "scenario"> = {
    match_state: patch.match_state ?? current.match_state,
    scenario: patch.scenario ?? current.scenario,
  };
  await admin
    .from("demo_state")
    .upsert(
      { key: "singleton", ...next, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  return { key: "singleton", ...next, updated_at: new Date().toISOString() };
}
