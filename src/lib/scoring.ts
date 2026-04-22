import type { CricApiScorecard, CricApiScorecardInning } from "@/lib/cricket";
import type {
  BowlerDesignationRow,
  ImpactSubRow,
  PickRow,
} from "@/lib/db-types";
import { iplTeamCode } from "@/lib/ipl-teams";

/**
 * Scoring constants. Hardcoded defaults for v1 — edit here to tune.
 * If these get moved to DB later (admin-configurable), swap this file for a
 * lookup but keep the shape of `computeScore`.
 */
export const POINTS_PER_RUN = 1;
export const POINTS_PER_WICKET = 25;
export const POINTS_TEAM_WIN_BONUS = 75;

export type PlayerContribution = {
  player_id: string;
  player_name: string;
  runs: number;
  wickets: number;
  runs_points: number;
  wickets_points: number;
  total: number;
  /** True when this player bowled at least one ball in the match. */
  bowled: boolean;
  /** Set when this slot was credited via an impact-sub redirection. */
  impact_sub_from?: { player_id: string; player_name: string };
};

export type ScoreBreakdown = {
  players: PlayerContribution[];
  team_pick: string | null;
  team_won: boolean;
  team_bonus: number;
  /**
   * Only set when the draft wasn't completed before kickoff. The user
   * on the clock forfeits and loses regardless of scorecard; the other
   * user wins with the same zero tally. Set on both users' breakdowns.
   */
  forfeit?: "won" | "lost";
  /**
   * Shape of the bowler-coverage penalty that fired for this user, if any.
   * Team bonus is unaffected regardless.
   *   - "all-three":       no bowler was designated AND none of the user's
   *                        3 picks bowled → all 3 player contributions zeroed.
   *   - "designated-only": a bowler WAS designated AND none of the user's
   *                        3 picks bowled → only the designated player's
   *                        contribution is zeroed, the other 2 keep their
   *                        points.
   */
  bowler_penalty_applied?: "all-three" | "designated-only";
  /**
   * True when the rain-draw rule fires. Only set on rain-affected matches
   * (see `isRainAffected`): if EITHER user had zero of their 3 drafted
   * players appear in the scorecard, we flag BOTH users' breakdowns so
   * `winnerFromScores` returns null (forced draw). Raw totals are left
   * untouched so the UI can still show them if we want to.
   */
  rain_draw_applied?: boolean;
};

export type UserScore = {
  user_id: string;
  runs_points: number;
  wickets_points: number;
  team_bonus: number;
  total: number;
  breakdown: ScoreBreakdown;
};

type PlayerStatLine = {
  runs: number;
  wickets: number;
  overs: number; // decimal overs, e.g. 3.4 = 3 overs 4 balls
  balls_faced: number;
  played: boolean; // faced at least one ball OR bowled at least one ball
  name: string;
};

/**
 * Build a map of player_id -> stat line from a scorecard by scanning every
 * innings. CricketData's player identifiers come either nested as
 * `{ id, name }` or as plain strings; we handle both.
 *
 * In addition to the obvious runs / wickets / overs, we also track `played`
 * (faced any ball as batter, or bowled any ball) for the rain-draw rule.
 */
function tallyPlayerStats(scorecard: CricApiScorecard): Map<string, PlayerStatLine> {
  const out = new Map<string, PlayerStatLine>();
  const innings: CricApiScorecardInning[] = scorecard.scorecard ?? [];

  const getOrInit = (id: string, name: string): PlayerStatLine => {
    const prev = out.get(id);
    if (prev) return prev;
    const fresh: PlayerStatLine = {
      runs: 0,
      wickets: 0,
      overs: 0,
      balls_faced: 0,
      played: false,
      name,
    };
    out.set(id, fresh);
    return fresh;
  };

  for (const inning of innings) {
    for (const bat of inning.batting ?? []) {
      const { id, name } = normalizePersonRef(bat.batsman);
      if (!id) continue;
      const row = getOrInit(id, name);
      row.runs += bat.r ?? 0;
      row.balls_faced += bat.b ?? 0;
      // "played" as batter = faced any ball. Avoids false positives from
      // "did not bat" rows, which appear with b = 0, r = 0.
      if ((bat.b ?? 0) > 0) row.played = true;
      row.name = name || row.name;
    }
    for (const bowl of inning.bowling ?? []) {
      const { id, name } = normalizePersonRef(bowl.bowler);
      if (!id) continue;
      const row = getOrInit(id, name);
      row.wickets += bowl.w ?? 0;
      row.overs += bowl.o ?? 0;
      if ((bowl.o ?? 0) > 0) row.played = true;
      row.name = name || row.name;
    }
  }

  return out;
}

