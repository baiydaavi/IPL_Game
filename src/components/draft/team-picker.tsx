"use client";

import { iplTeamCode } from "@/lib/ipl-teams";
import { teamPalette } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function TeamPicker({
  teamA,
  teamB,
  onPick,
  isSubmitting,
}: {
  teamA: string;
  teamB: string;
  onPick: (teamCode: string) => void;
  isSubmitting: boolean;
}) {
  const options = [
    { code: iplTeamCode(teamA), label: teamA },
    { code: iplTeamCode(teamB), label: teamB },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((opt) => {
        const palette = teamPalette(opt.code);
        return (
          <button
            key={opt.code}
            type="button"
            disabled={isSubmitting}
            onClick={() => onPick(opt.code)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-5 text-center transition-transform active:scale-[0.98] disabled:opacity-50",
            )}
            style={{
              borderColor: palette.tint,
              backgroundColor: palette.tint,
            }}
          >
            <span className="text-xl font-bold" style={{ color: palette.fg }}>
              {opt.code}
            </span>
            <span className="text-xs text-muted">to win</span>
          </button>
        );
      })}
    </div>
  );
}
