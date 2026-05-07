/**
 * Targeted tests for the impact-sub redirect logic in `computeScore`.
 *
 * Rule under test (Rule 1 in docs/rules.md): a drafted slot absorbs the
 * other half of the impact sub event in BOTH directions.
 *   - Forward: drafted player went OUT -> add IN player's stats.
 *   - Reverse: drafted player came IN  -> add OUT player's pre-sub stats.
 * In both directions, skip the redirect if the "other half" was drafted
 * by the opponent (or anyone, for the reverse case) so we don't
 * double-count.
 */

import { describe, expect, it } from "vitest";
import type { CricApiScorecard } from "@/lib/cricket";
import type {
  BowlerDesignationRow,
  ImpactSubRow,
  PickRow,
} from "@/lib/db-types";
import {
  computeScore,
  isRainAffected,
  POINTS_PER_RUN,
  POINTS_PER_WICKET,
  POINTS_TEAM_WIN_BONUS,
  winnerFromScores,
  type UserScore,
} from "@/lib/scoring";

const GAME_ID = "game-1";
const USER_A = "user-a";
const USER_B = "user-b";

function pick(
  user: string,
  turn: number,
  player_id: string,
  player_name: string,
): PickRow {
  return {
    id: `${user}-${turn}`,
    game_id: GAME_ID,
    user_id: user,
    turn_index: turn,
    pick_type: "player",
    player_id,
    player_name,
    team_code: null,
    created_at: "2026-04-26T00:00:00Z",
  };
}

function impactSub(
  out_player_id: string,
  out_player_name: string,
  in_player_id: string,
  in_player_name: string,
): ImpactSubRow {
  return {
    game_id: GAME_ID,
    team_code: "MI",
    out_player_id,
    out_player_name,
    in_player_id,
    in_player_name,
    reported_by: USER_A,
    created_at: "2026-04-26T00:00:00Z",
    updated_at: "2026-04-26T00:00:00Z",
  };
}

/** Build a minimal scorecard where each named player has the given stats. */
function scorecard(
  players: Array<{
    id: string;
    name: string;
    runs?: number;
    wickets?: number;
    overs?: number;
  }>,
): CricApiScorecard {
  return {
    id: "match-1",
    name: "Test Match",
    matchType: "t20",
    status: "Match ended",
    venue: "Test Stadium",
    date: "2026-04-26",
    dateTimeGMT: "2026-04-26T00:00:00Z",
    teams: ["A", "B"],
    matchEnded: true,
    scorecard: [
      {
        inning: "Innings 1",
        batting: players
          .filter((p) => (p.runs ?? 0) > 0)
          .map((p) => ({
            batsman: { id: p.id, name: p.name },
            r: p.runs ?? 0,
            b: 10,
            "4s": 0,
            "6s": 0,
            sr: 0,
          })),
        bowling: players
          .filter((p) => (p.wickets ?? 0) > 0 || (p.overs ?? 0) > 0)
          .map((p) => ({
            bowler: { id: p.id, name: p.name },
            o: p.overs ?? 0,
            m: 0,
            r: 0,
            w: p.wickets ?? 0,
            eco: 0,
          })),
      },
    ],
  };
}