/**
 * Did the match look rain-affected? Based on the scorecard's free-text
 * `status` field, which CricAPI uses for phrases like:
 *   - "Match abandoned due to rain"
 *   - "... won by X runs (D/L method)"
 *   - "No result"
 *   - "Match reduced to N overs"
 *
 * Also treats a completed match with fewer than 2 innings as rain-affected
 * (a washout where neither team really played).
 *
 * False positives here only trigger the rain-draw check; they don't force
 * a draw on their own (a user still needs to have 0/3 picks play).
 */
export function isRainAffected(scorecard: CricApiScorecard): boolean {
  const status = (scorecard.status ?? "").toLowerCase();
  const rainKeywords = [
    "rain",
    "abandon",
    "no result",
    "d/l",
    "dls",
    "duckworth",
    "vjd",
    "reduced",
    "washout",
  ];
  return rainKeywords.some((kw) => status.includes(kw));
}

function normalizePersonRef(
  ref: { id?: string; name: string } | string | undefined,
): { id: string | null; name: string } {
  if (!ref) return { id: null, name: "" };
  if (typeof ref === "string") {
    // Some responses give just the name — we can't map these back to our
    // picks without an ID. Swallow; admin override can patch.
    return { id: null, name: ref };
  }
  return { id: ref.id ?? null, name: ref.name };
}

/**
 * Decide which team, if any, won the match. Prefers the explicit
 * `matchWinner` field, falling back to parsing the `status` string
 * ("Chennai Super Kings won by 5 wickets") when needed.
 */
function resolveWinnerCode(scorecard: CricApiScorecard): string | null {
  if (scorecard.matchWinner) return iplTeamCode(scorecard.matchWinner);
  const status = scorecard.status ?? "";
  const match = /^(.+?)\s+won\b/i.exec(status);
  if (match) return iplTeamCode(match[1]);
  return null;
}

/**
 * Compute the final scores for every user in a game. Pure function: given
 * the same inputs it always returns the same output. Used by the scoring
 * cron and the admin "recompute" button.
 *
 * Rules applied in order:
 *   1. Base scoring: each drafted player earns runs * POINTS_PER_RUN
 *      + wickets * POINTS_PER_WICKET.
 *   2. Impact-sub redirection: if the owner of a drafted player reports
 *      (via the impact_subs table) that their player was benched and
 *      replaced by someone NOT drafted by the other user, the replacement's
 *      runs + wickets are ADDED as a separate contribution slot for the
 *      same owner. If the replacement was drafted by the other user, this
 *      is a no-op (their normal pick already scores them).
 *   3. Bowler-coverage penalty: the penalty only fires when NONE of the
 *      user's 3 drafted picks bowled a ball in the match. Its shape then
 *      depends on whether the user committed a designated bowler before
 *      the match started:
 *        - Designated: zero ONLY the designated player's contribution.
 *          The other 2 picks keep their points.
 *        - Not designated: zero all 3 player contributions.
 *      Team bonus is unaffected either way. If ANY of the 3 picks bowled,
 *      there is no penalty.
 *   4. Team bonus: POINTS_TEAM_WIN_BONUS if their team pick matches the
 *      match winner.
 *   5. Rain-draw guard: ONLY when the match looks rain-affected (see
 *      `isRainAffected`), check how many of each user's 3 drafted players
 *      actually played (faced a ball or bowled a ball). If EITHER user has
 *      0/3 appear, both users' breakdowns get `rain_draw_applied = true`
 *      and `winnerFromScores` returns null (forced draw). Totals are left
 *      untouched so the UI can still show them.
 *
 * @param picks - all picks (6 player + 2 team) across both users
 * @param scorecard - the final scorecard (may also be called mid-match for
 *   a live total)
 * @param impactSubs - manually-reported IPL impact substitutions, one per
 *   team at most. Empty array disables rule 2.
 * @param bowlerDesignations - per-user designated-bowler commitments. One
 *   row per user at most. Drives the shape of the rule 3 penalty.
 * @param options.winnerOverride - if set, bypass scorecard.matchWinner for
 *   the team bonus (used by admin to fix mismatched data)
 */
