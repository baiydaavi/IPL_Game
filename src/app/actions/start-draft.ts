"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getCachedSquad } from "@/lib/cricket-cache";
import type { GameRow, UserRow } from "@/lib/db-types";
import { isIdentityBypassMode } from "@/lib/demo";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export type StartDraftResult =
  | { ok: true; gameId: string }
  | { ok: false; error: string };

/**
 * Start a new draft for the given IPL match.
 *
 * Semantics (v1, 2-player app):
 *   - Caller must be authed.
 *   - We auto-add both users in the `users` table as members. If there's
 *     only one user so far, the game can't start and we surface a friendly
 *     error.
 *   - First picker is random for the very first game, otherwise the winner
 *     of the most recent `scored` game.
 *   - Only one game allowed per match (enforced by a DB unique constraint).
 *   - As a side-effect, we warm the squad cache so the draft UI has data
 *     when it loads.
 */
export async function startDraft({
  matchId,
}: {
  matchId: string;
}): Promise<StartDraftResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };

  // In demo mode there's no user-cookie session, so RLS-authed queries on
  // `users`/`matches_cached` would return empty. Use the service client for
  // the read-side of this action in that case.
  const supabase = isIdentityBypassMode()
    ? createSupabaseServiceClient()
    : await createSupabaseServerClient();

  // Short-circuit if a game already exists for this match.
  {
    const { data: existing } = await supabase
      .from("games")
      .select("id")
      .eq("match_id", matchId)
      .maybeSingle();
    if (existing) {
      revalidatePath("/");
      return { ok: true, gameId: existing.id };
    }
  }

  // Look up the match to make sure it's in the cache (the UI only offers
  // cached fixtures, but this defends against stale client state).
  {
    const { data: match } = await supabase
      .from("matches_cached")
      .select("match_id")
      .eq("match_id", matchId)
      .maybeSingle();
    if (!match) {
      return {
        ok: false,
        error: "That match isn't in the cache. Wait for the next fixtures refresh.",
      };
    }
  }

  // Resolve the two players. For v1 we require exactly two users to exist.
  const { data: allUsers, error: usersError } = await supabase
    .from("users")
    .select("id, email, display_name, created_at")
    .order("created_at", { ascending: true });

  if (usersError) {
    console.error("[startDraft] users lookup failed", usersError);
    return { ok: false, error: "Could not look up players." };
  }

  // Filter the users table down to the cohort that matches the current
  // run mode. In demo mode we only care about the seeded @demo.local
  // accounts; in normal mode we ignore them (they're leftover seed rows
  // that would otherwise trip the "two players only" guard).
  const allUserRows = (allUsers ?? []) as UserRow[];
  const inDemo = isIdentityBypassMode();
  const isDemoEmail = (email: string | null) =>
    typeof email === "string" && email.endsWith("@demo.local");
  const users = allUserRows.filter((u) =>
    inDemo ? isDemoEmail(u.email) : !isDemoEmail(u.email),
  );

  if (users.length < 2) {
    return {
      ok: false,
      error: "Waiting for your friend to sign in at least once before we can start a game.",
    };
  }
  if (users.length > 2) {
    // Heads-up: we explicitly scoped this app to two users.
    return {
      ok: false,
      error: "This app is configured for two players only. Remove extra accounts from the users table.",
    };
  }

  const otherUser = users.find((u) => u.id !== me.id);
  if (!otherUser) {
    return { ok: false, error: "Could not find the other player." };
  }

  // Determine first picker.
  const firstPickerUserId = await resolveFirstPicker({
    players: [me, otherUser],
  });

  // All writes happen via the service role so we can insert into games +
  // game_members atomically without fighting RLS.
  const admin = createSupabaseServiceClient();

  const { data: inserted, error: insertError } = await admin
    .from("games")
    .insert({
      match_id: matchId,
      first_picker_user_id: firstPickerUserId,
      status: "drafting",
    })
    .select("id, match_id, status, first_picker_user_id, winner_user_id, created_at, locked_at, scored_at")
    .single();

  if (insertError || !inserted) {
    console.error("[startDraft] insert games failed", insertError);
    return { ok: false, error: insertError?.message ?? "Could not create game." };
  }

  const game = inserted as GameRow;

  // Slot assignment: first picker is P1.
  const firstPicker = firstPickerUserId === me.id ? me : otherUser;
  const secondPicker = firstPicker.id === me.id ? otherUser : me;
  const members = [
    { game_id: game.id, user_id: firstPicker.id, slot: "P1" as const },
    { game_id: game.id, user_id: secondPicker.id, slot: "P2" as const },
  ];

  const { error: membersError } = await admin.from("game_members").insert(members);
  if (membersError) {
    console.error("[startDraft] insert members failed", membersError);
    // Best-effort cleanup; don't block the user on this.
    await admin.from("games").delete().eq("id", game.id);
    return { ok: false, error: membersError.message };
  }

  // Warm the squad cache in the background so the draft UI has data to
  // render immediately. Swallow errors — the UI will retry on demand.
  getCachedSquad(matchId).catch((err) => {
    console.warn("[startDraft] squad warm-up failed", err);
  });

  revalidatePath("/");
  return { ok: true, gameId: game.id };
}

/**
 * Pick the user ID that should draft first. Uses the winner of the most
 * recent `scored` game; falls back to a random choice for the very first
 * game of the app's life.
 */
async function resolveFirstPicker({
  players,
}: {
  players: UserRow[];
}): Promise<string> {
  const supabase = isIdentityBypassMode()
    ? createSupabaseServiceClient()
    : await createSupabaseServerClient();

  const { data: lastScored } = await supabase
    .from("games")
    .select("winner_user_id, scored_at")
    .eq("status", "scored")
    .not("winner_user_id", "is", null)
    .order("scored_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastScored?.winner_user_id) {
    // Verify the winner is still one of the two current users; if not, fall
    // through to random.
    if (players.some((p) => p.id === lastScored.winner_user_id)) {
      return lastScored.winner_user_id;
    }
  }

  const idx = Math.random() < 0.5 ? 0 : 1;
  return players[idx].id;
}