describe("computeScore - impact sub reverse redirect (drafted player came IN)", () => {
  it("credits the OUT player's pre-sub stats to the slot of the drafted IN player", () => {
    // User A drafted Xavier (the IN player). Yannick was the OUT player and
    // wasn't drafted by anyone. Expectation: Xavier's slot also gets
    // Yannick's pre-sub stats added as a separate contribution row.
    const picks = [
      pick(USER_A, 0, "x1", "Xavier"),
      pick(USER_A, 1, "a2", "Alpha"),
      pick(USER_A, 2, "a3", "Beta"),
      pick(USER_B, 3, "b1", "Bravo"),
      pick(USER_B, 4, "b2", "Charlie"),
      pick(USER_B, 5, "b3", "Delta"),
    ];
    const subs = [impactSub("y1", "Yannick", "x1", "Xavier")];
    const sc = scorecard([
      { id: "x1", name: "Xavier", runs: 30, wickets: 1, overs: 2 },
      { id: "y1", name: "Yannick", runs: 20 },
      // others all zero
      { id: "a2", name: "Alpha" },
      { id: "a3", name: "Beta" },
      { id: "b1", name: "Bravo" },
      { id: "b2", name: "Charlie" },
      { id: "b3", name: "Delta" },
    ]);

    const result = computeScore({ picks, scorecard: sc, impactSubs: subs });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a).toBeDefined();
    if (!a) return;

    // Xavier: 30 runs + 1 wicket. Yannick reverse-redirect: 20 runs.
    const expected =
      30 * POINTS_PER_RUN +
      1 * POINTS_PER_WICKET +
      20 * POINTS_PER_RUN;
    expect(a.total).toBe(expected);

    const xavierRow = a.breakdown.players.find(
      (p) => p.player_id === "x1" && !p.impact_sub_to,
    );
    expect(xavierRow?.total).toBe(30 + 25);

    const yannickRow = a.breakdown.players.find((p) => p.player_id === "y1");
    expect(yannickRow).toBeDefined();
    expect(yannickRow?.runs).toBe(20);
    expect(yannickRow?.impact_sub_to).toEqual({
      player_id: "x1",
      player_name: "Xavier",
    });
  });

  it("does NOT add a reverse redirect when the OUT player is drafted by the opponent", () => {
    // User A drafted Xavier (IN). User B drafted Yannick (OUT). Yannick
    // already scores normally for User B; A should get only Xavier's stats.
    const picks = [
      pick(USER_A, 0, "x1", "Xavier"),
      pick(USER_A, 1, "a2", "Alpha"),
      pick(USER_A, 2, "a3", "Beta"),
      pick(USER_B, 3, "y1", "Yannick"),
      pick(USER_B, 4, "b2", "Charlie"),
      pick(USER_B, 5, "b3", "Delta"),
    ];
    const subs = [impactSub("y1", "Yannick", "x1", "Xavier")];
    const sc = scorecard([
      // Both A and B need at least one bowler so the bowler-coverage
      // penalty doesn't fire and zero everyone out.
      { id: "x1", name: "Xavier", runs: 30, overs: 1 },
      { id: "y1", name: "Yannick", runs: 20, overs: 1 },
      { id: "a2", name: "Alpha" },
      { id: "a3", name: "Beta" },
      { id: "b2", name: "Charlie" },
      { id: "b3", name: "Delta" },
    ]);

    const result = computeScore({ picks, scorecard: sc, impactSubs: subs });
    const a = result.find((s) => s.user_id === USER_A);
    const b = result.find((s) => s.user_id === USER_B);
    expect(a?.total).toBe(30 * POINTS_PER_RUN);
    expect(b?.total).toBe(20 * POINTS_PER_RUN);
    // No impact_sub_to row should appear in A's breakdown.
    expect(
      a?.breakdown.players.some((p) => p.impact_sub_to),
    ).toBe(false);
  });

  it("still applies the forward redirect (drafted player went OUT)", () => {
    // Sanity check: pre-existing rule still works. User A drafted Yannick
    // (OUT). Xavier (IN) wasn't drafted by anyone. A's slot should sum
    // Yannick's pre-sub stats + Xavier's post-sub stats.
    const picks = [
      pick(USER_A, 0, "y1", "Yannick"),
      pick(USER_A, 1, "a2", "Alpha"),
      pick(USER_A, 2, "a3", "Beta"),
      pick(USER_B, 3, "b1", "Bravo"),
      pick(USER_B, 4, "b2", "Charlie"),
      pick(USER_B, 5, "b3", "Delta"),
    ];
    const subs = [impactSub("y1", "Yannick", "x1", "Xavier")];
    const sc = scorecard([
      { id: "y1", name: "Yannick", runs: 20 },
      { id: "x1", name: "Xavier", runs: 30, wickets: 1, overs: 2 },
      { id: "a2", name: "Alpha" },
      { id: "a3", name: "Beta" },
      { id: "b1", name: "Bravo" },
      { id: "b2", name: "Charlie" },
      { id: "b3", name: "Delta" },
    ]);

    const result = computeScore({ picks, scorecard: sc, impactSubs: subs });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.total).toBe(20 + 30 + 25);
    const xavierRow = a?.breakdown.players.find((p) => p.player_id === "x1");
    expect(xavierRow?.impact_sub_from).toEqual({
      player_id: "y1",
      player_name: "Yannick",
    });
  });

  it("avoids double-counting when both forward and reverse would otherwise fire on the same sub", () => {
    // Pathological: A drafted both Yannick (OUT) and Xavier (IN). They
    // should each score once via the normal pick path; no extra
    // redirect rows should be added.
    const picks = [
      pick(USER_A, 0, "y1", "Yannick"),
      pick(USER_A, 1, "x1", "Xavier"),
      pick(USER_A, 2, "a3", "Beta"),
      pick(USER_B, 3, "b1", "Bravo"),
      pick(USER_B, 4, "b2", "Charlie"),
      pick(USER_B, 5, "b3", "Delta"),
    ];
    const subs = [impactSub("y1", "Yannick", "x1", "Xavier")];
    const sc = scorecard([
      // Bowler coverage for both users so the penalty doesn't fire.
      { id: "y1", name: "Yannick", runs: 20, overs: 1 },
      { id: "x1", name: "Xavier", runs: 30 },
      { id: "a3", name: "Beta" },
      { id: "b1", name: "Bravo", overs: 1 },
      { id: "b2", name: "Charlie" },
      { id: "b3", name: "Delta" },
    ]);
    const result = computeScore({ picks, scorecard: sc, impactSubs: subs });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.total).toBe((20 + 30) * POINTS_PER_RUN);
    expect(
      a?.breakdown.players.filter((p) => p.impact_sub_from || p.impact_sub_to)
        .length,
    ).toBe(0);
  });
});

