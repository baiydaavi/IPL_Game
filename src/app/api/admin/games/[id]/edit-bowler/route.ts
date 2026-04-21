import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { rescoreAfterEdit } from "@/lib/admin-rescore";
import type { PickRow } from "@/lib/db-types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/games/[id]/edit-bowler
 * Body:
 *   { user_id: string; player_id: string }  // upsert designation
 * | { user_id: string; clear: true }        // delete designation
 *
 * Admin override of a user's one-shot bowler designation. Bypasses the
 * "match already started" + one-shot checks that the user-facing
 * designate-bowler route enforces. Rescore runs on success.
 *
 * The `player_id` must be one of the target user's drafted player picks
 * (otherwise the bowler penalty references a player who isn't even on
 * that user's team).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id: gameId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    user_id?: string;
    player_id?: string;
    clear?: boolean;
  };
  if (!body.user_id) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();

  if (body.clear) {
    const { error } = await admin
      .from("bowler_designations")
      .delete()
      .eq("game_id", gameId)
      .eq("user_id", body.user_id);
    if (error) {
      console.error("[admin edit-bowler] delete failed", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
    const rescore = await rescoreAfterEdit(gameId);
    return NextResponse.json({ ok: true, cleared: true, rescored: rescore.rescored });
  }

  if (!body.player_id) {
    return NextResponse.json({ error: "missing_player_id" }, { status: 400 });
  }

  const { data: pickRows } = await admin
    .from("picks")
    .select("*")
    .eq("game_id", gameId)
    .eq("user_id", body.user_id)
    .eq("pick_type", "player");
  const picks = (pickRows ?? []) as PickRow[];
  const match = picks.find((p) => p.player_id === body.player_id);
  if (!match) {
    return NextResponse.json(
      { error: "player_not_in_user_picks" },
      { status: 400 },
    );
  }

  const { error } = await admin.from("bowler_designations").upsert(
    {
      game_id: gameId,
      user_id: body.user_id,
      player_id: match.player_id,
      player_name: match.player_name ?? "",
    },
    { onConflict: "game_id,user_id" },
  );
  if (error) {
    console.error("[admin edit-bowler] upsert failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const rescore = await rescoreAfterEdit(gameId);
  return NextResponse.json({ ok: true, rescored: rescore.rescored });
}
