"use client";

import { useState } from "react";
import { ArrowLeftRight, ScrollText, Target } from "lucide-react";

import { TeamChip } from "@/components/team-chip";
import type { CricApiScorecard, CricApiScorecardInning } from "@/lib/cricket";
import type {
  BowlerDesignationRow,
  GameMemberRow,
  ImpactSubRow,
  UserRow,
} from "@/lib/db-types";
import { iplTeamCode } from "@/lib/ipl-teams";
import { cn } from "@/lib/utils";

type TabId = "summary" | "scorecard";

/**
 * Tabbed post-match detail view.
 *
 *   Summary:   Designated bowlers per user (or "No bowler chosen") and
 *              the per-team impact-sub reports (or "No impact sub reported").
 *   Scorecard: Full batting + bowling tables per innings. Falls back to a
 *              'Scorecard not available' line if the cache didn't have one.
 *
 * Summary is the default tab because for most users "who got zeroed? who
 * substituted in?" is the immediate question post-match; the scorecard is
 * a drill-down.
 */
export function FinishedExtrasTabs({
  members,
  bowlerDesignations,
  impactSubs,
  scorecard,
}: {
  members: Array<GameMemberRow & { user: UserRow }>;
  bowlerDesignations: BowlerDesignationRow[];
  impactSubs: ImpactSubRow[];
  scorecard: CricApiScorecard | null;
}) {
  const [tab, setTab] = useState<TabId>("summary");

  return (
    <div className="mt-4">
      <div
        role="tablist"
        aria-label="Post-match details"
        className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
      >
        <TabButton
          id="summary"
          active={tab === "summary"}
          onSelect={() => setTab("summary")}
        >
          Summary
        </TabButton>
        <TabButton
          id="scorecard"
          active={tab === "scorecard"}
          onSelect={() => setTab("scorecard")}
        >
          Scorecard
        </TabButton>
      </div>

      <div className="mt-3">
        {tab === "summary" ? (
          <div className="flex flex-col gap-3">
            <DesignatedBowlersBlock
              members={members}
              designations={bowlerDesignations}
            />
            <ImpactSubsBlock impactSubs={impactSubs} />
          </div>
        ) : (
          <ScorecardBlock scorecard={scorecard} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  id,
  active,
  onSelect,
  children,
}: {
  id: TabId;
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`panel-${id}`}
      onClick={onSelect}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-medium uppercase tracking-wider transition-colors",
        active
          ? "bg-surface-3 text-foreground"
          : "text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DesignatedBowlersBlock({
  members,
  designations,
}: {
  members: Array<GameMemberRow & { user: UserRow }>;
  designations: BowlerDesignationRow[];
}) {
  const orderedMembers = [...members].sort((a, b) =>
    a.slot.localeCompare(b.slot),
  );
  return (
    <section className="rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-p1" />
        <span className="text-xs font-medium uppercase tracking-wider text-p1">
          Designated bowlers
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {orderedMembers.map((m) => {
          const d = designations.find((row) => row.user_id === m.user_id);
          return (
            <div
              key={m.user_id}
              className="rounded-lg border border-border bg-surface-3/50 px-3 py-2"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted">
                {m.user.display_name}
              </div>
              <div className="mt-0.5 text-sm">
                {d ? (
                  <span className="text-foreground">{d.player_name}</span>
                ) : (
                  <span className="italic text-muted">No bowler chosen</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ImpactSubsBlock({ impactSubs }: { impactSubs: ImpactSubRow[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-3.5 w-3.5 text-p2" />
        <span className="text-xs font-medium uppercase tracking-wider text-p2">
          Impact subs
        </span>
      </div>
      {impactSubs.length === 0 ? (
        <p className="mt-2 text-sm italic text-muted">
          No impact sub reported.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {impactSubs.map((sub) => (
            <div
              key={sub.team_code}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-3/50 px-3 py-2"
            >
              <TeamChip code={iplTeamCode(sub.team_code)} />
              <div className="flex-1 text-sm">
                <span className="text-muted line-through">
                  {sub.out_player_name}
                </span>
                <span className="mx-2 text-muted">→</span>
                <span className="text-foreground">{sub.in_player_name}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ScorecardBlock({
  scorecard,
}: {
  scorecard: CricApiScorecard | null;
}) {
  if (!scorecard) {
    return (
      <section className="rounded-xl border border-border bg-surface-2/60 p-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-3.5 w-3.5 text-muted" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Final scorecard
          </span>
        </div>
        <p className="mt-2 text-sm italic text-muted">
          Scorecard not available yet.
        </p>
      </section>
    );
  }

  const innings = scorecard.scorecard ?? [];
  return (
    <section className="rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <ScrollText className="h-3.5 w-3.5 text-muted" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          Final scorecard
        </span>
      </div>
      {scorecard.status ? (
        <p className="mt-1 text-[11px] text-muted">{scorecard.status}</p>
      ) : null}
      {innings.length === 0 ? (
        <p className="mt-2 text-sm italic text-muted">
          No scorecard available.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {innings.map((inning, idx) => (
            <InningBlock key={idx} inning={inning} />
          ))}
        </div>
      )}
    </section>
  );
}

function InningBlock({ inning }: { inning: CricApiScorecardInning }) {
  const totalRuns =
    (inning.total as { r?: number } | undefined)?.r ??
    (inning.batting ?? []).reduce((s, b) => s + (b.r ?? 0), 0);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold">{inning.inning}</h4>
        <span className="font-mono text-xs tabular-nums text-muted">
          {totalRuns}
        </span>
      </div>

      {(inning.batting ?? []).length > 0 ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Batter</th>
                <th className="py-1 px-1 text-right font-medium">R</th>
                <th className="py-1 px-1 text-right font-medium">B</th>
                <th className="py-1 pl-1 text-right font-medium">SR</th>
              </tr>
            </thead>
            <tbody>
              {inning.batting.map((bat, i) => {
                const name =
                  typeof bat.batsman === "string"
                    ? bat.batsman
                    : bat.batsman?.name ?? "Unknown";
                return (
                  <tr key={i} className="border-t border-border/60 align-top">
                    <td className="py-1 pr-2">{name}</td>
                    <td className="py-1 px-1 text-right font-mono tabular-nums">
                      {bat.r ?? 0}
                    </td>
                    <td className="py-1 px-1 text-right font-mono tabular-nums text-muted">
                      {bat.b ?? 0}
                    </td>
                    <td className="py-1 pl-1 text-right font-mono tabular-nums text-muted">
                      {bat.sr ? bat.sr.toFixed(1) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {(inning.bowling ?? []).length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Bowler</th>
                <th className="py-1 px-1 text-right font-medium">O</th>
                <th className="py-1 px-1 text-right font-medium">R</th>
                <th className="py-1 px-1 text-right font-medium">W</th>
                <th className="py-1 pl-1 text-right font-medium">Eco</th>
              </tr>
            </thead>
            <tbody>
              {inning.bowling.map((bo, i) => {
                const name =
                  typeof bo.bowler === "string"
                    ? bo.bowler
                    : bo.bowler?.name ?? "Unknown";
                return (
                  <tr key={i} className="border-t border-border/60 align-top">
                    <td className="py-1 pr-2">{name}</td>
                    <td className="py-1 px-1 text-right font-mono tabular-nums text-muted">
                      {bo.o ?? 0}
                    </td>
                    <td className="py-1 px-1 text-right font-mono tabular-nums text-muted">
                      {bo.r ?? 0}
                    </td>
                    <td className="py-1 px-1 text-right font-mono tabular-nums">
                      {bo.w ?? 0}
                    </td>
                    <td className="py-1 pl-1 text-right font-mono tabular-nums text-muted">
                      {bo.eco ? bo.eco.toFixed(2) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
