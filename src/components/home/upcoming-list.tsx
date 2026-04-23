"use client";

import { TeamChip } from "@/components/team-chip";
import { Card, CardSection } from "@/components/ui/card";
import type { CachedFixture } from "@/lib/fixtures";
import { iplTeamCode } from "@/lib/ipl-teams";
import { parseMatchDate } from "@/lib/match-time";

/**
 * Compute a YYYY-MM-DD key in the user's LOCAL timezone for a given ISO
 * instant. Used to bucket fixtures by "local day" so two matches that
 * both fall on Friday in Asia/Kolkata are grouped together even if their
 * GMT timestamps straddle midnight.
 */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Label a local day relative to today. Today/Tomorrow get named callouts,
 * the next 6 days show the weekday, anything further out falls back to
 * a compact "SAT, APR 25" form.
 */
function relativeDayLabel(d: Date): string {
  const today = new Date();
  const todayKey = localDayKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = localDayKey(tomorrow);

  const dKey = localDayKey(d);
  if (dKey === todayKey) return "Today";
  if (dKey === tomorrowKey) return "Tomorrow";

  const diffMs = d.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays >= 0 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UpcomingList({ fixtures }: { fixtures: CachedFixture[] }) {
  if (fixtures.length === 0) return null;

  // Bucket fixtures by their local-time day. Preserves the order the
  // caller handed us (already ascending by date), so groups emerge
  // naturally without an extra sort.
  const groups: Array<{ key: string; date: Date; fixtures: CachedFixture[] }> = [];
  for (const f of fixtures) {
    const d = parseMatchDate(f.date);
    const key = localDayKey(d);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.fixtures.push(f);
    } else {
      groups.push({ key, date: d, fixtures: [f] });
    }
  }

  return (
    <Card>
      <CardSection>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          Upcoming
        </h3>
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.key}>
              <div
                suppressHydrationWarning
                className="text-[10px] font-medium uppercase tracking-wider text-muted/80"
              >
                {relativeDayLabel(g.date)}
              </div>
              <ul className="mt-1.5 divide-y divide-border/60">
                {g.fixtures.map((f) => {
                  const a = iplTeamCode(f.team_a);
                  const b = iplTeamCode(f.team_b);
                  return (
                    <li
                      key={f.match_id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2">
                        <TeamChip code={a} />
                        <span className="text-xs text-muted">vs</span>
                        <TeamChip code={b} />
                      </div>
                      <span
                        suppressHydrationWarning
                        className="ml-auto font-mono text-xs tabular-nums text-muted"
                      >
                        {formatTime(parseMatchDate(f.date))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </CardSection>
    </Card>
  );
}
