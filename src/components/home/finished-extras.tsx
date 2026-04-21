import { getCachedScorecard } from "@/lib/cricket-cache";
import type { CricApiScorecard } from "@/lib/cricket";
import type {
  BowlerDesignationRow,
  GameMemberRow,
  ImpactSubRow,
  UserRow,
} from "@/lib/db-types";

import { FinishedExtrasTabs } from "./finished-extras-tabs";

/**
 * Server wrapper for the post-match detail block. Does the scorecard
 * fetch server-side so the client bundle stays small, then hands the raw
 * data off to `FinishedExtrasTabs` which owns all the rendering and the
 * Summary/Scorecard tab toggle.
 */
export async function FinishedExtras({
  matchId,
  members,
  bowlerDesignations,
  impactSubs,
}: {
  matchId: string;
  members: Array<GameMemberRow & { user: UserRow }>;
  bowlerDesignations: BowlerDesignationRow[];
  impactSubs: ImpactSubRow[];
}) {
  let scorecard: CricApiScorecard | null = null;
  try {
    const cached = await getCachedScorecard(matchId);
    scorecard = cached.scorecard;
  } catch (err) {
    console.error("[FinishedExtras] scorecard load failed", err);
  }

  return (
    <FinishedExtrasTabs
      members={members}
      bowlerDesignations={bowlerDesignations}
      impactSubs={impactSubs}
      scorecard={scorecard}
    />
  );
}
