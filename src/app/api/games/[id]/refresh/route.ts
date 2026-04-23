import { NextResponse } from "next/server";

import { getCachedScorecard } from "@/lib/cricket-cache";
import type { GameRow } from "@/lib/db-types";
import { getEffectiveUser } from "@/lib/effective-user";
import { scoreGame } from "@/lib/game-lifecycle";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/games/[id]/refresh
 *
 * Forces a live refresh of the scorecard from CricketData (bypassing our
 * cache TTL) and, if the match has ended, runs the scoring pass. Used by
 * both the "Refresh now" button on the live match card and the 60s
 * client-side auto-poll.
 *
 * Rate-limiting:
 *   - Auto-poll requests share a per-user 30s cooldown to defend against
 *     tight-loop bugs or duplicated tabs.
 *   - Manual clicks (request body `{ manual: true }`) bypass the cooldown
 *     entirely. A human tapping a button can't generate enough load to
 *     matter on the paid CricketData tier (2000 hits/day), and getting
 *     a 429 right after the auto-poll just-fired is confusing UX.
 */

const REFRESH_COOLDOWN_MS = 30 * 1000;

// Per-process memo of the last refresh time per user. Serverless functions
// are ephemeral so this is best-effort; the cache TTL at the cricket-cache
// layer is the real guardrail.
const lastRefreshByUser = new Map<string, number>();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: gameId } = await params;

  const user = await getEffectiveUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    manual?: boolean;
  };
  const isManual = body.manual === true;

  const now = Date.now();
  if (!isManual) {
    const last = lastRefreshByUser.get(user.id);
    if (last && now - last < REFRESH_COOLDOWN_MS) {
      const retryInSec = Math.ceil(
        (REFRESH_COOLDOWN_MS - (now - last)) / 1000,
      );
      return NextResponse.json(
        { error: "rate_limited", retry_in_seconds: retryInSec },
        { status: 429 },
      );
    }
  }
  lastRefreshByUser.set(user.id, now);

  const admin = createSupabaseServiceClient();

  const { data: gameData } = await admin
    .from("games")
    .select("id, match_id, status")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const game = gameData as Pick<GameRow, "id" | "match_id" | "status">;

  try {
    const { isFinal } = await getCachedScorecard(game.match_id, {
      forceRefresh: true,
    });

    let scored: { scored: boolean } = { scored: false };
    if (game.status === "locked") {
      if (isFinal) {
        // End-of-match: full scoring run (writes scores, flips status,
        // sets winner). Idempotent once status = "scored".
        scored = await scoreGame(gameId, { client: admin });
      } else {
        // Mid-match: write a provisional `scores` snapshot so the live
        // match card shows running totals, without prematurely sealing
        // the game's lifecycle.
        scored = await scoreGame(gameId, {
          client: admin,
          requireFinal: false,
          writeScoresOnly: true,
        });
      }
    }

    return NextResponse.json({ ok: true, isFinal, scored: scored.scored });
  } catch (err) {
    console.error("[refresh] failed", err);
    return NextResponse.json(
      { error: "upstream_failed", message: (err as Error).message },
      { status: 502 },
    );
  }
}
