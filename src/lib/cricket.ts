import "server-only";

/**
 * CricketData / CricAPI client.
 *
 * This module is SERVER ONLY. Do not import from any client component.
 * Enforced at build time by the `server-only` import above — any accidental
 * client import will fail with a clear error.
 *
 * Endpoints (all prefixed with `https://api.cricapi.com/v1/`):
 *   - `currentMatches` — list of current, recent, upcoming matches
 *   - `match_info`     — single match metadata
 *   - `match_squad`    — playing XI + full squads
 *   - `match_scorecard`— batting/bowling scorecard
 *
 * Free tier limit: 100 hits/day. We cache everything in Supabase; this client
 * is only called by server routes / cron, never directly by pages.
 */

const BASE_URL = "https://api.cricapi.com/v1";
const IPL_SERIES_NAME_FRAGMENT = "indian premier league";

/**
 * Local alias for `DEMO_MODE=1`. We avoid importing from `@/lib/demo`
 * at module-top to prevent cycles: `demo.ts` is free to import from here
 * in the future without creating a dependency loop. Cheap enough to read
 * per-call.
 */
function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/**
 * Hardcoded current IPL season series ID. CricAPI assigns a new ID each
 * season. If this breaks at the start of a new season, look up the new ID
 * via the `series` endpoint (or the series_info URL on cricapi.com) and
 * update here. Kept in code — not env — so it's versioned with the release.
 */
const IPL_SERIES_ID_2026 = "87c62aac-bc3c-4738-ab93-19da0690488f";

/** Envelope every CricAPI response shares. */
type CricApiEnvelope<T> = {
  apikey?: string;
  data?: T;
  status: "success" | string;
  info?: {
    hitsToday?: number;
    hitsLimit?: number;
    hitsUsed?: number;
    credits?: number;
    server?: number;
    offsetRows?: number;
    totalRows?: number;
    queryTime?: number;
  };
  reason?: string;
  etag?: string;
};

/** One entry in `currentMatches`. */
export type CricApiMatchSummary = {
  id: string;
  name: string;
  matchType: string;           // 't20' | 'odi' | 'test' | ...
  status: string;              // 'Match not started' | 'Live' | 'Match ended' etc.
  venue: string;
  date: string;                // 'YYYY-MM-DD'
  dateTimeGMT: string;         // ISO 8601
  teams: [string, string] | string[];
  teamInfo?: Array<{
    name: string;
    shortname?: string;
    img?: string;
  }>;
  score?: Array<{
    r?: number;
    w?: number;
    o?: number;
    inning?: string;
  }>;
  series_id?: string;
  fantasyEnabled?: boolean;
  bbbEnabled?: boolean;
  hasSquad?: boolean;
  matchStarted?: boolean;
  matchEnded?: boolean;
};

export type CricApiSquadEntry = {
  teamName: string;
  shortname?: string;
  img?: string;
  players: Array<{
    id: string;
    name: string;
    role?: string;
    battingStyle?: string;
    bowlingStyle?: string;
    country?: string;
    playerImg?: string;
  }>;
};

export type CricApiScorecardInning = {
  inning: string;
  batting: Array<{
    batsman: { id?: string; name: string } | string;
    "dismissal-text"?: string;
    r: number;
    b: number;
    "4s": number;
    "6s": number;
    sr: number;
  }>;
  bowling: Array<{
    bowler: { id?: string; name: string } | string;
    o: number;
    m: number;
    r: number;
    w: number;
    nb?: number;
    wd?: number;
    eco: number;
  }>;
  extras?: Record<string, number>;
  total?: Record<string, number>;
};

export type CricApiScorecard = {
  id: string;
  name: string;
  matchType: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  teamInfo?: CricApiMatchSummary["teamInfo"];
  score?: CricApiMatchSummary["score"];
  scorecard?: CricApiScorecardInning[];
  matchStarted?: boolean;
  matchEnded?: boolean;
  tossWinner?: string;
  tossChoice?: string;
  matchWinner?: string;
  winByRuns?: number;
  winByWickets?: number;
};

/**
 * Thrown whenever the API returns a non-success envelope or the network
 * request fails. Callers should catch this to distinguish "API flaked" from
 * their own bugs.
 */
export class CricketApiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CricketApiError";
  }
}

function requireApiKey(): string {
  const key = process.env.CRICKET_API_KEY;
  if (!key) {
    throw new CricketApiError(
      "Missing CRICKET_API_KEY environment variable. Set it in .env.local.",
    );
  }
  return key;
}

/**
 * Process-local hit counter. Vercel serverless functions are ephemeral so
 * this won't give a perfectly accurate cross-request total, but it's useful
 * for logs and the admin dashboard when running locally.
 */
let hitsThisProcess = 0;
export function hitsUsedThisProcess(): number {
  return hitsThisProcess;
}

/**
 * Fire-and-forget: persist the latest CricAPI usage numbers from an envelope
 * `info` block to the `cric_api_usage` singleton row. We don't block the
 * caller on this write and we swallow errors — surfacing usage is a nice-to-
 * have, not a hard requirement.
 *
 * Lazy-imports the Supabase service client so the cricket module stays free
 * of a hard Supabase dependency for anyone importing the types.
 */
