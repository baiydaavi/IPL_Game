import "server-only";

import type {
  CricApiMatchSummary,
  CricApiScorecard,
  CricApiSquadEntry,
} from "@/lib/cricket";
import {
  fetchIplFixtures,
  fetchMatchScorecard,
  fetchMatchSquad,
} from "@/lib/cricket";
import type { CachedFixture } from "@/lib/fixtures";
import { iplTeamCode } from "@/lib/ipl-teams";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type { CachedFixture };

/**
 * Read-through cache helpers around CricketData.
 *
 * Each helper:
 *   1. Checks Supabase for a fresh cached row.
 *   2. Falls back to the external API if stale/missing.
 *   3. Writes the response back to Supabase.
 *   4. Returns the parsed value.
 *
 * Callers never touch the cricket client directly. These run server-side
 * only and use the service-role Supabase key to write.
 */

const FIXTURES_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FIXTURES_PROACTIVE_REFRESH_MS = 60 * 60 * 1000; // 1 hour — see getCachedFixtures
const SQUAD_TTL_MS = Number.POSITIVE_INFINITY; // squads don't really change
// 2 min during live play. With the paid CricketData tier (2000 hits/day) a
// 60s client poll stays well inside budget and users get fresh live numbers.
const SCORECARD_LIVE_TTL_MS = 2 * 60 * 1000;
const SCORECARD_FINAL_TTL_MS = Number.POSITIVE_INFINITY;

function isFresh(fetchedAt: string, ttlMs: number): boolean {
  if (!Number.isFinite(ttlMs)) return true;
  const fetchedMs = new Date(fetchedAt).getTime();
  return Date.now() - fetchedMs < ttlMs;
}

/**
 * In demo mode the "upstream" is a pure function of demo_state, so every
 * cached copy is potentially stale the moment the demo panel flips a
 * toggle. We bypass TTL entirely — the `fetch*` helpers return instantly
 * anyway and write-back keeps DB + returned value consistent.
 */
function demoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function normalizeFixture(m: CricApiMatchSummary): CachedFixture & {
  raw_json: CricApiMatchSummary;
} {
  const [a, b] = m.teams;
  return {
    match_id: m.id,
    date: m.dateTimeGMT,
    team_a: a ?? "",
    team_b: b ?? "",
    team_a_code: a ? iplTeamCode(a) : "",
    team_b_code: b ? iplTeamCode(b) : "",
    status: m.status ?? null,
    venue: m.venue ?? null,
    raw_json: m,
  };
}

/**
 * Get cached upcoming IPL fixtures (including today) ordered by date.
 *
 * Refresh policy (2000-hit/day paid CricketData tier):
 *   - forceRefresh=true  → always refresh synchronously.
 *   - cache >6h old      → refresh synchronously (hard freshness boundary).
 *   - cache >1h old      → fire-and-forget background refresh, return the
 *                          cached rows immediately. Catches late upstream
 *                          updates (e.g. actual kickoff time landing in
 *                          series_info) without slowing down the page.
 *   - cache ≤1h old      → return cached rows, no upstream call.
 */
export async function getCachedFixtures(options: {
  forceRefresh?: boolean;
} = {}): Promise<CachedFixture[]> {
  const supabase = createSupabaseServiceClient();

  if (options.forceRefresh && !demoMode()) {
    await refreshFixtures(supabase);
    return await readFixtures(supabase);
  }

  if (demoMode()) {
    await refreshFixtures(supabase);
    return await readFixtures(supabase);
  }

  const { data: latest } = await supabase
    .from("matches_cached")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isHardFresh = latest?.fetched_at && isFresh(latest.fetched_at, FIXTURES_TTL_MS);
  if (!isHardFresh) {
    await refreshFixtures(supabase);
    return await readFixtures(supabase);
  }

  // Cache is inside the 6h hard window but may be stale enough to warrant
  // a proactive refresh (>1h old). Do it in the background — the user
  // gets current fixtures right now; the next visit gets the newer data.
  const isSoftFresh =
    latest?.fetched_at && isFresh(latest.fetched_at, FIXTURES_PROACTIVE_REFRESH_MS);
  if (!isSoftFresh) {
    void refreshFixtures(supabase).catch((err) => {
      console.warn("[getCachedFixtures] background refresh failed", err);
    });
  }

  return await readFixtures(supabase);
}

