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
import type { ImpactSubRow, PickRow } from "@/lib/db-types";
import { computeScore, POINTS_PER_RUN, POINTS_PER_WICKET } from "@/lib/scoring";

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
