"use client";

import { useState } from "react";
import { Activity, ScrollText } from "lucide-react";

import type { CricApiScorecard, CricApiScorecardInning } from "@/lib/cricket";
import { cn } from "@/lib/utils";

type TabId = "summary" | "scorecard";

/**
 * Tabbed match detail view used by both the live and finished match cards.
 *
 *   Summary:   A fantasy-agnostic match-state line (CricAPI's `status`) plus
 *              per-innings totals. Answers "what's the score right now / how
 *              did it end" without duplicating the per-player tables.
 *   Scorecard: Batting + bowling tables per innings. Falls back to a
 *              'Scorecard not available' line if the cache didn't have one.
 *
 * Designated bowlers are already shown on the picks card (dagger), and
 * impact subs are shown/edited via the ImpactSubCard above, so neither is
 * repeated here.
 *
 * `isFinal` drives copy (Live vs Final) on both tabs, not layout.
 */
export function MatchExtrasTabs({
  scorecard,
  isFinal,
}: {
  scorecard: CricApiScorecard | null;
  isFinal: boolean;
}) {
  const [tab, setTab] = useState<TabId>("summary");

  return (
    <div className="mt-4">
      <div
        role="tablist"
        aria-label="Match details"
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
          <MatchStateBlock scorecard={scorecard} isFinal={isFinal} />
        ) : (
          <ScorecardBlock scorecard={scorecard} isFinal={isFinal} />
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

/**
 * One-line match state driven by CricAPI's `status` string
 * (e.g. "Rajasthan Royals need 38 runs in 28 balls" or "RR won by 5 runs"),
 * followed by compact per-innings totals when available.
 */
function MatchStateBlock({
  scorecard,
  isFinal,
}: {
  scorecard: CricApiScorecard | null;
  isFinal: boolean;
}) {
  const heading = isFinal ? "Final" : "Live";
  const emptyCopy = isFinal
    ? "Match summary not available."
    : "Waiting for the first ball\u2026";

  const statusText = scorecard?.status?.trim();
  const innings = scorecard?.score ?? [];

  return (
    <section className="rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-muted" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          {heading}
        </span>
      </div>

      {statusText ? (
        <p className="mt-2 text-sm leading-snug text-foreground">
          {statusText}
        </p>
      ) : (
        <p className="mt-2 text-sm italic text-muted">{emptyCopy}</p>
      )}

      {innings.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {innings.map((inn, i) => {
            const label = inn.inning ?? `Innings ${i + 1}`;
            const runs = inn.r ?? 0;
            const wkts = inn.w ?? 0;
            const overs = inn.o ?? 0;
            return (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="truncate text-muted">{label}</span>
                <span className="font-mono tabular-nums">
                  {runs}/{wkts}
                  <span className="ml-1 text-muted">({overs})</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function ScorecardBlock({
  scorecard,
  isFinal,
}: {
  scorecard: CricApiScorecard | null;
  isFinal: boolean;
}) {
  const heading = isFinal ? "Final scorecard" : "Live scorecard";
  const emptyCopy = isFinal
    ? "Scorecard not available."
    : "Scorecard not available yet.";

  if (!scorecard) {
    return (
      <section className="rounded-xl border border-border bg-surface-2/60 p-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-3.5 w-3.5 text-muted" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            {heading}
          </span>
        </div>
        <p className="mt-2 text-sm italic text-muted">{emptyCopy}</p>
      </section>
    );
  }

  const innings = scorecard.scorecard ?? [];
  return (
    <section className="rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <ScrollText className="h-3.5 w-3.5 text-muted" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          {heading}
        </span>
      </div>
      {scorecard.status ? (
        <p className="mt-1 text-[11px] text-muted">{scorecard.status}</p>
      ) : null}
      {innings.length === 0 ? (
        <p className="mt-2 text-sm italic text-muted">{emptyCopy}</p>
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
                      {bat.sr ? bat.sr.toFixed(1) : "\u2014"}
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
                      {bo.eco ? bo.eco.toFixed(2) : "\u2014"}
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
