import "server-only";

import { getCachedFixtures } from "@/lib/cricket-cache";
import type {
  BowlerDesignationRow,
  GameMemberRow,
  GameRow,
  ImpactSubRow,
  PickRow,
  ScoreRow,
  UserRow,
} from "@/lib/db-types";
import { isIdentityBypassMode } from "@/lib/demo";
import type { CachedFixture } from "@/lib/fixtures";
import { lockIfReady, scoreGame } from "@/lib/game-lifecycle";
import type { HomeState, HomeView } from "@/lib/home-state-types";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Resolves the home-screen view for the logged-in user.
 *
 * The top of the home page shows one card per IPL fixture in the "today
 * window" (kickoff in [-6h, +24h] of now), ordered by kickoff time. On
 * double-header days this produces two cards, so the player can draft
 * the evening match the night before without waiting for the afternoon
 * match to finish. `HomeState` still drives each individual card.
 *
 * Downstream UI switches on `state.kind`; types live in
 * `home-state-types.ts` so client components can import them without the
 * server-only transitive.
 */

export type { HomeState, HomeView } from "@/lib/home-state-types";

/**
 * Fixtures that belong on today's home screen: any fixture whose kickoff
 * is within the window [-6h, +24h] of now. Sorted ascending by kickoff.
 */
function pickTodaysFixtures(fixtures: CachedFixture[]): CachedFixture[] {
  const now = Date.now();
  const windowStart = now - 6 * 60 * 60 * 1000;
  const windowEnd = now + 24 * 60 * 60 * 1000;

  return fixtures
    .filter((f) => {
      const t = new Date(f.date).getTime();
      return t >= windowStart && t <= windowEnd;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function isMatchLive(fixture: CachedFixture, game: GameRow): boolean {
  if (game.status !== "locked") return false;
  const start = new Date(fixture.date).getTime();
  const now = Date.now();
  return now >= start && now <= start + 5 * 60 * 60 * 1000;
}

function isPreMatch(fixture: CachedFixture, game: GameRow): boolean {
  if (game.status !== "locked") return false;
  return Date.now() < new Date(fixture.date).getTime();
}

/**
 * Resolve the full home view: all today-window fixture states plus the
 * upcoming list.
 */
export async function getHomeView(): Promise<HomeView> {
  const supabase = isIdentityBypassMode()
    ? createSupabaseServiceClient()
    : await createSupabaseServerClient();

  const fixtures = await getCachedFixtures().catch((err) => {
    console.error("[getHomeView] fixtures read failed", err);
    return [] as CachedFixture[];
  });

  const todayFixtures = pickTodaysFixtures(fixtures);
  const todayIds = new Set(todayFixtures.map((f) => f.match_id));
  const now = Date.now();

  // "Upcoming" = future fixtures that aren't already represented by a
  // today-card. Keeps the list tight.
  const upcoming = fixtures
    .filter((f) => {
      if (todayIds.has(f.match_id)) return false;
      return new Date(f.date).getTime() > now;
    })
    .slice(0, 3);

  if (todayFixtures.length === 0) {
    return {
      todays: [{ kind: "no-match-today" }],
      upcoming,
    };
  }

  // Resolve each today-fixture's card state independently. One DB round
  // trip per fixture; double-headers pay 2x, which is fine at IPL scale.
  const states = await Promise.all(
    todayFixtures.map((f) => resolveFixtureState(supabase, f)),
  );

  return { todays: states, upcoming };
}

async function resolveFixtureState(
  supabase:
    | Awaited<ReturnType<typeof createSupabaseServerClient>>
    | ReturnType<typeof createSupabaseServiceClient>,
  fixture: CachedFixture,
): Promise<HomeState> {
  const { data: gameRow } = await supabase
    .from("games")
    .select("*")
    .eq("match_id", fixture.match_id)
    .maybeSingle();

  if (!gameRow) {
    return { kind: "match-today-no-draft", fixture };
  }

  let game = gameRow as GameRow;

  // Forfeit auto-advance: if the draft is still open but kickoff has
  // passed, lock (which records the forfeiting user) and immediately
  // score as a forfeit. Safe to run on every visit — lockIfReady is a
  // no-op if the game is already locked, and scoreGame is a no-op if
  // it's already scored.
  const kickoffMs = new Date(fixture.date).getTime();
  if (game.status === "drafting" && Date.now() >= kickoffMs) {
    const lockResult = await lockIfReady(game.id);
    if (lockResult.locked && lockResult.forfeitUserId) {
      await scoreGame(game.id, { requireFinal: false });
    }
    // Re-read the row after any transition so the UI reflects the
    // now-scored state rather than the stale drafting snapshot.
    const { data: refreshed } = await supabase
      .from("games")
      .select("*")
      .eq("id", game.id)
      .maybeSingle();
    if (refreshed) game = refreshed as GameRow;
  }

  const [
    { data: memberRows },
    { data: pickRows },
    { data: scoreRows },
    { data: bowlerRows },
    { data: impactRows },
  ] = await Promise.all([
    supabase
      .from("game_members")
      .select("game_id, user_id, slot, users:users!inner(id, email, display_name, created_at)")
      .eq("game_id", game.id),
    supabase
      .from("picks")
      .select("*")
      .eq("game_id", game.id)
      .order("turn_index", { ascending: true }),
    supabase.from("scores").select("*").eq("game_id", game.id),
    supabase.from("bowler_designations").select("*").eq("game_id", game.id),
    supabase.from("impact_subs").select("*").eq("game_id", game.id),
  ]);

  const members = (memberRows ?? []).map((m) => ({
    game_id: m.game_id,
    user_id: m.user_id,
    slot: m.slot as GameMemberRow["slot"],
    user: (Array.isArray(m.users) ? m.users[0] : m.users) as UserRow,
  }));
  const picks = (pickRows ?? []) as PickRow[];
  const scores = (scoreRows ?? []) as ScoreRow[];
  const bowlerDesignations = (bowlerRows ?? []) as BowlerDesignationRow[];
  const impactSubs = (impactRows ?? []) as ImpactSubRow[];

  const baseBundle = { game, members, picks, bowlerDesignations, impactSubs };

  if (game.status === "drafting") {
    return { kind: "drafting", fixture, game: baseBundle };
  }

  if (game.status === "locked") {
    if (isPreMatch(fixture, game)) {
      return { kind: "locked-pre-match", fixture, game: baseBundle };
    }
    if (isMatchLive(fixture, game)) {
      return {
        kind: "match-live",
        fixture,
        game: { ...baseBundle, scores },
      };
    }
  }

  // Fall-through: either `status = 'scored'` or a `locked` game whose
  // match has ended and is awaiting the next scorecards cron — either
  // way we show the finished view.
  return {
    kind: "match-finished",
    fixture,
    game: { ...baseBundle, scores },
  };
}
