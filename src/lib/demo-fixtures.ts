/**
 * Static cricket-data fixtures used when DEMO_MODE=1.
 *
 * These emulate the shape of CricAPI responses precisely enough that the
 * cache layer, the scoring engine, and all UI components can consume them
 * without caring that they're fake. Nothing here makes network calls; it's
 * safe to import from anywhere.
 *
 * Edit the preset scorecards below to create new scoring scenarios.
 */

import type {
  CricApiMatchSummary,
  CricApiScorecard,
  CricApiSquadEntry,
} from "@/lib/cricket";

// ---------------------------------------------------------------------------
// Fixture + squads
// ---------------------------------------------------------------------------

export const DEMO_MATCH_ID = "demo-match-2026";
const DEMO_VENUE = "Demo Stadium, Mumbai";

/**
 * Build the fake fixture row. The date shifts based on the configured
 * match_state so the home-state resolver lands in the right bucket:
 *   - not-started → 3 hours in the future
 *   - live        → 30 min in the past (match is in-progress)
 *   - finished    → 5 hours in the past
 */
export function demoFixture(
  matchState: "not-started" | "live" | "finished",
): CricApiMatchSummary {
  const now = Date.now();
  const offsetMs =
    matchState === "not-started"
      ? 3 * 60 * 60 * 1000
      : matchState === "live"
        ? -30 * 60 * 1000
        : -5 * 60 * 60 * 1000;
  const dt = new Date(now + offsetMs);

  return {
    id: DEMO_MATCH_ID,
    name: "Chennai Super Kings vs Mumbai Indians, Demo",
    matchType: "t20",
    status:
      matchState === "not-started"
        ? "Match not started"
        : matchState === "live"
          ? "Live"
          : "Match ended",
    venue: DEMO_VENUE,
    date: dt.toISOString().slice(0, 10),
    dateTimeGMT: dt.toISOString(),
    teams: ["Chennai Super Kings", "Mumbai Indians"],
    teamInfo: [
      { name: "Chennai Super Kings", shortname: "CSK" },
      { name: "Mumbai Indians", shortname: "MI" },
    ],
    series_id: "demo-series-2026",
    hasSquad: true,
    matchStarted: matchState !== "not-started",
    matchEnded: matchState === "finished",
  };
}

function makePlayer(idx: number, prefix: string, name: string, role?: string) {
  return {
    id: `demo-${prefix}-${idx.toString().padStart(2, "0")}`,
    name,
    role: role ?? "Batting Allrounder",
    country: "India",
  };
}

/**
 * 15 players per team — enough to make picking feel real and to leave
 * benched / unplayed slots for rain-draw testing.
 */
export const DEMO_SQUADS: CricApiSquadEntry[] = [
  {
    teamName: "Chennai Super Kings",
    shortname: "CSK",
    players: [
      makePlayer(1, "csk", "Ruturaj Gaikwad", "Batter"),
      makePlayer(2, "csk", "Devon Conway", "Batter"),
      makePlayer(3, "csk", "Rachin Ravindra", "Batting Allrounder"),
      makePlayer(4, "csk", "Shivam Dube", "Batting Allrounder"),
      makePlayer(5, "csk", "MS Dhoni", "WK Batter"),
      makePlayer(6, "csk", "Ravindra Jadeja", "Bowling Allrounder"),
      makePlayer(7, "csk", "Sam Curran", "Bowling Allrounder"),
      makePlayer(8, "csk", "Mitchell Santner", "Bowler"),
      makePlayer(9, "csk", "Deepak Chahar", "Bowler"),
      makePlayer(10, "csk", "Matheesha Pathirana", "Bowler"),
      makePlayer(11, "csk", "Tushar Deshpande", "Bowler"),
      makePlayer(12, "csk", "Shaik Rasheed", "Batter"),
      makePlayer(13, "csk", "Nishant Sindhu", "Bowling Allrounder"),
      makePlayer(14, "csk", "Ajinkya Rahane", "Batter"),
      makePlayer(15, "csk", "Ajay Mandal", "Bowler"),
    ],
  },
  {
    teamName: "Mumbai Indians",
    shortname: "MI",
    players: [
      makePlayer(1, "mi", "Rohit Sharma", "Batter"),
      makePlayer(2, "mi", "Ishan Kishan", "WK Batter"),
      makePlayer(3, "mi", "Suryakumar Yadav", "Batter"),
      makePlayer(4, "mi", "Tilak Varma", "Batter"),
      makePlayer(5, "mi", "Hardik Pandya", "Bowling Allrounder"),
      makePlayer(6, "mi", "Tim David", "Batter"),
      makePlayer(7, "mi", "Piyush Chawla", "Bowler"),
      makePlayer(8, "mi", "Jasprit Bumrah", "Bowler"),
      makePlayer(9, "mi", "Gerald Coetzee", "Bowler"),
      makePlayer(10, "mi", "Akash Madhwal", "Bowler"),
      makePlayer(11, "mi", "Kumar Kartikeya", "Bowler"),
      makePlayer(12, "mi", "Nehal Wadhera", "Batter"),
      makePlayer(13, "mi", "Dewald Brevis", "Batter"),
      makePlayer(14, "mi", "Romario Shepherd", "Bowling Allrounder"),
      makePlayer(15, "mi", "Shams Mulani", "Bowler"),
    ],
  },
];

