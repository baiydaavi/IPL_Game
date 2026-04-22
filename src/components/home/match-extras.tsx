import { getCachedScorecard } from "@/lib/cricket-cache";
import type { CricApiScorecard } from "@/lib/cricket";

import { MatchExtrasTabs } from "./match-extras-tabs";

/**
 * Server wrapper for the match detail block (match-state summary +
 * full scorecard tables). Pulls the scorecard server-side so the client
 * bundle stays small, then hands it off to `MatchExtrasTabs`.
 *
 * Used in both the live and finished states. `isFinal` flips a few copy
 * bits (Live vs Final, empty-state wording) so the language matches the
 * moment.
 */
export async function MatchExtras({
  matchId,
  isFinal,
}: {
  matchId: string;
  isFinal: boolean;
}) {
  let scorecard: CricApiScorecard | null = null;
  try {
    const cached = await getCachedScorecard(matchId);
    scorecard = cached.scorecard;
  } catch (err) {
    console.error("[MatchExtras] scorecard load failed", err);
  }

  return <MatchExtrasTabs scorecard={scorecard} isFinal={isFinal} />;
}
