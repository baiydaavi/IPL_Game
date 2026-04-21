import { cn } from "@/lib/utils";
import { teamPalette } from "@/lib/theme";

/**
 * A small rounded pill showing an IPL team's short code, tinted with the
 * team's brand color. Used in fixture cards, upcoming list, etc.
 */
export function TeamChip({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const palette = teamPalette(code);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
        className,
      )}
      style={{ backgroundColor: palette.tint, color: palette.fg }}
    >
      {code}
    </span>
  );
}
