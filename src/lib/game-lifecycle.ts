import "server-only";

import { getCachedScorecard } from "@/lib/cricket-cache";
import type {
  BowlerDesignationRow,
  GameMemberRow,
  GameRow,
  ImpactSubRow,
  PickRow,
} from "@/lib/db-types";
import { deriveTurnState, partitionMembers } from "@/lib/draft";
import { computeScore, winnerFromScores } from "@/lib/scoring";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Lifecycle helpers for a single game.
 *
 * lockIfReady:   drafting -> locked   when either 8 picks are in OR the
 *                match has started.
 * scoreGame:     locked   -> scored   by pulling the (possibly final) cached
 *                scorecard, running pure scoring, and writing the `scores`
 *                rows + winner.
 *
 * Both are safe to call repeatedly; they no-op when the game is already in
 * the later state.
 */

type AnyClient = ReturnType<typeof createSupabaseServiceClient>;

export async function lockIfReady(
  gameId: string,
  client?: AnyClient,
): Promise<{
  locked: boolean;
  reason: string;
  /** If the lock was a forfeit, the user who lost (on the clock at lock time). */
  forfeitUserId?: string | null;
}> {
  const supabase = client ?? createSupabaseServiceClient();

  const { data: gameData } = await supabase
    .from("games")
    .select("id, status, match_id, first_picker_user_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) return { locked: false, reason: "game-not-found" };
  if (gameData.status !== "drafting") return { locked: false, reason: "already-" + gameData.status };

  const [{ data: pickRows }, { data: match }, { data: memberRows }] =
    await Promise.all([
      supabase.from("picks").select("turn_index").eq("game_id", gameId),
      supabase
        .from("matches_cached")
        .select("date")
        .eq("match_id", gameData.match_id)
        .maybeSingle(),
      supabase
        .from("game_members")
        .select("game_id, user_id, slot")
        .eq("game_id", gameId),
    ]);

  const picks = (pickRows ?? []) as Pick<PickRow, "turn_index">[];
  const totalPicks = picks.length;
  const matchStartMs = match?.date ? new Date(match.date).getTime() : null;
  const matchStarted = matchStartMs !== null && Date.now() >= matchStartMs;

  const ready = totalPicks >= 8 || matchStarted;
  if (!ready) return { locked: false, reason: "not-ready" };

  // Forfeit detection: if the match has started and the draft isn't
  // finished, the user currently on the clock forfeits. Scoring treats
  // them as the loser regardless of the scorecard. Needs both members
  // rows to derive turn order; if they're missing we just lock without
  // a forfeit (defensive — shouldn't happen in prod).
  let forfeitUserId: string | null = null;
  if (matchStarted && totalPicks < 8) {
    const members = (memberRows ?? []) as Array<
      Pick<GameMemberRow, "game_id" | "user_id" | "slot">
    >;
    try {
      const partitioned = partitionMembers(members);
      const turnState = deriveTurnState(
        { first_picker_user_id: gameData.first_picker_user_id },
        partitioned,
        picks,
      );
      forfeitUserId = turnState.nextUserId;
    } catch (err) {
      console.warn(
        "[lockIfReady] forfeit detection failed (no/incomplete members)",
        gameId,
        err,
      );
    }
  }

  const { error } = await supabase
    .from("games")
    .update({
      status: "locked",
      locked_at: new Date().toISOString(),
      forfeit_user_id: forfeitUserId,
    })
    .eq("id", gameId)
    .eq("status", "drafting");
  if (error) {
    console.error("[lockIfReady] update failed", error);
    return { locked: false, reason: "update-failed" };
  }

  const reason =
    totalPicks >= 8
      ? "all-picks-made"
      : forfeitUserId
        ? "match-started-forfeit"
        : "match-started";
  return { locked: true, reason, forfeitUserId };
}

export type ScoreGameResult =
  | { scored: true; winnerUserId: string | null }
  | { scored: false; reason: string };

export async function scoreGame(
  gameId: string,
  options: {
    client?: AnyClient;
    forceScorecardRefresh?: boolean;
    winnerOverride?: string | null;
    requireFinal?: boolean;
    /**
     * Bypass the `status === "scored"` short-circuit so we can recompute a
     * game whose scoring logic has since changed. Used by the admin
     * "Rescore" button.
     */
    allowRescore?: boolean;
    /**
     * Write provisional `scores` rows without flipping `games.status` to
     * "scored" or setting `winner_user_id` / `scored_at`. Used by the
     * live-refresh path so the UI can show running totals mid-match
     * without prematurely sealing the result. Pair with
     * `requireFinal: false`. Rule 3 bowler-coverage and rule 5 rain-draw
     * are skipped on provisional runs to avoid punishing users for an
     * incomplete innings.
     */
    writeScoresOnly?: boolean;
  } = {},
): Promise<ScoreGameResult> {
  const supabase = options.client ?? createSupabaseServiceClient();

  const { data: gameData } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) return { scored: false, reason: "game-not-found" };

  const game = gameData as GameRow;
  if (
    game.status === "scored" &&
    options.winnerOverride === undefined &&
    !options.allowRescore
  ) {
    return { scored: false, reason: "already-scored" };
  }
  if (game.status === "drafting") {
    return { scored: false, reason: "still-drafting" };
  }

  // Forfeit short-circuit: if the draft wasn't completed before kickoff,
  // we skip scorecard tallying entirely. Winner is the non-forfeiting
  // member. Score rows are still written as zeros so the finished-match
  // UI has something to render. See 0006_forfeit.sql.
  if (game.forfeit_user_id && options.winnerOverride === undefined) {
    return await writeForfeitScore(supabase, game);
  }

  const { scorecard, isFinal } = await getCachedScorecard(game.match_id, {
    forceRefresh: options.forceScorecardRefresh,
  });

  if (options.requireFinal !== false && !isFinal && options.winnerOverride === undefined) {
    return { scored: false, reason: "scorecard-not-final" };
  }

  const { data: pickRows, error: pickErr } = await supabase
    .from("picks")
    .select("*")
    .eq("game_id", gameId);
  if (pickErr) {
    console.error("[scoreGame] picks read failed", pickErr);
    return { scored: false, reason: "picks-read-failed" };
  }
  const picks = (pickRows ?? []) as PickRow[];
  if (picks.length === 0) {
    return { scored: false, reason: "no-picks" };
  }

  // Manually-reported impact substitutions (optional — absent rows just
  // means rule 2 doesn't alter base scoring for that team) and the
  // one-shot bowler designations (optional — drives rule 3 penalty shape).
  const [{ data: impactRows }, { data: bowlerRows }] = await Promise.all([
    supabase.from("impact_subs").select("*").eq("game_id", gameId),
    supabase.from("bowler_designations").select("*").eq("game_id", gameId),
  ]);
  const impactSubs = (impactRows ?? []) as ImpactSubRow[];
  const bowlerDesignations = (bowlerRows ?? []) as BowlerDesignationRow[];

  const scores = computeScore({
    picks,
    scorecard,
    impactSubs,
    bowlerDesignations,
    winnerOverride: options.winnerOverride,
    isFinal,
  });

  const winnerUserId = winnerFromScores(scores);

  const { error: scoresError } = await supabase.from("scores").upsert(
    scores.map((s) => ({
      game_id: gameId,
      user_id: s.user_id,
      runs_points: s.runs_points,
      wickets_points: s.wickets_points,
      team_bonus: s.team_bonus,
      total: s.total,
      breakdown: s.breakdown,
      computed_at: new Date().toISOString(),
    })),
    { onConflict: "game_id,user_id" },
  );
  if (scoresError) {
    console.error("[scoreGame] scores upsert failed", scoresError);
    return { scored: false, reason: "scores-upsert-failed" };
  }

  // Provisional live-update path: write the score rows but leave the
  // game's lifecycle state alone. The end-of-match scoring run (called
  // when isFinal flips true) will overwrite these rows and flip status.
  if (options.writeScoresOnly) {
    return { scored: true, winnerUserId };
  }

  const { error: gameUpdateError } = await supabase
    .from("games")
    .update({
      status: "scored",
      winner_user_id: winnerUserId,
      scored_at: new Date().toISOString(),
    })
    .eq("id", gameId);
  if (gameUpdateError) {
    console.error("[scoreGame] game update failed", gameUpdateError);
    return { scored: false, reason: "game-update-failed" };
  }

  return { scored: true, winnerUserId };
}