// --------------------------------------------------------------------------
// Helpers shared by the additional test groups below.
// --------------------------------------------------------------------------

function teamPick(user: string, turn: number, code: string): PickRow {
  return {
    id: `${user}-${turn}-team`,
    game_id: GAME_ID,
    user_id: user,
    turn_index: turn,
    pick_type: "team",
    player_id: null,
    player_name: null,
    team_code: code,
    created_at: "2026-04-26T00:00:00Z",
  };
}

function bowlerDesignation(
  user: string,
  player_id: string,
  player_name: string,
): BowlerDesignationRow {
  return {
    game_id: GAME_ID,
    user_id: user,
    player_id,
    player_name,
    created_at: "2026-04-26T00:00:00Z",
    updated_at: "2026-04-26T00:00:00Z",
  };
}

function scorecardWith(opts: {
  status?: string;
  matchWinner?: string;
  teams?: [string, string];
  players: Array<{
    id: string;
    name: string;
    runs?: number;
    wickets?: number;
    overs?: number;
  }>;
  /** Force a 1-innings or 2-innings shape; defaults to 1. */
  innings?: 1 | 2;
}): CricApiScorecard {
  const innings = opts.innings ?? 1;
  return {
    id: "match-1",
    name: "Test Match",
    matchType: "t20",
    status: opts.status ?? "Match ended",
    venue: "Test Stadium",
    date: "2026-04-26",
    dateTimeGMT: "2026-04-26T00:00:00Z",
    teams: opts.teams ?? ["A", "B"],
    matchEnded: true,
    matchWinner: opts.matchWinner,
    scorecard: Array.from({ length: innings }, (_, i) => ({
      inning: `Innings ${i + 1}`,
      batting: opts.players
        .filter((p) => (p.runs ?? 0) > 0)
        .map((p) => ({
          batsman: { id: p.id, name: p.name },
          r: p.runs ?? 0,
          b: 10,
          "4s": 0,
          "6s": 0,
          sr: 0,
        })),
      bowling: opts.players
        .filter((p) => (p.wickets ?? 0) > 0 || (p.overs ?? 0) > 0)
        .map((p) => ({
          bowler: { id: p.id, name: p.name },
          o: p.overs ?? 0,
          m: 0,
          r: 0,
          w: p.wickets ?? 0,
          eco: 0,
        })),
    })),
  };
}

