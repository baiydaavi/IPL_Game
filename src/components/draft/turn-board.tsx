"use client";

import { cn } from "@/lib/utils";
import type { PickRow } from "@/lib/db-types";
import { accentFor } from "@/lib/theme";

/**
 * 8-dot progress board for the draft. Dots 0..5 are player picks, dots 6..7
 * are team picks (rendered as diamonds).
 *
 * Filled = already picked, outlined = upcoming, ring = current turn.
 */
export function TurnBoard({
  picks,
  nextTurnIndex,
  getSlotForTurn,
}: {
  picks: PickRow[];
  nextTurnIndex: number;
  getSlotForTurn: (turnIndex: number) => "P1" | "P2";
}) {
  const items = Array.from({ length: 8 }, (_, i) => i);

  return (
    <ol className="flex items-center gap-1.5" aria-label="Draft progress">
      {items.map((i) => {
        const pick = picks.find((p) => p.turn_index === i);
        const slot = getSlotForTurn(i);
        const accent = accentFor(slot);
        const isTeamPick = i >= 6;
        const isDone = Boolean(pick);
        const isCurrent = i === nextTurnIndex && !isDone;

        return (
          <li key={i} aria-label={`Turn ${i + 1}${isDone ? " (done)" : isCurrent ? " (current)" : ""}`}>
            <span
              className={cn(
                "block h-3 w-3 transition-colors",
                isTeamPick ? "rotate-45" : "rounded-full",
                isDone
                  ? accent.bg
                  : isCurrent
                    ? cn("border-2", accent.border)
                    : "border border-border bg-transparent",
                isCurrent && "ring-2 ring-offset-2 ring-offset-surface",
                isCurrent && (slot === "P1" ? "ring-p1/40" : "ring-p2/40"),
              )}
            />
          </li>
        );
      })}
    </ol>
  );
}