async function readFixtures(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
): Promise<CachedFixture[]> {
  const twoDaysAgoIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("matches_cached")
    .select("match_id, date, team_a, team_b, status, venue")
    .gte("date", twoDaysAgoIso)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    team_a_code: iplTeamCode(row.team_a),
    team_b_code: iplTeamCode(row.team_b),
  }));
}

/**
 * Force a fixtures refresh from upstream and write all rows to the cache.
 * Idempotent: uses upsert on primary key.
 */
export async function refreshFixtures(
  supabase = createSupabaseServiceClient(),
): Promise<{ upserted: number }> {
  const upstream = await fetchIplFixtures();
  if (upstream.length === 0) return { upserted: 0 };

  const rows = upstream.map((m) => {
    const n = normalizeFixture(m);
    return {
      match_id: n.match_id,
      date: n.date,
      team_a: n.team_a,
      team_b: n.team_b,
      status: n.status,
      venue: n.venue,
      raw_json: n.raw_json,
      fetched_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase.from("matches_cached").upsert(rows, {
    onConflict: "match_id",
  });
  if (error) throw error;

  return { upserted: rows.length };
}

// ---------------------------------------------------------------------------
// Season summary
// ---------------------------------------------------------------------------

/**
 * The IPL has 4 playoff matches every season (Qualifier 1, Eliminator,
 * Qualifier 2, Final). CricAPI's `series_info` endpoint only includes
 * the 70 league games in `matchList` for most of the season — the
 * playoff fixtures appear in the list only once the 4 playoff-bound
 * teams are known (usually 1–2 days before Qualifier 1). Until then we
 * pad the remaining-games count with this constant so the UI surfaces
 * the true "games left in the IPL" number.
 *
 * The moment ANY non-"Nth Match" row shows up in the cached list (i.e.
 * at least one playoff fixture is now in the schedule), we trust the
 * list and stop padding.
 *
 * Hardcoded because the API does not expose playoff counts separately.
 * Revisit only if the IPL changes its playoff format.
 */
const IPL_PLAYOFF_COUNT = 4;

/** Match names like "32nd Match, Indian Premier League 2026". */
const LEAGUE_MATCH_NAME_RE = /\b\d+\s*(?:st|nd|rd|th)\s+Match\b/i;

/**
 * Count how many IPL games are still to come this season (upcoming +
 * in-progress + yet-to-be-scheduled playoffs). Reads from the
 * already-cached `matches_cached` table, so this costs ZERO CricketData
 * API hits per call — as long as `getCachedFixtures()` has been called
 * elsewhere recently (which it is, on every home-page render).
 *
 * "Remaining" = rows whose upstream payload does NOT report matchEnded.
 * This correctly excludes rain-outs (CricAPI sets matchEnded=true on
 * washouts too) while still counting any live match as remaining.
 *
 * Playoff handling: if every row in the list is a numbered league match
 * ("Nth Match, Indian Premier League ..."), we add `IPL_PLAYOFF_COUNT`
 * to the count because CricAPI hasn't yet populated the 4 playoff
 * fixtures. Once at least one non-numbered row appears (Qualifier /
 * Eliminator / Final / etc.), we assume the list is complete and use it
 * as-is.
 *
 * Returns null if the cache is empty or the query fails — the caller
 * should treat that as "don't render the pill" rather than a hard error.
 */
export async function getLeagueGamesRemaining(): Promise<number | null> {
  const supabase = createSupabaseServiceClient();
  // The IPL season is ~70 rows — cheap to pull the whole `raw_json` slice
  // and count in JS. Avoids fragile PostgREST jsonb filter syntax.
  const { data, error } = await supabase
    .from("matches_cached")
    .select("raw_json");
  if (error) {
    console.warn("[getLeagueGamesRemaining] query failed", error);
    return null;
  }
  if (!data || data.length === 0) return null;

  let remaining = 0;
  let hasPlayoffRow = false;
  for (const row of data) {
    const raw = (row.raw_json ?? {}) as { matchEnded?: boolean; name?: string };
    const isLeagueName = LEAGUE_MATCH_NAME_RE.test(raw.name ?? "");
    if (!isLeagueName) hasPlayoffRow = true;
    if (raw.matchEnded !== true) remaining += 1;
  }

  // Pad with the known playoff count only while CricAPI hasn't added the
  // playoff fixtures yet. Once it has, the list is authoritative.
  if (!hasPlayoffRow) remaining += IPL_PLAYOFF_COUNT;

  return remaining;
}

// ---------------------------------------------------------------------------
// Squads
// ---------------------------------------------------------------------------

export async function getCachedSquad(matchId: string, options: {
  forceRefresh?: boolean;
} = {}): Promise<CricApiSquadEntry[]> {
  const supabase = createSupabaseServiceClient();

  if (!options.forceRefresh) {
    const { data } = await supabase
      .from("squads_cached")
      .select("raw_json, fetched_at")
      .eq("match_id", matchId)
      .maybeSingle();

    if (data && isFresh(data.fetched_at, SQUAD_TTL_MS)) {
      return data.raw_json as CricApiSquadEntry[];
    }
  }

  const upstream = await fetchMatchSquad(matchId);
  const { error } = await supabase.from("squads_cached").upsert(
    {
      match_id: matchId,
      raw_json: upstream,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
  if (error) throw error;
  return upstream;
}

// ---------------------------------------------------------------------------
// Scorecards
// ---------------------------------------------------------------------------

export async function getCachedScorecard(matchId: string, options: {
  forceRefresh?: boolean;
} = {}): Promise<{ scorecard: CricApiScorecard; isFinal: boolean }> {
  const supabase = createSupabaseServiceClient();

  if (!options.forceRefresh && !demoMode()) {
    const { data } = await supabase
      .from("scorecards_cached")
      .select("raw_json, is_final, fetched_at")
      .eq("match_id", matchId)
      .maybeSingle();

    if (data) {
      const ttl = data.is_final ? SCORECARD_FINAL_TTL_MS : SCORECARD_LIVE_TTL_MS;
      if (isFresh(data.fetched_at, ttl)) {
        const cached = data.raw_json as CricApiScorecard;
        // Reconcile on cache hit too — otherwise matches whose scorecards
        // were cached *before* the reconcile feature shipped (or final
        // matches, which we never re-fetch) would never pick up missing
        // squad players. Fire-and-forget; no upstream call involved.
        void reconcileSquadFromScorecard(supabase, matchId, cached).catch(
          (err) => {
            console.warn(
              "[getCachedScorecard] squad reconcile (cache hit) failed",
              matchId,
              err,
            );
          },
        );
        return {
          scorecard: cached,
          isFinal: data.is_final,
        };
      }
    }
  }

  const upstream = await fetchMatchScorecard(matchId);
  const isFinal = upstream.matchEnded === true || /ended/i.test(upstream.status ?? "");

  const { error } = await supabase.from("scorecards_cached").upsert(
    {
      match_id: matchId,
      raw_json: upstream,
      is_final: isFinal,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
  if (error) throw error;

  // Opportunistic squad-reconcile on fresh upstream data too. The helper
  // is itself idempotent, so running on both cache hits and misses is
  // safe. See `reconcileSquadFromScorecard` for rules.
  void reconcileSquadFromScorecard(supabase, matchId, upstream).catch((err) => {
    console.warn("[getCachedScorecard] squad reconcile (fetch) failed", matchId, err);
  });

  return { scorecard: upstream, isFinal };
}

// ---------------------------------------------------------------------------
// Squad auto-reconcile
// ---------------------------------------------------------------------------

/**
 * Given a just-fetched scorecard, append any players to `squads_cached`
 * that appear in the scorecard but not in the cached squad. Uses the
 * inning label to infer which team each scorecard player belongs to:
 *
 *   inning: "Sunrisers Hyderabad Inning 1"
 *     → batters on that inning → Sunrisers Hyderabad
 *     → bowlers on that inning → the opposing team
 *
 * Team matching is a case-insensitive substring match against the cached
 * squad's `teamName` (scorecard and squad endpoints occasionally disagree
 * on team naming).
 *
 * No-ops if:
 *   - The scorecard has no innings yet (pre-match).
 *   - There's no cached squad row to reconcile against (nothing to patch).
 *   - No missing players are detected.
 */
async function reconcileSquadFromScorecard(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  matchId: string,
  scorecard: CricApiScorecard,
): Promise<void> {
  const innings = scorecard.scorecard ?? [];
  if (innings.length === 0) return;

  const { data: squadRow } = await supabase
    .from("squads_cached")
    .select("raw_json")
    .eq("match_id", matchId)
    .maybeSingle();

  if (!squadRow?.raw_json) return;

  const squad = (squadRow.raw_json as CricApiSquadEntry[]).map((t) => ({
    ...t,
    players: [...t.players],
  }));
  if (squad.length === 0) return;

  // Build a set of "who's already in the squad" — keyed by BOTH normalized
  // name and id (when present), so we catch both missing-id and renamed
  // cases. The set is shared across teams; a player is a dup anywhere.
  const nameKey = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();

  const knownIds = new Set<string>();
  const knownNames = new Set<string>();
  for (const t of squad) {
    for (const p of t.players) {
      if (p.id) knownIds.add(p.id);
      knownNames.add(nameKey(p.name));
    }
  }

  function teamIndexForName(name: string | undefined | null): number {
    if (!name) return -1;
    const lower = name.toLowerCase();
    return squad.findIndex(
      (t) =>
        t.teamName.toLowerCase().includes(lower) ||
        lower.includes(t.teamName.toLowerCase()),
    );
  }

  // Returns the index in `squad` whose team should OWN the given inning's
  // batters. Bowlers in the same inning belong to `1 - battingIdx` when
  // the squad has exactly 2 teams.
  function battingTeamIndexForInning(inning: string): number {
    const stripped = inning.replace(/\s+inning\s*\d+\s*$/i, "").trim();
    return teamIndexForName(stripped);
  }

  const additions: Array<{ teamIdx: number; id: string; name: string }> = [];

  function considerPlayer(
    teamIdx: number,
    raw: { id?: string; name: string } | string,
  ): void {
    if (teamIdx < 0) return;
    const entry =
      typeof raw === "string" ? { id: undefined, name: raw } : raw;
    const name = (entry.name ?? "").trim();
    if (!name) return;

    const alreadyById = entry.id ? knownIds.has(entry.id) : false;
    const alreadyByName = knownNames.has(nameKey(name));
    if (alreadyById || alreadyByName) return;

    // Generate a deterministic id if the scorecard didn't carry one, so
    // repeat reconciles remain idempotent.
    const finalId =
      entry.id ||
      `manual-${nameKey(name)}-${nameKey(squad[teamIdx].teamName)}`;

    if (knownIds.has(finalId)) return;

    additions.push({ teamIdx, id: finalId, name });
    knownIds.add(finalId);
    knownNames.add(nameKey(name));
  }

  for (const inn of innings) {
    const battingIdx = battingTeamIndexForInning(inn.inning ?? "");
    const bowlingIdx =
      squad.length === 2 && battingIdx >= 0 ? 1 - battingIdx : -1;

    for (const b of inn.batting ?? []) {
      considerPlayer(battingIdx, b.batsman);
    }
    for (const b of inn.bowling ?? []) {
      considerPlayer(bowlingIdx, b.bowler);
    }
  }

  if (additions.length === 0) return;

  for (const a of additions) {
    squad[a.teamIdx].players.push({ id: a.id, name: a.name });
  }

  const { error } = await supabase.from("squads_cached").upsert(
    {
      match_id: matchId,
      raw_json: squad,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
  if (error) throw error;

  console.info(
    `[squad-reconcile] match=${matchId} added ${additions.length} player(s)`,
    additions.map((a) => `${a.name} → ${squad[a.teamIdx].teamName}`),
  );
}