// ---------------------------------------------------------------------------
// Scorecard scenarios
// ---------------------------------------------------------------------------

/**
 * Scenario keys. UI + API wire these through as text; if you add one here,
 * also add it to the allow-list in /api/demo/simulate.
 */
export type DemoScenario =
  | "normal"
  | "rain-draw"
  | "rain-no-draw"
  | "bowler-penalty"
  | "impact-sub";

export const DEMO_SCENARIOS: Array<{ id: DemoScenario; label: string; hint: string }> = [
  { id: "normal", label: "Normal finish", hint: "MI wins, both teams batted & bowled" },
  {
    id: "rain-draw",
    label: "Rain draw (one user has no picks play)",
    hint: "Forces draw via rule 5",
  },
  {
    id: "rain-no-draw",
    label: "Rain but both users' picks played",
    hint: "Match is rain-affected but rule 5 does NOT fire",
  },
  {
    id: "bowler-penalty",
    label: "Bowler penalty (no bowlers for one user)",
    hint: "Zeros that user's player points",
  },
  {
    id: "impact-sub",
    label: "Impact sub scenario",
    hint: "One CSK player benched; report it in the card",
  },
];

/**
 * Shorthand to look up a player's ID by display name within a team, so we
 * can write readable scorecard tables below.
 */
function pid(teamShort: "csk" | "mi", name: string): string {
  const team = DEMO_SQUADS.find((t) => t.shortname?.toLowerCase() === teamShort)!;
  const p = team.players.find((p) => p.name === name);
  if (!p) throw new Error(`demo-fixtures: player not found: ${teamShort}/${name}`);
  return p.id;
}

type BatRow = { name: string; id: string; r: number; b: number };
type BowlRow = { name: string; id: string; o: number; w: number; r: number };

function batting(team: "csk" | "mi", rows: Array<[string, number, number]>): BatRow[] {
  return rows.map(([name, r, b]) => ({ name, id: pid(team, name), r, b }));
}
function bowling(
  team: "csk" | "mi",
  rows: Array<[string, number, number, number]>,
): BowlRow[] {
  return rows.map(([name, o, w, r]) => ({ name, id: pid(team, name), o, w, r }));
}

function toInning(
  teamName: string,
  bats: BatRow[],
  bowls: BowlRow[],
): CricApiScorecard["scorecard"] extends (infer T)[] | undefined ? T : never {
  const totalRuns = bats.reduce((s, b) => s + b.r, 0);
  return {
    inning: `${teamName} Inning`,
    batting: bats.map((b) => ({
      batsman: { id: b.id, name: b.name },
      r: b.r,
      b: b.b,
      "4s": 0,
      "6s": 0,
      sr: b.b > 0 ? Math.round((b.r / b.b) * 10000) / 100 : 0,
    })),
    bowling: bowls.map((bo) => ({
      bowler: { id: bo.id, name: bo.name },
      o: bo.o,
      m: 0,
      r: bo.r,
      w: bo.w,
      eco: bo.o > 0 ? Math.round((bo.r / bo.o) * 100) / 100 : 0,
    })),
    total: { r: totalRuns },
  };
}

function scorecardShell(
  matchState: "live" | "finished",
  status: string,
  matchWinner: string | null,
  innings: ReturnType<typeof toInning>[],
): CricApiScorecard {
  const fixture = demoFixture(matchState);
  return {
    id: fixture.id,
    name: fixture.name,
    matchType: fixture.matchType,
    status,
    venue: fixture.venue,
    date: fixture.date,
    dateTimeGMT: fixture.dateTimeGMT,
    teams: fixture.teams,
    teamInfo: fixture.teamInfo,
    scorecard: innings,
    matchStarted: true,
    matchEnded: matchState === "finished",
    matchWinner: matchWinner ?? undefined,
  };
}

