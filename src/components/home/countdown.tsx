"use client";

import { Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Live countdown that updates every 30s and intensifies as the match nears.
 *
 * Color tiers:
 *  - > 1h remaining: muted gray (default), lock icon leads
 *  - 15min–1h: amber (attention), lock icon leads
 *  - < 15min: live red, pulsing dot replaces the lock icon (urgent)
 *  - <= 0: "starting now" in live red with pulsing dot
 */
export function Countdown({ startIso }: { startIso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const startMs = new Date(startIso).getTime();
  const mins = Math.max(0, Math.round((startMs - now) / 60000));

  const urgent = mins > 0 && mins < 15;
  const attention = mins >= 15 && mins < 60;
  const started = startMs <= now;

  const label = started
    ? "starting now"
    : mins < 60
      ? `${mins} min`
      : `${Math.floor(mins / 60)}h ${mins % 60}m`;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs",
        started || urgent
          ? "font-semibold text-live"
          : attention
            ? "font-medium text-amber-400"
            : "text-muted",
      )}
    >
      {urgent || started ? (
        <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-live" />
      ) : (
        <Lock aria-hidden className="h-3 w-3" />
      )}
      <span>{started ? label : `starts in ${label}`}</span>
    </div>
  );
}
