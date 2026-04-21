/**
 * Shared types for the home-screen state resolver. Separated from
 * `home-state.ts` (server-only) so client components can import the types
 * without a server-only transitive.
 */

import type {
  BowlerDesignationRow,
  GameMemberRow,
  GameRow,
  ImpactSubRow,
  PickRow,
  ScoreRow,
  UserRow,
} from "@/lib/db-types";
import type { CachedFixture } from "@/lib/fixtures";

export type GameWithMembersAndPicks = {
  game: GameRow;
  members: Array<GameMemberRow & { user: UserRow }>;
  picks: PickRow[];
  bowlerDesignations: BowlerDesignationRow[];
  impactSubs: ImpactSubRow[];
};

export type GameWithMembersAndPicksAndScores = GameWithMembersAndPicks & {
  scores: ScoreRow[];
};

/**
 * State of a single today-window fixture card. One of these drives each
 * TopCard rendered on the home page. Multiple can exist on the same day
 * when the IPL schedules a double-header.
 */
export type HomeState =
  | { kind: "no-match-today" }
  | { kind: "match-today-no-draft"; fixture: CachedFixture }
  | { kind: "drafting"; fixture: CachedFixture; game: GameWithMembersAndPicks }
  | { kind: "locked-pre-match"; fixture: CachedFixture; game: GameWithMembersAndPicks }
  | { kind: "match-live"; fixture: CachedFixture; game: GameWithMembersAndPicksAndScores }
  | { kind: "match-finished"; fixture: CachedFixture; game: GameWithMembersAndPicksAndScores };

/**
 * Full view model for the home page: zero or more today-window cards,
 * plus the "Upcoming" list of future fixtures beyond today.
 *
 * `todays` is ordered by kickoff time ascending. If there are no fixtures
 * in the today window, `todays` contains a single `no-match-today` entry.
 */
export type HomeView = {
  todays: HomeState[];
  upcoming: CachedFixture[];
};
