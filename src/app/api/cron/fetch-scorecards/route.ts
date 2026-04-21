import { NextResponse } from "next/server";

import { getCachedScorecard } from "@/lib/cricket-cache";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { scoreGame } from "@/lib/game-lifecycle";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Cron: fetch the FINAL scorecard for any `locked` game whose match ended in
 * the last 24 hours but hasn't been scored yet. Runs once per day late at
 * night UTC (after evening IPL matches have wrapped).
 *
 * Vercel Hobby only allows daily cron jobs, so live-match updates are handled
 * by client-side polling against /api/cricket/scorecard/[id] while the match
 * is in progress. The route's cache TTL (45 min for non-final scorecards)
 * keeps the API budget in check.
 *
 * - Pulls the final scorecard (1 hit per game).
 * - If the upstream response marks the match as ended AND the scorecard is
 *   marked final, sets the game status -> 'scored' and fires the scoring
 *   pass (TODO wired once lib/scoring.ts lands).
 * - Otherwise, leaves the game in `locked` for the next day's run or an
 *   admin-triggered manual pass.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: pending, error } = await supabase
    .from("games")
    .select("id, match_id, matches_cached!inner(date)")
    .eq("status", "locked")
    .gte("matches_cached.date", twentyFourHoursAgo);

  if (error) {
    console.error("[cron fetch-scorecards] query failed", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: Array<{
    game_id: string;
    match_id: string;
    status: "scored" | "still_pending" | "error";
    message?: string;
  }> = [];

  for (const g of pending ?? []) {
    try {
      const { isFinal } = await getCachedScorecard(g.match_id, { forceRefresh: true });
      if (!isFinal) {
        results.push({
          game_id: g.id,
          match_id: g.match_id,
          status: "still_pending",
          message: "scorecard not final yet",
        });
        continue;
      }
      const scored = await scoreGame(g.id, { client: supabase });
      if (scored.scored) {
        results.push({
          game_id: g.id,
          match_id: g.match_id,
          status: "scored",
          message: `winner=${scored.winnerUserId ?? "tie"}`,
        });
      } else {
        results.push({
          game_id: g.id,
          match_id: g.match_id,
          status: "still_pending",
          message: scored.reason,
        });
      }
    } catch (err) {
      console.error("[cron fetch-scorecards] game failed", g.id, err);
      results.push({
        game_id: g.id,
        match_id: g.match_id,
        status: "error",
        message: (err as Error).message,
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