/** Standard 6-player draft used by most non-impact-sub tests. */
function standardPicks(): PickRow[] {
  return [
    pick(USER_A, 0, "a1", "Alpha"),
    pick(USER_A, 1, "a2", "Alpha2"),
    pick(USER_A, 2, "a3", "Alpha3"),
    pick(USER_B, 3, "b1", "Bravo"),
    pick(USER_B, 4, "b2", "Bravo2"),
    pick(USER_B, 5, "b3", "Bravo3"),
  ];
}

// --------------------------------------------------------------------------
// Base scoring + team bonus
// --------------------------------------------------------------------------

describe("computeScore - base scoring", () => {
  it("scores runs at 1 point each and wickets at 25 points each", () => {
    const sc = scorecardWith({
      players: [
        { id: "a1", name: "Alpha", runs: 50 },
        { id: "a2", name: "Alpha2", wickets: 2, overs: 4 },
        { id: "a3", name: "Alpha3", runs: 10, overs: 1 },
        { id: "b1", name: "Bravo", overs: 1 },
        { id: "b2", name: "Bravo2" },
        { id: "b3", name: "Bravo3" },
      ],
    });
    const result = computeScore({ picks: standardPicks(), scorecard: sc });
    const a = result.find((s) => s.user_id === USER_A);
    // 50 + (2*25) + 10 = 110
    expect(a?.runs_points).toBe(60);
    expect(a?.wickets_points).toBe(50);
    expect(a?.total).toBe(110);
  });

  it("ignores stats from players nobody drafted", () => {
    const sc = scorecardWith({
      players: [
        { id: "a1", name: "Alpha", runs: 50 },
        { id: "ghost", name: "Random Sub", runs: 80, wickets: 3 },
        { id: "b1", name: "Bravo", overs: 1 },
        { id: "a2", name: "Alpha2", overs: 1 },
      ],
    });
    const result = computeScore({ picks: standardPicks(), scorecard: sc });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.total).toBe(50);
  });

  it("falls back to name match when scorecard player_id differs from picks player_id", () => {
    // Common CricAPI gotcha: squad endpoint and scorecard endpoint return
    // different IDs for the same player.
    const picks: PickRow[] = [
      pick(USER_A, 0, "squad-id-1", "Virat Kohli"),
      pick(USER_A, 1, "a2", "Alpha2"),
      pick(USER_A, 2, "a3", "Alpha3"),
      pick(USER_B, 3, "b1", "Bravo"),
      pick(USER_B, 4, "b2", "Bravo2"),
      pick(USER_B, 5, "b3", "Bravo3"),
    ];
    const sc = scorecardWith({
      players: [
        { id: "scorecard-id-1", name: "VIRAT KOHLI", runs: 75 },
        { id: "a2", name: "Alpha2", overs: 1 },
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({ picks, scorecard: sc });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.total).toBe(75);
  });
});

describe("computeScore - team bonus", () => {
  it("awards 75 points when the picked team wins", () => {
    const picks = [
      ...standardPicks(),
      teamPick(USER_A, 6, "CSK"),
      teamPick(USER_B, 7, "MI"),
    ];
    const sc = scorecardWith({
      teams: ["Chennai Super Kings", "Mumbai Indians"],
      matchWinner: "Chennai Super Kings",
      players: [
        { id: "a1", name: "Alpha", overs: 1 },
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({ picks, scorecard: sc });
    const a = result.find((s) => s.user_id === USER_A);
    const b = result.find((s) => s.user_id === USER_B);
    expect(a?.team_bonus).toBe(POINTS_TEAM_WIN_BONUS);
    expect(b?.team_bonus).toBe(0);
  });

  it("derives the winner from status when matchWinner is missing", () => {
    const picks = [
      ...standardPicks(),
      teamPick(USER_A, 6, "MI"),
      teamPick(USER_B, 7, "MI"),
    ];
    const sc = scorecardWith({
      status: "Mumbai Indians won by 5 wickets",
      players: [
        { id: "a1", name: "Alpha", overs: 1 },
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({ picks, scorecard: sc });
    expect(result.find((s) => s.user_id === USER_A)?.team_bonus).toBe(75);
    expect(result.find((s) => s.user_id === USER_B)?.team_bonus).toBe(75);
  });

  it("awards 0 to both users when no winner can be resolved", () => {
    const picks = [
      ...standardPicks(),
      teamPick(USER_A, 6, "CSK"),
      teamPick(USER_B, 7, "MI"),
    ];
    const sc = scorecardWith({
      status: "Match in progress",
      players: [
        { id: "a1", name: "Alpha", overs: 1 },
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({ picks, scorecard: sc });
    expect(result.find((s) => s.user_id === USER_A)?.team_bonus).toBe(0);
    expect(result.find((s) => s.user_id === USER_B)?.team_bonus).toBe(0);
  });

  it("honours winnerOverride for admin corrections", () => {
    const picks = [
      ...standardPicks(),
      teamPick(USER_A, 6, "CSK"),
      teamPick(USER_B, 7, "MI"),
    ];
    const sc = scorecardWith({
      matchWinner: "Mumbai Indians",
      players: [
        { id: "a1", name: "Alpha", overs: 1 },
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({
      picks,
      scorecard: sc,
      winnerOverride: "Chennai Super Kings",
    });
    expect(result.find((s) => s.user_id === USER_A)?.team_bonus).toBe(75);
    expect(result.find((s) => s.user_id === USER_B)?.team_bonus).toBe(0);
  });
});

// --------------------------------------------------------------------------
// Bowler-coverage penalty (Rule 2)
// --------------------------------------------------------------------------

describe("computeScore - bowler penalty", () => {
  it("does not fire when at least one drafted player bowled", () => {
    const sc = scorecardWith({
      players: [
        { id: "a1", name: "Alpha", runs: 30 },
        { id: "a2", name: "Alpha2", runs: 20 },
        { id: "a3", name: "Alpha3", overs: 4, wickets: 1 },
        { id: "b1", name: "Bravo", overs: 4 },
      ],
    });
    const result = computeScore({ picks: standardPicks(), scorecard: sc });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.breakdown.bowler_penalty_applied).toBeUndefined();
    expect(a?.runs_points).toBe(50);
    expect(a?.wickets_points).toBe(25);
  });

  it("zeros only the designated bowler when no drafted player bowled", () => {
    const sc = scorecardWith({
      players: [
        { id: "a1", name: "Alpha", runs: 30 },
        { id: "a2", name: "Alpha2", runs: 40 },
        { id: "a3", name: "Alpha3", runs: 50 }, // designated; didn't bowl
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({
      picks: standardPicks(),
      scorecard: sc,
      bowlerDesignations: [bowlerDesignation(USER_A, "a3", "Alpha3")],
    });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.breakdown.bowler_penalty_applied).toBe("designated-only");
    // Alpha (30) + Alpha2 (40), Alpha3 zeroed = 70
    expect(a?.total).toBe(70);
    const a3 = a?.breakdown.players.find((p) => p.player_id === "a3");
    expect(a3?.total).toBe(0);
  });

  it("zeros all 3 contributions when no bowler designated AND nobody bowled", () => {
    const sc = scorecardWith({
      players: [
        { id: "a1", name: "Alpha", runs: 30 },
        { id: "a2", name: "Alpha2", runs: 40 },
        { id: "a3", name: "Alpha3", runs: 50 },
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({ picks: standardPicks(), scorecard: sc });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.breakdown.bowler_penalty_applied).toBe("all-three");
    expect(a?.total).toBe(0);
  });

  it("does not affect the team bonus when penalty fires", () => {
    const picks = [
      ...standardPicks(),
      teamPick(USER_A, 6, "CSK"),
      teamPick(USER_B, 7, "MI"),
    ];
    const sc = scorecardWith({
      teams: ["Chennai Super Kings", "Mumbai Indians"],
      matchWinner: "Chennai Super Kings",
      players: [
        { id: "a1", name: "Alpha", runs: 30 },
        { id: "a2", name: "Alpha2", runs: 40 },
        { id: "a3", name: "Alpha3", runs: 50 },
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({ picks, scorecard: sc });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.breakdown.bowler_penalty_applied).toBe("all-three");
    expect(a?.team_bonus).toBe(POINTS_TEAM_WIN_BONUS);
    expect(a?.total).toBe(POINTS_TEAM_WIN_BONUS);
  });

  it("treats an impact-sub replacement that bowled as bowler coverage", () => {
    // User A drafted Alpha (designated) + Alpha2 + Alpha3. Alpha got
    // subbed out for Replacement (not drafted by anyone). Replacement
    // bowled. Penalty must NOT fire — a contributing slot covered bowling.
    const picks = [
      pick(USER_A, 0, "a1", "Alpha"),
      pick(USER_A, 1, "a2", "Alpha2"),
      pick(USER_A, 2, "a3", "Alpha3"),
      pick(USER_B, 3, "b1", "Bravo"),
      pick(USER_B, 4, "b2", "Bravo2"),
      pick(USER_B, 5, "b3", "Bravo3"),
    ];
    const subs = [impactSub("a1", "Alpha", "rep1", "Replacement")];
    const sc = scorecardWith({
      players: [
        { id: "a1", name: "Alpha" },
        { id: "rep1", name: "Replacement", overs: 4, wickets: 2 },
        { id: "a2", name: "Alpha2", runs: 20 },
        { id: "a3", name: "Alpha3", runs: 30 },
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({
      picks,
      scorecard: sc,
      impactSubs: subs,
      bowlerDesignations: [bowlerDesignation(USER_A, "a1", "Alpha")],
    });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.breakdown.bowler_penalty_applied).toBeUndefined();
    // Alpha (0) + Replacement (2*25=50) + Alpha2 (20) + Alpha3 (30) = 100
    expect(a?.total).toBe(100);
  });

  it("zeros BOTH the designated player and their impact-sub replacement when neither bowled", () => {
    // User A's designated bowler was subbed out and the replacement also
    // didn't bowl. Both halves of the slot are zeroed; the other 2 picks
    // keep their points.
    const picks = [
      pick(USER_A, 0, "a1", "Alpha"),
      pick(USER_A, 1, "a2", "Alpha2"),
      pick(USER_A, 2, "a3", "Alpha3"),
      pick(USER_B, 3, "b1", "Bravo"),
      pick(USER_B, 4, "b2", "Bravo2"),
      pick(USER_B, 5, "b3", "Bravo3"),
    ];
    const subs = [impactSub("a1", "Alpha", "rep1", "Replacement")];
    const sc = scorecardWith({
      players: [
        { id: "a1", name: "Alpha", runs: 10 },
        { id: "rep1", name: "Replacement", runs: 80 },
        { id: "a2", name: "Alpha2", runs: 20 },
        { id: "a3", name: "Alpha3", runs: 30 },
        { id: "b1", name: "Bravo", overs: 1 },
      ],
    });
    const result = computeScore({
      picks,
      scorecard: sc,
      impactSubs: subs,
      bowlerDesignations: [bowlerDesignation(USER_A, "a1", "Alpha")],
    });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.breakdown.bowler_penalty_applied).toBe("designated-only");
    // Alpha (0) + Replacement (0) + Alpha2 (20) + Alpha3 (30) = 50
    expect(a?.total).toBe(50);
    const replacement = a?.breakdown.players.find(
      (p) => p.player_id === "rep1",
    );
    expect(replacement?.total).toBe(0);
  });

  it("skips the penalty entirely when isFinal=false (mid-match)", () => {
    const sc = scorecardWith({
      status: "Innings break",
      players: [
        { id: "a1", name: "Alpha", runs: 30 },
        { id: "a2", name: "Alpha2", runs: 40 },
        { id: "a3", name: "Alpha3", runs: 50 },
      ],
    });
    const result = computeScore({
      picks: standardPicks(),
      scorecard: sc,
      isFinal: false,
    });
    const a = result.find((s) => s.user_id === USER_A);
    expect(a?.breakdown.bowler_penalty_applied).toBeUndefined();
    expect(a?.total).toBe(120);
  });
});

// --------------------------------------------------------------------------
// Rain-draw guard (Rule 3 / Rule 5)
// --------------------------------------------------------------------------

describe("computeScore - rain-draw guard", () => {
  it("flags rain_draw_applied when match is rain-affected and a user has 0/3 picks play", () => {
    const sc = scorecardWith({
      status: "Match abandoned due to rain",
      players: [
        // User A's 3 picks all absent from the scorecard.
        // User B has at least one player who batted/bowled.
        { id: "b1", name: "Bravo", runs: 10 },
        { id: "b2", name: "Bravo2", overs: 1 },
      ],
    });
    const result = computeScore({ picks: standardPicks(), scorecard: sc });
    expect(result.every((s) => s.breakdown.rain_draw_applied === true)).toBe(true);
    expect(winnerFromScores(result)).toBeNull();
  });

  it("does NOT fire when match status has no rain keyword (incomplete scorecard alone)", () => {
    const sc = scorecardWith({
      status: "Match ended",
      players: [
        { id: "b1", name: "Bravo", runs: 10 },
        { id: "b2", name: "Bravo2", overs: 1 },
      ],
    });
    const result = computeScore({ picks: standardPicks(), scorecard: sc });
    expect(result.some((s) => s.breakdown.rain_draw_applied)).toBe(false);
  });

  it("does NOT fire when both users had at least one player participate", () => {
    const sc = scorecardWith({
      status: "Rain-shortened. Match reduced to 10 overs",
      players: [
        { id: "a1", name: "Alpha", runs: 30 },
        { id: "a2", name: "Alpha2", overs: 1 },
        { id: "b1", name: "Bravo", runs: 25 },
        { id: "b2", name: "Bravo2", overs: 1 },
      ],
    });
    const result = computeScore({ picks: standardPicks(), scorecard: sc });
    expect(result.some((s) => s.breakdown.rain_draw_applied)).toBe(false);
  });

  it("is skipped when isFinal=false even if status contains a rain keyword", () => {
    const sc = scorecardWith({
      status: "Rain-affected, match in progress",
      players: [
        { id: "b1", name: "Bravo", runs: 10 },
        { id: "b2", name: "Bravo2", overs: 1 },
      ],
    });
    const result = computeScore({
      picks: standardPicks(),
      scorecard: sc,
      isFinal: false,
    });
    expect(result.some((s) => s.breakdown.rain_draw_applied)).toBe(false);
  });
});

// --------------------------------------------------------------------------
// isRainAffected
// --------------------------------------------------------------------------

describe("isRainAffected", () => {
  it.each([
    ["Match abandoned due to rain", true],
    ["No result", true],
    ["D/L applied", true],
    ["DLS adjusted target", true],
    ["VJD method used", true],
    ["Match reduced to 10 overs", true],
    ["Washout", true],
    ["Match ended", false],
    ["Mumbai Indians won by 5 wickets", false],
    ["", false],
    ["Live", false],
  ])("status %j -> %s", (status, expected) => {
    const sc = scorecardWith({ status, players: [] });
    expect(isRainAffected(sc)).toBe(expected);
  });
});

// --------------------------------------------------------------------------
// winnerFromScores
// --------------------------------------------------------------------------

describe("winnerFromScores", () => {
  function score(user_id: string, total: number, rain = false): UserScore {
    return {
      user_id,
      runs_points: total,
      wickets_points: 0,
      team_bonus: 0,
      total,
      breakdown: {
        players: [],
        team_pick: null,
        team_won: false,
        team_bonus: 0,
        rain_draw_applied: rain ? true : undefined,
      },
    };
  }

  it("returns the user_id with the higher total", () => {
    expect(winnerFromScores([score("a", 100), score("b", 50)])).toBe("a");
    expect(winnerFromScores([score("a", 30), score("b", 80)])).toBe("b");
  });

  it("returns null on a tie", () => {
    expect(winnerFromScores([score("a", 75), score("b", 75)])).toBeNull();
  });

  it("returns null when ANY user has rain_draw_applied (forced draw)", () => {
    expect(
      winnerFromScores([score("a", 100, true), score("b", 50)]),
    ).toBeNull();
  });

  it("returns null on an empty array", () => {
    expect(winnerFromScores([])).toBeNull();
  });
});
