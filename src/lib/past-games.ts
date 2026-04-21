import "server-only";

import type {
  AppConfigRow,
  GameMemberRow,
  GameRow,
  MatchCachedRow,
  ScoreRow,
  UserRow,
} from "@/lib/db-types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Data layer for "past games" — the scored-games history surfaced on the
 * home screen and the `/history` route.
 *
 * Uses the service-role client because we trust these routes (they're
 * already auth-gated by middleware) and it lets us do one clean query
 * without fighting RLS.
 */

export type PastGame = {
  game: GameRow;
  match: Pick<MatchCachedRow, "match_id" | "date" | "team_a" | "team_b">;
  members: Array<GameMemberRow & { user: UserRow }>;
  scores: ScoreRow[];
};

export type HeadToHead = {
  byUser: Array<{ user: UserRow; wins: number }>;
  totalGames: number;
  recentForm: Array<{ gameId: string; winnerUserId: string | null; date: string }>;
};

/**
 * Fetch the most recent scored games. `limit` caps the number of rows;
 * the home screen uses 3–5, the /history route pages through more.
 */
export async function getPastGames(
  limit = 5,
  offset = 0,
): Promise<PastGame[]> {
  const supabase = createSupabaseServiceClient();

  const { data: games, error } = await supabase
    .from("games")
    .select("*")
    .eq("status", "scored")
    .order("scored_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error("[getPastGames] games read failed", error);
    return [];
  }
  if (!games || games.length === 0) return [];

  const gameIds = games.map((g) => g.id);
  const matchIds = [...new Set(games.map((g) => g.match_id))];

  const [{ data: matches }, { data: members }, { data: users }, { data: scores }] =
    await Promise.all([
      supabase
        .from("matches_cached")
        .select("match_id, date, team_a, team_b")
        .in("match_id", matchIds),
      supabase.from("game_members").select("*").in("game_id", gameIds),
      supabase
        .from("users")
        .select("*"),
      supabase.from("scores").select("*").in("game_id", gameIds),
    ]);

  const matchById = new Map((matches ?? []).map((m) => [m.match_id, m]));
  const userById = new Map((users ?? []).map((u: UserRow) => [u.id, u]));

  return (games as GameRow[]).map((game) => {
    const gMembers = ((members ?? []) as GameMemberRow[])
      .filter((m) => m.game_id === game.id)
      .map((m) => ({ ...m, user: userById.get(m.user_id)! }))
      .filter((m) => m.user);
    const gScores = ((scores ?? []) as ScoreRow[]).filter(
      (s) => s.game_id === game.id,
    );
    return {
      game,
      match: matchById.get(game.match_id)!,
      members: gMembers,
      scores: gScores,
    };
  });
}

/**
 * Build the head-to-head tally across all scored games. Tiny dataset so
 * we just count client-side.
 */
export async function getHeadToHead(): Promise<HeadToHead> {
  const supabase = createSupabaseServiceClient();

  const [{ data: games }, { data: users }, { data: configRow }] =
    await Promise.all([
      supabase
        .from("games")
        .select("id, winner_user_id, scored_at")
        .eq("status", "scored")
        .order("scored_at", { ascending: false }),
      supabase.from("users").select("*"),
      supabase
        .from("app_config")
        .select("h2h_offset")
        .eq("key", "singleton")
        .maybeSingle(),
    ]);

  const userList = (users ?? []) as UserRow[];
  const winCounts = new Map<string, number>();
  for (const g of games ?? []) {
    if (g.winner_user_id) {
      winCounts.set(g.winner_user_id, (winCounts.get(g.winner_user_id) ?? 0) + 1);
    }
  }

  // Fold in the admin-configured H2H offset (e.g. pre-app WhatsApp tally).
  // Shape: { [user_id]: wins }. Missing table or row ⇒ empty offset.
  const offset =
    ((configRow as Pick<AppConfigRow, "h2h_offset"> | null)?.h2h_offset ?? {}) as Record<
      string,
      number
    >;

  const offsetTotal = Object.values(offset).reduce(
    (acc, n) => acc + (Number.isFinite(n) ? n : 0),
    0,
  );

  return {
    byUser: userList
      .map((u) => ({
        user: u,
        wins: (winCounts.get(u.id) ?? 0) + (offset[u.id] ?? 0),
      }))
      .sort((a, b) => b.wins - a.wins),
    totalGames: (games?.length ?? 0) + offsetTotal,
    recentForm: (games ?? []).slice(0, 5).map((g) => ({
      gameId: g.id,
      winnerUserId: g.winner_user_id,
      date: g.scored_at ?? "",
    })),
  };
}
