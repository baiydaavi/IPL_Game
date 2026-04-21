import { NextResponse } from "next/server";

import { getCachedFixtures } from "@/lib/cricket-cache";
import {
  DEMO_MATCH_ID,
  DEMO_SCENARIOS,
  type DemoScenario,
} from "@/lib/demo-fixtures";
import {
  ensureDemoSeed,
  isDemoMode,
  writeDemoState,
  type DemoMatchState,
} from "@/lib/demo";
import { scoreGame } from "@/lib/game-lifecycle";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/demo/simulate
 * Body:
 *   { action: "reseed" }
 *     Idempotent re-seed of demo users / match / squads.
 *
 *   { action: "reset" }
 *     Delete any draft game tied to today's demo match so the draft flow
 *     can run again. Leaves demo_state, matches_cached, squads_cached
 *     alone.
 *
 *   { action: "set-state", state: "not-started" | "live" | "finished" }
 *     Flip the demo match into a given phase. Re-seeds so the cached
 *     fixture's date shifts accordingly, drops the scorecard cache so the
 *     next refresh pulls the new preset, and (when moving to 'finished' and
 *     a draft exists) auto-runs scoring so the finished card appears.
 *
 *   { action: "set-scenario", scenario: DemoScenario }
 *     Switch which preset scorecard is served. Drops scorecard cache + any
 *     existing scores so the next refresh recomputes everything.
 *
 * All actions require DEMO_MODE=1; returns 404 otherwise.
 */
export async function POST(request: Request) {
  if (!isDemoMode()) {
    return NextResponse.json({ error: "demo_disabled" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    state?: string;
    scenario?: string;
  };

  const admin = createSupabaseServiceClient();

  switch (body.action) {
    case "reseed":
      await ensureDemoSeed();
      return NextResponse.json({ ok: true });

    case "reset": {
      // Delete any draft game tied to the demo match. Picks / members /
      // scores / bowler_designations / impact_subs all cascade via FK.
      // We key off DEMO_MATCH_ID directly so stale non-demo rows in
      // matches_cached (e.g. leftovers from a previous DEMO_MODE=0 session)
      // don't shadow the real demo match.
      const { data: games } = await admin
        .from("games")
        .select("id")
        .eq("match_id", DEMO_MATCH_ID);
      for (const g of games ?? []) {
        await admin.from("games").delete().eq("id", g.id);
      }
      // Wipe any cached scorecard so a fresh one gets built for the next run.
      await admin
        .from("scorecards_cached")
        .delete()
        .eq("match_id", DEMO_MATCH_ID);
      return NextResponse.json({ ok: true, deleted: (games ?? []).length });
    }

    case "set-state": {
      const next = body.state as DemoMatchState | undefined;
      if (!next || !["not-started", "live", "finished"].includes(next)) {
        return NextResponse.json({ error: "invalid_state" }, { status: 400 });
      }
      await writeDemoState({ match_state: next });
      // Re-seed so the cached fixture's date shifts to match the new phase.
      await ensureDemoSeed();
      // Clear cached scorecard so the next refresh serves the right preset
      // (matchEnded depends on state).
      const fixtures = await getCachedFixtures().catch(() => []);
      for (const f of fixtures) {
        await admin.from("scorecards_cached").delete().eq("match_id", f.match_id);
      }
      // Flip any game tied to the demo match into the right status for the
      // new state. We look up by DEMO_MATCH_ID directly (not fixtures[0])
      // because matches_cached may contain unrelated older rows from when
      // DEMO_MODE was off — in which case fixtures[0] would be the wrong row.
      {
        const { data: games } = await admin
          .from("games")
          .select("id, status")
          .eq("match_id", DEMO_MATCH_ID);
        console.log("[simulate:set-state] games for DEMO_MATCH_ID", {
          state: next,
          count: games?.length ?? 0,
          statuses: (games ?? []).map((g) => g.status),
        });
        for (const g of games ?? []) {
          if (next === "finished") {
            // Force the game into 'locked' regardless of prior status so
            // scoreGame() has a valid starting point. This also handles the
            // case where a demo user jumped to Finished mid-draft — we just
            // lock in whatever picks they made.
            await admin
              .from("games")
              .update({ status: "locked", scored_at: null, locked_at: new Date().toISOString() })
              .eq("id", g.id);
            // requireFinal:false so demo mode always scores the preset
            // scorecard, even if matchEnded hasn't flipped upstream yet.
            const result = await scoreGame(g.id, {
              client: admin,
              requireFinal: false,
            });
            console.log("[simulate:set-state=finished] scoreGame result", {
              game_id: g.id,
              prior_status: g.status,
              result,
            });
          } else if (next === "live" || next === "not-started") {
            // Roll back to 'locked' (if a draft existed and was locked). For
            // 'not-started' we also wipe scores so the locked-pre-match
            // view renders cleanly.
            if (g.status === "scored") {
              await admin
                .from("games")
                .update({ status: "locked", scored_at: null, winner_user_id: null })
                .eq("id", g.id);
              await admin.from("scores").delete().eq("game_id", g.id);
            }
          }
        }
      }
      return NextResponse.json({ ok: true, state: next });
    }

    case "set-scenario": {
      const scenarioId = body.scenario as DemoScenario | undefined;
      const valid = DEMO_SCENARIOS.some((s) => s.id === scenarioId);
      if (!scenarioId || !valid) {
        return NextResponse.json({ error: "invalid_scenario" }, { status: 400 });
      }
      const state = await writeDemoState({ scenario: scenarioId });
      // Scorecard cache is now stale — nuke it so the next read serves the
      // new preset.
      const fixtures = await getCachedFixtures().catch(() => []);
      for (const f of fixtures) {
        await admin.from("scorecards_cached").delete().eq("match_id", f.match_id);
      }
      // If any scored/locked game exists for the demo match, re-score it so
      // the finished view updates immediately. We flip status back to
      // 'locked' first because scoreGame() bails on already-scored games.
      // We look up by DEMO_MATCH_ID directly — matches_cached may contain
      // older non-demo rows that would mismatch fixtures[0].
      if (state.match_state === "finished") {
        {
          const { data: games } = await admin
            .from("games")
            .select("id, status")
            .eq("match_id", DEMO_MATCH_ID);
          console.log("[simulate:set-scenario] games for DEMO_MATCH_ID", {
            scenario: scenarioId,
            count: games?.length ?? 0,
            statuses: (games ?? []).map((g) => g.status),
          });
          for (const g of games ?? []) {
            // Same force-lock treatment as set-state=finished. Drafting
            // games get locked too so scenario changes during an unfinished
            // draft still score whatever picks exist.
            await admin
              .from("games")
              .update({ status: "locked", scored_at: null, locked_at: new Date().toISOString() })
              .eq("id", g.id);
            const result = await scoreGame(g.id, {
              client: admin,
              requireFinal: false,
            });
            console.log("[simulate:set-scenario] scoreGame result", {
              game_id: g.id,
              scenario: scenarioId,
              prior_status: g.status,
              result,
            });
          }
        }
      }
      return NextResponse.json({ ok: true, scenario: scenarioId });
    }

    default:
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
}
