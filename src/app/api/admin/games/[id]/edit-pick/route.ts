import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { rescoreAfterEdit } from "@/lib/admin-rescore";
import type { PickRow } from "@/lib/db-types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/games/[id]/edit-pick
 * Body:
 *   { pick_id: string; player_id: string; player_name: string }   // for player picks
 * | { pick_id: string; team_code: string }                        // for team picks
 *
 * Admin override that mutates an existing pick row. We DO NOT change
 * `pick_type`, `turn_index`, or `user_id` on a pick — the slot it
 * represents is fixed; only the value inside it can be rewritten.
 *
 * After a successful edit, if the game is `locked` or `scored` we
 * auto-rescore so the admin sees the updated totals without a second click.
 */
type EditBody =
  | { pick_id: string; player_id: string; player_name: string }
  | { pick_id: string; team_code: string };

function parseBody(raw: unknown): EditBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.pick_id !== "string" || b.pick_id.length === 0) return null;
  if (
    typeof b.player_id === "string" &&
    b.player_id.length > 0 &&
    typeof b.player_name === "string" &&
    b.player_name.length > 0
  ) {
    return {
      pick_id: b.pick_id,
      player_id: b.player_id,
      player_name: b.player_name,
    };
  }
  if (typeof b.team_code === "string" && b.team_code.length > 0) {
    return { pick_id: b.pick_id, team_code: b.team_code.toUpperCase() };
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id: gameId } = await params;
  const parsed = parseBody(await request.json().catch(() => ({})));
  if (!parsed) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();

  const { data: pickData } = await admin
    .from("picks")
    .select("*")
    .eq("id", parsed.pick_id)
    .eq("game_id", gameId)
    .maybeSingle();
  if (!pickData) {
    return NextResponse.json({ error: "pick_not_found" }, { status: 404 });
  }
  const pick = pickData as PickRow;

  const isPlayerBody = "player_id" in parsed;

  // Enforce: the edit must match the slot's existing pick_type. We don't
  // let admin swap a team pick row into a player pick or vice-versa —
  // that'd violate turn_index contracts (picks 0..5 = player, 6..7 = team).
  if (isPlayerBody && pick.pick_type !== "player") {
    return NextResponse.json(
      { error: "pick_type_mismatch", detail: "this slot is a team pick" },
      { status: 409 },
    );
  }
  if (!isPlayerBody && pick.pick_type !== "team") {
    return NextResponse.json(
      { error: "pick_type_mismatch", detail: "this slot is a player pick" },
      { status: 409 },
    );
  }

  const update = isPlayerBody
    ? {
        player_id: parsed.player_id,
        player_name: parsed.player_name,
        team_code: null as string | null,
      }
    : {
        player_id: null as string | null,
        player_name: null as string | null,
        team_code: parsed.team_code,
      };

  const { error: updateError } = await admin
    .from("picks")
    .update(update)
    .eq("id", parsed.pick_id)
    .eq("game_id", gameId);

  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_player", detail: "that player is already picked in this game" },
        { status: 409 },
      );
    }
    console.error("[edit-pick] update failed", updateError);
    return NextResponse.json(
      { error: "db_error", message: updateError.message },
      { status: 500 },
    );
  }

  // If we changed a player pick, clean up any bowler designation that
  // pointed at the OLD player — otherwise the user's designated bowler
  // references a player they no longer own, which would silently misfire
  // the bowler penalty.
  if (isPlayerBody && pick.player_id && pick.player_id !== parsed.player_id) {
    await admin
      .from("bowler_designations")
      .delete()
      .eq("game_id", gameId)
      .eq("user_id", pick.user_id)
      .eq("player_id", pick.player_id);
  }

  const rescore = await rescoreAfterEdit(gameId);
  return NextResponse.json({ ok: true, rescored: rescore.rescored, rescore_reason: rescore.reason });
}