/**
 * Build a preset scorecard. `matchState` only affects whether matchEnded is
 * true and the status string — the stats stay the same, so you can watch
 * scoring evolve by flipping state without changing scenario.
 */
export function demoScorecard(
  scenario: DemoScenario,
  matchState: "live" | "finished",
): CricApiScorecard {
  switch (scenario) {
    case "normal": {
      // CSK 180, MI chases, MI wins. Everyone batted, several bowled.
      const cskBat = batting("csk", [
        ["Ruturaj Gaikwad", 62, 40],
        ["Devon Conway", 28, 22],
        ["Shivam Dube", 35, 18],
        ["MS Dhoni", 24, 12],
        ["Ravindra Jadeja", 18, 10],
        ["Sam Curran", 6, 5],
      ]);
      const miBowl = bowling("mi", [
        ["Jasprit Bumrah", 4, 2, 30],
        ["Hardik Pandya", 3, 1, 28],
        ["Gerald Coetzee", 4, 1, 42],
        ["Piyush Chawla", 4, 0, 38],
        ["Akash Madhwal", 4, 1, 34],
      ]);
      const miBat = batting("mi", [
        ["Rohit Sharma", 45, 28],
        ["Ishan Kishan", 52, 34],
        ["Suryakumar Yadav", 40, 25],
        ["Tilak Varma", 22, 12],
        ["Hardik Pandya", 18, 10],
        ["Tim David", 8, 6],
      ]);
      const cskBowl = bowling("csk", [
        ["Deepak Chahar", 4, 1, 32],
        ["Matheesha Pathirana", 4, 2, 28],
        ["Mitchell Santner", 4, 1, 36],
        ["Ravindra Jadeja", 4, 0, 30],
        ["Tushar Deshpande", 3, 0, 34],
      ]);
      return scorecardShell(
        matchState,
        matchState === "finished"
          ? "Mumbai Indians won by 5 wickets"
          : "Live - MI chasing",
        matchState === "finished" ? "Mumbai Indians" : null,
        [toInning("CSK", cskBat, miBowl), toInning("MI", miBat, cskBowl)],
      );
    }

    case "rain-draw": {
      // Rain after ~4 overs, barely any play. Only deep-bench players feature
      // so that a typical draft of marquee players has zero appearances,
      // reliably triggering rule 5 (forced draw).
      //
      // The only players who "played" here are Ajay Mandal (CSK #15) and
      // Shams Mulani (MI #15) — both low-profile bench picks. If you drafted
      // ANY of them, rule 5 won't fire for you. Redraft if you need to test
      // the draw.
      const cskBat = batting("csk", [
        ["Ajay Mandal", 4, 6],
      ]);
      const miBowl = bowling("mi", [
        ["Shams Mulani", 1, 0, 8],
      ]);
      return scorecardShell(
        matchState,
        matchState === "finished"
          ? "Match abandoned due to rain - No result"
          : "Live - Rain delay",
        null,
        [toInning("CSK", cskBat, miBowl)],
      );
    }

    case "rain-no-draw": {
      // Rain-shortened to 10 overs, but plenty of players featured on both
      // teams. D/L decides a winner. Rule 5 should NOT fire as long as each
      // user has at least one pick appear — which with 5-6 featured players
      // per team is very likely.
      const cskBat = batting("csk", [
        ["Ruturaj Gaikwad", 35, 22],
        ["Devon Conway", 18, 14],
        ["Rachin Ravindra", 22, 12],
        ["Shivam Dube", 14, 8],
        ["MS Dhoni", 8, 4],
      ]);
      const miBowl = bowling("mi", [
        ["Jasprit Bumrah", 2, 1, 14],
        ["Hardik Pandya", 2, 0, 18],
        ["Gerald Coetzee", 2, 1, 16],
        ["Piyush Chawla", 2, 0, 22],
        ["Akash Madhwal", 2, 1, 20],
      ]);
      const miBat = batting("mi", [
        ["Rohit Sharma", 28, 18],
        ["Ishan Kishan", 24, 14],
        ["Suryakumar Yadav", 18, 10],
        ["Tilak Varma", 14, 8],
        ["Hardik Pandya", 10, 6],
      ]);
      const cskBowl = bowling("csk", [
        ["Deepak Chahar", 2, 1, 16],
        ["Matheesha Pathirana", 2, 0, 14],
        ["Mitchell Santner", 2, 1, 18],
        ["Ravindra Jadeja", 2, 0, 16],
        ["Sam Curran", 2, 0, 20],
      ]);
      return scorecardShell(
        matchState,
        matchState === "finished"
          ? "Mumbai Indians won by 12 runs (D/L method)"
          : "Live - Reduced to 10 overs (rain)",
        matchState === "finished" ? "Mumbai Indians" : null,
        [toInning("CSK", cskBat, miBowl), toInning("MI", miBat, cskBowl)],
      );
    }

    case "bowler-penalty": {
      // Like 'normal' but MI's bowling is done entirely by part-timers that
      // are NOT part of CSK or MI's squad listing. If you drafted 3 batters
      // from one team, rule 3 will zero your player points. (Pairs well
      // with drafting only batters.)
      const cskBat = batting("csk", [
        ["Ruturaj Gaikwad", 72, 45],
        ["Devon Conway", 38, 28],
        ["Shivam Dube", 42, 22],
        ["MS Dhoni", 28, 16],
        ["Rachin Ravindra", 15, 10],
      ]);
      // Only a couple of bowlers bowled — makes it more likely your draft
      // doesn't include one of them.
      const miBowl = bowling("mi", [
        ["Jasprit Bumrah", 4, 2, 30],
        ["Gerald Coetzee", 4, 1, 42],
      ]);
      const miBat = batting("mi", [
        ["Rohit Sharma", 52, 32],
        ["Ishan Kishan", 48, 30],
        ["Suryakumar Yadav", 60, 35],
        ["Tilak Varma", 28, 14],
      ]);
      const cskBowl = bowling("csk", [
        ["Deepak Chahar", 4, 1, 34],
        ["Matheesha Pathirana", 4, 2, 30],
      ]);
      return scorecardShell(
        matchState,
        matchState === "finished"
          ? "Mumbai Indians won by 6 wickets"
          : "Live",
        matchState === "finished" ? "Mumbai Indians" : null,
        [toInning("CSK", cskBat, miBowl), toInning("MI", miBat, cskBowl)],
      );
    }

    case "impact-sub": {
      // Storyline: CSK's Shivam Dube was impact-subbed OUT, Sam Curran
      // came IN late. Dube has modest stats; Curran explodes. If the user
      // who drafted Dube reports the sub via the UI and Curran wasn't
      // drafted by the other user, they inherit Curran's points.
      const cskBat = batting("csk", [
        ["Ruturaj Gaikwad", 55, 38],
        ["Devon Conway", 30, 22],
        ["Shivam Dube", 12, 10], // subbed out after innings
        ["MS Dhoni", 28, 14],
        ["Ravindra Jadeja", 22, 12],
        ["Sam Curran", 48, 20], // the impact sub — big score
      ]);
      const miBowl = bowling("mi", [
        ["Jasprit Bumrah", 4, 2, 32],
        ["Hardik Pandya", 3, 1, 28],
        ["Gerald Coetzee", 4, 1, 44],
        ["Piyush Chawla", 4, 0, 40],
        ["Akash Madhwal", 4, 1, 36],
      ]);
      const miBat = batting("mi", [
        ["Rohit Sharma", 40, 25],
        ["Ishan Kishan", 48, 30],
        ["Suryakumar Yadav", 35, 22],
        ["Tilak Varma", 18, 10],
        ["Hardik Pandya", 22, 12],
      ]);
      // Sam Curran also bowled — rewards the inheritor with wickets too.
      const cskBowl = bowling("csk", [
        ["Deepak Chahar", 4, 1, 30],
        ["Matheesha Pathirana", 4, 2, 32],
        ["Mitchell Santner", 4, 0, 38],
        ["Ravindra Jadeja", 4, 1, 28],
        ["Sam Curran", 4, 3, 26],
      ]);
      return scorecardShell(
        matchState,
        matchState === "finished"
          ? "Chennai Super Kings won by 18 runs"
          : "Live",
        matchState === "finished" ? "Chennai Super Kings" : null,
        [toInning("CSK", cskBat, miBowl), toInning("MI", miBat, cskBowl)],
      );
    }
  }
}
