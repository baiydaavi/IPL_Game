import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import type { CricApiSquadEntry } from "@/lib/cricket";
import type { GameRow } from "@/lib/db-types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/games/[id]/add-squad-player
 *
 * Body: { team_name: string, player_name: string, role?: string, player_id?: string }
 *
 * Appends a player to the cached squad JSON for this match. Purely a cache
 * mutation — no CricAPI call. Intended for late-breaking additions the
 * upstream API has missed (e.g. CricAPI's free-tier rosters often lag
 * replacement/overseas additions).
 *
 * Guarantees:
 *   - team_name must match one of the teams already in the cached squad.
 *   - duplicate player_id ⇒ 409 (idempotent add not allowed; admin must
 *     edit the existing entry via a future tool, or refresh upstream).
 *   - missing player_id is auto-generated as `manual-<slug>-<team_code>`
 *     so re-adding the same name is a 409 rather than silently creating
 *     a duplicate row.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id: gameId } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    team_name?: unknown;
    player_name?: unknown;
    role?: unknown;
    player_id?: unknown;
  };

  const teamName = typeof body.team_name === "string" ? body.team_name.trim() : "";
  const playerName =
    typeof body.player_name === "string" ? body.player_name.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const providedId =
    typeof body.player_id === "string" ? body.player_id.trim() : "";

  if (!teamName) {
    return NextResponse.json({ error: "missing_team_name" }, { status: 400 });
  }
  if (!playerName) {
    return NextResponse.json({ error: "missing_player_name" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();

  const { data: gameData } = await admin
    .from("games")
    .select("match_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameData) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const game = gameData as Pick<GameRow, "match_id">;

  const { data: squadRow } = await admin
    .from("squads_cached")
    .select("raw_json")
    .eq("match_id", game.match_id)
    .maybeSingle();

  const squad = ((squadRow?.raw_json ?? []) as CricApiSquadEntry[]).map((t) => ({
    ...t,
    players: [...t.players],
  }));

  if (squad.length === 0) {
    return NextResponse.json(
      {
        error: "squad_empty",
        message: "No cached squad for this match yet. Refresh upstream first.",
      },
      { status: 409 },
    );
  }

  // Match team by exact name, then short-name, then case-insensitive.
  const teamLower = teamName.toLowerCase();
  const teamIdx = squad.findIndex((t) => {
    if (t.teamName === teamName) return true;
    if (t.shortname && t.shortname === teamName) return true;
    if (t.teamName.toLowerCase() === teamLower) return true;
    if (t.shortname?.toLowerCase() === teamLower) return true;
    return false;
  });
  if (teamIdx < 0) {
    return NextResponse.json(
      {
        error: "unknown_team",
        message: `Team '${teamName}' isn't in this match's squad`,
        available_teams: squad.map((t) => t.teamName),
      },
      { status: 400 },
    );
  }

  const team = squad[teamIdx];

  // Generate a stable id if the admin didn't paste one. Slug on name +
  // team short-code so re-adding the same player idempotently collides.
  const nameSlug = playerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const teamSlug = (team.shortname ?? team.teamName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const finalId = providedId || `manual-${nameSlug}-${teamSlug}`;

  // Duplicate detection — scan ALL teams, not just the target, because the
  // same id should never exist twice in the whole squad blob.
  for (const t of squad) {
    const dup = t.players.find((p) => p.id === finalId);
    if (dup) {
      return NextResponse.json(
        {
          error: "duplicate_player",
          message: `Player id '${finalId}' already exists as '${dup.name}' on '${t.teamName}'`,
        },
        { status: 409 },
      );
    }
  }

  team.players.push({
    id: finalId,
    name: playerName,
    role: role || undefined,
  });

  const { error: upsertError } = await admin.from("squads_cached").upsert(
    {
      match_id: game.match_id,
      raw_json: squad,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
  if (upsertError) {
    console.error("[add-squad-player] upsert failed", upsertError);
    return NextResponse.json(
      { error: "db_error", message: upsertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    player: { id: finalId, name: playerName, team: team.teamName, role: role || null },
  });
}
