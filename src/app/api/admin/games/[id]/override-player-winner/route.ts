import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import type { GameMemberRow, GameRow } from "@/lib/db-types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/games/[id]/override-player-winner
 * Body: { user_id: string | null }
 *
 * Force-set the winner of a game to a specific PLAYER (game member),
 * bypassing all scoring math. Used as the last-resort escape hatch when:
 *   - CricAPI permanently has no scorecard for the match (data gap on
 *     their content provider's end), so the normal scoring path can't
 *     run; or
 *   - The match was settled outside the app (rain rule disagreement,
 *     impact-sub miscall, etc.) and we just want to record the
 *     real-world result.
 *
 * Distinct from `override-winner` (which sets a TEAM code and re-runs the
 * scoring engine on the cached scorecard). That one's for "CricketData
 * returned a wrong matchWinner" — this one's for "we have no scorecard
 * data at all, just record who won."
 *
 * Side effects:
 *   - Sets `games.winner_user_id` to the given user (or null to clear).
 *   - Flips status to "scored" + stamps `scored_at = now()` if not
 *     already there. Once you've forced a winner the game is final.
 *   - Writes zero-stat `scores` rows for both members if none exist
 *     yet, so /history can render the row without a missing-data
 *     placeholder. Existing scores are left alone.
 *
 * H2H tally + "next first picker" both read straight off
 * `winner_user_id`, so they pick up the override automatically.
 */

type Body = { user_id?: string | null };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id: gameId } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;
  // Coerce empty string -> null so the UI can pass either to clear.
  const requestedUserId = body.user_id ? body.user_id : null;

  const admin = createSupabaseServiceClient();

  const { data: gameData } = await admin
    .from("games")
    .select("id, status, scored_at, winner_user_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const game = gameData as Pick<
    GameRow,
    "id" | "status" | "scored_at" | "winner_user_id"
  >;

  if (game.status === "drafting") {
    return NextResponse.json(
      { error: "still_drafting", reason: "still-drafting" },
      { status: 409 },
    );
  }

  const { data: memberRows } = await admin
    .from("game_members")
    .select("game_id, user_id, slot")
    .eq("game_id", gameId);
  const members = (memberRows ?? []) as GameMemberRow[];
  if (members.length === 0) {
    return NextResponse.json(
      { error: "no_members", reason: "no-members" },
      { status: 409 },
    );
  }

  if (requestedUserId !== null) {
    const isMember = members.some((m) => m.user_id === requestedUserId);
    if (!isMember) {
      return NextResponse.json(
        { error: "not_a_member", reason: "user-not-in-game" },
        { status: 400 },
      );
    }
  }

  const now = new Date().toISOString();

  // Build the games update. When clearing, we intentionally DON'T flip
  // status back to "locked" — clearing is just for fixing a typo on a
  // game that's already final, not for re-opening scoring.
  const update: Partial<GameRow> = {
    winner_user_id: requestedUserId,
  };
  if (requestedUserId !== null && game.status !== "scored") {
    update.status = "scored";
    update.scored_at = now;
  }

  const { error: updateErr } = await admin
    .from("games")
    .update(update)
    .eq("id", gameId);
  if (updateErr) {
    console.error("[override-player-winner] games update failed", updateErr);
    return NextResponse.json(
      { error: "update_failed", message: updateErr.message },
      { status: 500 },
    );
  }

  // Make sure /history can render the row even when no scores exist
  // (the common case for matches where CricAPI never produced a
  // scorecard). One row per member, zeros across the board. Skip if
  // the score row already exists — we don't want to clobber real
  // computed scores from a previous successful scoring pass.
  if (requestedUserId !== null) {
    const { data: existingScores } = await admin
      .from("scores")
      .select("user_id")
      .eq("game_id", gameId);
    const existingIds = new Set(
      (existingScores ?? []).map((s) => (s as { user_id: string }).user_id),
    );
    const toInsert = members
      .filter((m) => !existingIds.has(m.user_id))
      .map((m) => ({
        game_id: gameId,
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
          admin_forced_winner: true,
        },
        computed_at: now,
      }));
    if (toInsert.length > 0) {
      const { error: scoresErr } = await admin.from("scores").insert(toInsert);
      if (scoresErr) {
        // Non-fatal: the winner is already set on `games`. Log and
        // surface a warning but still return success.
        console.warn(
          "[override-player-winner] zero-score insert failed (non-fatal)",
          scoresErr,
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    winnerUserId: requestedUserId,
    statusFlippedToScored:
      requestedUserId !== null && game.status !== "scored",
  });
}
