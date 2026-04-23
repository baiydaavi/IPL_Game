"use client";

import { useEffect, useState } from "react";

import { parseMatchDate } from "@/lib/match-time";

/**
 * Compact, local-timezone-aware label for a match start: prefers
 * "TODAY 7:00 AM" / "TOMORROW 7:00 AM" over a bare weekday so the viewer
 * can parse "when" in one glance. Falls back to the short weekday
 * ("WED 7:00 AM") further out, and to a compact date ("SAT APR 25 7:00 AM")
 * beyond a week.
 *
 * Rendered as a client component, but formatting is deferred until AFTER
 * mount via `useEffect`. Both `toLocaleDateString` and `toLocaleString`
 * read the ambient timezone of wherever they're executed — on Vercel's
 * UTC Node runtime that's very different from the viewer's browser tz,
 * which showed up as "first load is UTC, subsequent nav is local". By
 * computing the label only in the browser we guarantee the viewer's
 * local tz is used every time.
 */
export function MatchStartLabel({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const d = parseMatchDate(iso);

    const toKey = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
        x.getDate(),
      ).padStart(2, "0")}`;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dKey = toKey(d);

    let dayPart: string;
    if (dKey === toKey(today)) {
      dayPart = "Today";
    } else if (dKey === toKey(tomorrow)) {
      dayPart = "Tomorrow";
    } else {
      const diffDays = Math.floor(
        (d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
      dayPart =
        diffDays >= 0 && diffDays < 7
          ? d.toLocaleDateString(undefined, { weekday: "short" })
          : d.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
    }

    const timePart = d.toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    setLabel(`${dayPart} ${timePart}`);
  }, [iso]);

  // Until the effect runs we render a zero-width placeholder rather than
  // a UTC-based best-guess; this avoids the first-paint-is-wrong-then-
  // corrects-itself flash while keeping the surrounding layout stable.
  return (
    <span suppressHydrationWarning className={className}>
      {label ?? "\u00A0"}
    </span>
  );
}
