import "server-only";

import type { GameRow } from "@/lib/db-types";
import { scoreGame } from "@/lib/game-lifecycle";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Helper used by the admin edit endpoints: after an admin mutates picks /
 * impact subs / bowler designations on a game, auto-rescore so the UI
 * reflects the new inputs immediately.
 *
 * Behavior by game status:
 *   - `drafting`: nothing to do; the game hasn't been locked yet so there
 *                 are no scores to invalidate.
 *   - `locked` or `scored`: run `scoreGame` with `allowRescore: true` and
 *                 `requireFinal: false` (scorecard may be partial / live).
 *                 We pass `forceScorecardRefresh: false` on purpose — the
 *                 admin just tweaked local inputs; no reason to burn a
 *                 CricAPI hit on every edit. If the admin wants a fresh
 *                 scorecard, they can click the "Refresh scorecard" button
 *                 on the admin game row (which forces a CricAPI repull
 *                 and rescore).
 */
export async function rescoreAfterEdit(
  gameId: string,
): Promise<{ rescored: boolean; reason?: string }> {
  const admin = createSupabaseServiceClient();
  const { data: gameData } = await admin
    .from("games")
    .select("status")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) return { rescored: false, reason: "game-not-found" };

  const game = gameData as Pick<GameRow, "status">;
  if (game.status === "drafting") return { rescored: false, reason: "drafting" };

  const result = await scoreGame(gameId, {
    client: admin,
    allowRescore: true,
    requireFinal: false,
    forceScorecardRefresh: false,
  });
  if (!result.scored) {
    return { rescored: false, reason: result.reason };
  }
  return { rescored: true };
}