export function computeScore({
  picks,
  scorecard,
  impactSubs = [],
  bowlerDesignations = [],
  winnerOverride,
}: {
  picks: PickRow[];
  scorecard: CricApiScorecard;
  impactSubs?: ImpactSubRow[];
  bowlerDesignations?: BowlerDesignationRow[];
  winnerOverride?: string | null;
}): UserScore[] {
  const stats = tallyPlayerStats(scorecard);
  const winnerCode = winnerOverride
    ? iplTeamCode(winnerOverride)
    : resolveWinnerCode(scorecard);

  // Who drafted each player_id? Used to decide whether an impact-sub
  // redirection would double-count (skip when the sub was drafted by the
  // other user — they already score normally).
  const draftedPlayerOwner = new Map<string, string>();
  for (const pick of picks) {
    if (pick.pick_type === "player" && pick.player_id) {
      draftedPlayerOwner.set(pick.player_id, pick.user_id);
    }
  }

  // Map from an impact-subbed-OUT player_id -> the IN player_id. Only used
  // when the IN player was not separately drafted, since otherwise the
  // normal pick path already credits them.
  const redirectByOutId = new Map<
    string,
    { inPlayerId: string; inPlayerName: string }
  >();
  for (const sub of impactSubs) {
    const inWasDraftedBy = draftedPlayerOwner.get(sub.in_player_id);
    if (inWasDraftedBy) continue; // sub already scores normally
    redirectByOutId.set(sub.out_player_id, {
      inPlayerId: sub.in_player_id,
      inPlayerName: sub.in_player_name,
    });
  }

  const byUser = new Map<string, UserScore>();

  for (const pick of picks) {
    const existing = byUser.get(pick.user_id) ?? emptyScore(pick.user_id);

    if (pick.pick_type === "player" && pick.player_id) {
      const s = stats.get(pick.player_id);
      const runs = s?.runs ?? 0;
      const wickets = s?.wickets ?? 0;
      const runs_points = runs * POINTS_PER_RUN;
      const wickets_points = wickets * POINTS_PER_WICKET;
      const contribution: PlayerContribution = {
        player_id: pick.player_id,
        player_name: pick.player_name ?? s?.name ?? "Unknown",
        runs,
        wickets,
        runs_points,
        wickets_points,
        total: runs_points + wickets_points,
        bowled: (s?.overs ?? 0) > 0,
      };
      existing.breakdown.players.push(contribution);
      existing.runs_points += runs_points;
      existing.wickets_points += wickets_points;

      // If this drafted player was impact-subbed OUT and their replacement
      // wasn't separately drafted, add the replacement's stats as an extra
      // contribution slot for the same owner.
      const redirect = redirectByOutId.get(pick.player_id);
      if (redirect) {
        const sub = stats.get(redirect.inPlayerId);
        const subRuns = sub?.runs ?? 0;
        const subWickets = sub?.wickets ?? 0;
        const subRunsPoints = subRuns * POINTS_PER_RUN;
        const subWicketsPoints = subWickets * POINTS_PER_WICKET;
        existing.breakdown.players.push({
          player_id: redirect.inPlayerId,
          player_name: sub?.name ?? redirect.inPlayerName,
          runs: subRuns,
          wickets: subWickets,
          runs_points: subRunsPoints,
          wickets_points: subWicketsPoints,
          total: subRunsPoints + subWicketsPoints,
          bowled: (sub?.overs ?? 0) > 0,
          impact_sub_from: {
            player_id: pick.player_id,
            player_name: contribution.player_name,
          },
        });
        existing.runs_points += subRunsPoints;
        existing.wickets_points += subWicketsPoints;
      }
    } else if (pick.pick_type === "team" && pick.team_code) {
      existing.breakdown.team_pick = pick.team_code;
      const won = winnerCode !== null && iplTeamCode(pick.team_code) === winnerCode;
      existing.breakdown.team_won = won;
      existing.breakdown.team_bonus = won ? POINTS_TEAM_WIN_BONUS : 0;
      existing.team_bonus = existing.breakdown.team_bonus;
    }

    existing.total =
      existing.runs_points + existing.wickets_points + existing.team_bonus;
    byUser.set(pick.user_id, existing);
  }

  // Bowler-coverage penalty (rule 3). The penalty only fires if NONE of the
  // user's scoring contributions bowled a ball. When it fires, its shape
  // depends on whether the user designated a bowler before match start:
  //   - Designated: zero just that player's contribution.
  //   - Not designated: zero all 3.
  // Team bonus is unaffected either way.
  //
  // We check `breakdown.players` (not just drafted `picks`) so that an
  // impact-sub redirection counts as coverage: if your drafted player was
  // replaced and the replacement bowled, the penalty does not fire — the
  // rule is about whether your team of *contributors* covered bowling.
  const picksByUser = new Map<string, PickRow[]>();
  for (const pick of picks) {
    if (pick.pick_type !== "player" || !pick.player_id) continue;
    const list = picksByUser.get(pick.user_id) ?? [];
    list.push(pick);
    picksByUser.set(pick.user_id, list);
  }
  const designationByUser = new Map<string, BowlerDesignationRow>();
  for (const d of bowlerDesignations) designationByUser.set(d.user_id, d);

  for (const [userId, score] of byUser) {
    const anyBowled = score.breakdown.players.some((c) => c.bowled);
    if (anyBowled) continue;

    const designation = designationByUser.get(userId);
    if (designation) {
      // Zero the designated player's contribution AND its impact-sub
      // replacement (if any). The rule treats the designated slot as
      // a single commitment: if the designated bowler was subbed out
      // and the sub also didn't bowl, neither side of that slot earns
      // points. Other drafted picks keep their points.
      for (const contrib of score.breakdown.players) {
        const isDesignated = contrib.player_id === designation.player_id;
        const isSubForDesignated =
          contrib.impact_sub_from?.player_id === designation.player_id;
        if (isDesignated || isSubForDesignated) {
          contrib.runs_points = 0;
          contrib.wickets_points = 0;
          contrib.total = 0;
        }
      }
      let runs = 0;
      let wickets = 0;
      for (const contrib of score.breakdown.players) {
        runs += contrib.runs_points;
        wickets += contrib.wickets_points;
      }
      score.runs_points = runs;
      score.wickets_points = wickets;
      score.total = runs + wickets + score.team_bonus;
      score.breakdown.bowler_penalty_applied = "designated-only";
    } else {
      // No designation — zero all 3 contributions.
      for (const contrib of score.breakdown.players) {
        contrib.runs_points = 0;
        contrib.wickets_points = 0;
        contrib.total = 0;
      }
      score.runs_points = 0;
      score.wickets_points = 0;
      score.total = score.team_bonus;
      score.breakdown.bowler_penalty_applied = "all-three";
    }
  }

  // Rain-draw guard (rule 5). Only considered when the match itself is
  // rain-affected, so a user whose picks were simply dropped from the XI on
  // a dry day doesn't accidentally force a draw.
  if (isRainAffected(scorecard)) {
    let anyUserHadNoneAppear = false;
    for (const [userId] of byUser) {
      const userPicks = picksByUser.get(userId) ?? [];
      const anyPlayed = userPicks.some((p) => {
        if (!p.player_id) return false;
        return stats.get(p.player_id)?.played === true;
      });
      if (!anyPlayed) {
        anyUserHadNoneAppear = true;
        break;
      }
    }
    if (anyUserHadNoneAppear) {
      for (const score of byUser.values()) {
        score.breakdown.rain_draw_applied = true;
      }
    }
  }

  return Array.from(byUser.values());
}

function emptyScore(user_id: string): UserScore {
  return {
    user_id,
    runs_points: 0,
    wickets_points: 0,
    team_bonus: 0,
    total: 0,
    breakdown: {
      players: [],
      team_pick: null,
      team_won: false,
      team_bonus: 0,
    },
  };
}

/**
 * Derive the winner of a scored game: whoever has the higher total. Returns
 * null for a tie — or for a rain-draw (see rule 5 in `computeScore`).
 */
export function winnerFromScores(scores: UserScore[]): string | null {
  if (scores.length === 0) return null;
  if (scores.some((s) => s.breakdown.rain_draw_applied)) return null;
  const sorted = [...scores].sort((a, b) => b.total - a.total);
  if (sorted.length >= 2 && sorted[0].total === sorted[1].total) return null;
  return sorted[0].user_id;
}