function persistUsage(
  path: string,
  info: CricApiEnvelope<unknown>["info"],
): void {
  if (!info) return;
  (async () => {
    try {
      const { createSupabaseServiceClient } = await import("@/lib/supabase/server");
      const admin = createSupabaseServiceClient();
      await admin
        .from("cric_api_usage")
        .upsert(
          {
            key: "singleton",
            hits_today: info.hitsToday ?? null,
            hits_used: info.hitsUsed ?? null,
            hits_limit: info.hitsLimit ?? null,
            credits: info.credits ?? null,
            last_fetched_at: new Date().toISOString(),
            last_path: path,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        );
    } catch (err) {
      console.warn("[cricket] persistUsage failed (non-fatal)", err);
    }
  })();
}

async function callCricApi<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const apikey = requireApiKey();
  const url = new URL(`${BASE_URL}/${path}`);
  url.searchParams.set("apikey", apikey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    throw new CricketApiError(`CricketData fetch failed: ${path}`, err);
  }

  if (!res.ok) {
    throw new CricketApiError(
      `CricketData HTTP ${res.status} for ${path}`,
      undefined,
      res.status,
    );
  }

  hitsThisProcess += 1;

  let body: CricApiEnvelope<T>;
  try {
    body = (await res.json()) as CricApiEnvelope<T>;
  } catch (err) {
    throw new CricketApiError(`CricketData returned non-JSON for ${path}`, err);
  }

  persistUsage(path, body.info);

  if (body.status !== "success" || body.data === undefined) {
    throw new CricketApiError(
      `CricketData ${path} returned status=${body.status}${
        body.reason ? ` reason=${body.reason}` : ""
      }`,
    );
  }

  return body.data;
}

/**
 * Fetch current/upcoming matches. Free tier returns up to ~25 per page. We
 * take the first page, then filter client-side for IPL so we can store only
 * the relevant fixtures.
 *
 * Note: CricAPI's `currentMatches` only returns live + recently completed
 * matches — NOT scheduled future fixtures. For upcoming IPL games you must
 * use `series_info` with the IPL series ID (see `fetchIplFixtures`).
 */
export async function fetchCurrentMatches(options: {
  offset?: number;
} = {}): Promise<CricApiMatchSummary[]> {
  const params: Record<string, string> = {};
  if (options.offset) params.offset = String(options.offset);
  return await callCricApi<CricApiMatchSummary[]>("currentMatches", params);
}

/**
 * The shape of a `series_info` response. Only the fields we actually read.
 */
type CricApiSeriesInfo = {
  info: {
    id: string;
    name: string;
    startDate?: string;
    endDate?: string;
  };
  matchList: CricApiMatchSummary[];
};

/**
 * Fetch the entire IPL season schedule via `series_info`. Returns all 70+
 * matches — past, live, and future. Callers (the home-state logic) narrow
 * this down to a time window.
 *
 * This is 1 API hit and gives us everything we need for fixtures + "upcoming"
 * for the rest of the season. The cache TTL (6h in cricket-cache.ts) keeps
 * us well inside the 100/day budget.
 */
export async function fetchIplFixtures(): Promise<CricApiMatchSummary[]> {
  if (isDemoMode()) {
    // Serve the static demo fixture; no CricAPI call.
    const { demoFixture } = await import("@/lib/demo-fixtures");
    const { readDemoState } = await import("@/lib/demo");
    const state = await readDemoState();
    return [demoFixture(state.match_state)];
  }
  const series = await callCricApi<CricApiSeriesInfo>("series_info", {
    id: IPL_SERIES_ID_2026,
  });
  return series.matchList ?? [];
}

// Kept for backwards-compatibility / debugging: filter `currentMatches`
// by IPL name. Useful if the series ID goes stale; not used in the main
// fixture path.
export async function fetchIplCurrentMatches(): Promise<CricApiMatchSummary[]> {
  const all = await fetchCurrentMatches();
  return all.filter((m) => {
    const haystack = `${m.name} ${m.series_id ?? ""}`.toLowerCase();
    return haystack.includes(IPL_SERIES_NAME_FRAGMENT);
  });
}

/** Fetch squads (playing XI + bench) for a match. */
export async function fetchMatchSquad(matchId: string): Promise<CricApiSquadEntry[]> {
  if (isDemoMode()) {
    const { DEMO_MATCH_ID, DEMO_SQUADS } = await import("@/lib/demo-fixtures");
    if (matchId === DEMO_MATCH_ID) return DEMO_SQUADS;
  }
  return await callCricApi<CricApiSquadEntry[]>("match_squad", { id: matchId });
}

/** Fetch the full scorecard for a match (may be partial during live play). */
export async function fetchMatchScorecard(matchId: string): Promise<CricApiScorecard> {
  if (isDemoMode()) {
    const { DEMO_MATCH_ID, demoScorecard } = await import("@/lib/demo-fixtures");
    if (matchId === DEMO_MATCH_ID) {
      const { readDemoState } = await import("@/lib/demo");
      const state = await readDemoState();
      // Only serve a scorecard once the match is live/finished; otherwise
      // the caller would cache a bogus one and the UI would show stats
      // pre-start.
      if (state.match_state === "not-started") {
        return demoScorecard(state.scenario, "live");
      }
      return demoScorecard(state.scenario, state.match_state);
    }
  }
  return await callCricApi<CricApiScorecard>("match_scorecard", { id: matchId });
}

/** Fetch just the match metadata / current status. */
export async function fetchMatchInfo(matchId: string): Promise<CricApiScorecard> {
  return await callCricApi<CricApiScorecard>("match_info", { id: matchId });
}

// Team-code normalization lives in `lib/ipl-teams.ts` so it can be imported
// from client components without dragging in this server-only module.
export { iplTeamCode } from "@/lib/ipl-teams";
