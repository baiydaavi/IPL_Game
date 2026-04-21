/**
 * Typed row shapes that mirror the Supabase schema in
 * `supabase/migrations/0001_init.sql`.
 *
 * These are hand-written (instead of generated via `supabase gen types`) to
 * keep the local dev loop independent of the Supabase CLI. Keep them in sync
 * whenever the migration changes.
 */

export type GameStatus = "drafting" | "locked" | "scored";
export type PlayerSlot = "P1" | "P2";
export type PickType = "player" | "team";

export type UserRow = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
};

export type MatchCachedRow = {
  match_id: string;
  date: string;
  team_a: string;
  team_b: string;
  status: string | null;
  venue: string | null;
  raw_json: unknown;
  fetched_at: string;
};

export type SquadCachedRow = {
  match_id: string;
  raw_json: unknown;
  fetched_at: string;
};

export type ScorecardCachedRow = {
  match_id: string;
  is_final: boolean;
  raw_json: unknown;
  fetched_at: string;
};

export type GameRow = {
  id: string;
  match_id: string;
  status: GameStatus;
  first_picker_user_id: string;
  winner_user_id: string | null;
  /**
   * Set when the draft wasn't completed before kickoff. Points at the
   * player who was on the clock at lock time — they forfeit; the other
   * player wins. See `lockIfReady` / `scoreGame` for the mechanics.
   */
  forfeit_user_id: string | null;
  created_at: string;
  locked_at: string | null;
  scored_at: string | null;
};

export type GameMemberRow = {
  game_id: string;
  user_id: string;
  slot: PlayerSlot;
};

export type PickRow = {
  id: string;
  game_id: string;
  user_id: string;
  turn_index: number;
  pick_type: PickType;
  player_id: string | null;
  player_name: string | null;
  team_code: string | null;
  created_at: string;
};

export type ScoreRow = {
  game_id: string;
  user_id: string;
  runs_points: number;
  wickets_points: number;
  team_bonus: number;
  total: number;
  breakdown: Record<string, unknown>;
  computed_at: string;
};

export type BowlerDesignationRow = {
  game_id: string;
  user_id: string;
  player_id: string;
  player_name: string;
  created_at: string;
  updated_at: string;
};

export type ImpactSubRow = {
  game_id: string;
  team_code: string;
  out_player_id: string;
  out_player_name: string;
  in_player_id: string;
  in_player_name: string;
  reported_by: string;
  created_at: string;
  updated_at: string;
};

export type AppConfigRow = {
  key: "singleton";
  /** user_id -> win-count to add to the in-app H2H tally. */
  h2h_offset: Record<string, number>;
  updated_at: string;
};