/**
 * Write a forfeit result for a game whose draft didn't finish before
 * kickoff. Zero-score rows for both members, winner = the non-forfeiting
 * user, status = 'scored'. Idempotent via upsert.
 */
async function writeForfeitScore(
  supabase: AnyClient,
  game: GameRow,
): Promise<ScoreGameResult> {
  if (!game.forfeit_user_id) {
    return { scored: false, reason: "not-a-forfeit" };
  }

  const { data: memberRows, error: memberErr } = await supabase
    .from("game_members")
    .select("game_id, user_id, slot")
    .eq("game_id", game.id);
  if (memberErr) {
    console.error("[scoreGame/forfeit] members read failed", memberErr);
    return { scored: false, reason: "members-read-failed" };
  }
  const members = (memberRows ?? []) as GameMemberRow[];
  if (members.length < 2) {
    return { scored: false, reason: "forfeit-missing-members" };
  }

  const loser = game.forfeit_user_id;
  const winner = members.find((m) => m.user_id !== loser)?.user_id ?? null;

  const now = new Date().toISOString();
  const rows = members.map((m) => ({
    game_id: game.id,
    user_id: m.user_id,
    runs_points: 0,
    wickets_points: 0,
    team_bonus: 0,
    total: 0,
    breakdown: {
      players: [],
      team_pick: null,
      team_won: false,
      team_bonus: 0,
      forfeit: (m.user_id === loser ? "lost" : "won") as "lost" | "won",
    },
    computed_at: now,
  }));

  const { error: scoresError } = await supabase
    .from("scores")
    .upsert(rows, { onConflict: "game_id,user_id" });
  if (scoresError) {
    console.error("[scoreGame/forfeit] scores upsert failed", scoresError);
    return { scored: false, reason: "scores-upsert-failed" };
  }

  const { error: gameErr } = await supabase
    .from("games")
    .update({
      status: "scored",
      winner_user_id: winner,
      scored_at: now,
    })
    .eq("id", game.id);
  if (gameErr) {
    console.error("[scoreGame/forfeit] game update failed", gameErr);
    return { scored: false, reason: "game-update-failed" };
  }

  return { scored: true, winnerUserId: winner };
}
