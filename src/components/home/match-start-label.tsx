"use client";

/**
 * Compact, local-timezone-aware label for a match start: prefers
 * "TODAY 7:00 AM" / "TOMORROW 7:00 AM" over a bare weekday so the viewer
 * can parse "when" in one glance. Falls back to the short weekday
 * ("WED 7:00 AM") further out, and to a compact date ("SAT APR 25 7:00 AM")
 * beyond a week.
 *
 * Rendered as a client component so the relative label always uses the
 * *viewer's* local day rather than the server's.
 */
export function MatchStartLabel({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const d = new Date(iso);

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

  return (
    <span suppressHydrationWarning className={className}>
      {dayPart} {timePart}
    </span>
  );
}
