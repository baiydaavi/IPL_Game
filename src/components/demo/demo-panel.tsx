"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  UserCog,
} from "lucide-react";

import {
  DEMO_SCENARIOS,
  type DemoScenario,
} from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

type MatchState = "not-started" | "live" | "finished";

const MATCH_STATES: Array<{ id: MatchState; label: string; icon: typeof Play }> = [
  { id: "not-started", label: "Not started", icon: SkipForward },
  { id: "live", label: "Live", icon: Play },
  { id: "finished", label: "Finished", icon: Sparkles },
];

/**
 * Floating control panel that only renders when DEMO_MODE is on.
 *
 * Controls:
 *   - Identity: Become <other> (flips the demo_user cookie).
 *   - Reset today's draft (delete the in-progress game).
 *   - Match state (not-started / live / finished): shifts the fake fixture
 *     date and triggers auto-scoring when flipping to finished.
 *   - Scenario: which preset scorecard is served (normal, rain-draw,
 *     rain-no-draw, bowler-penalty, impact-sub).
 *
 * Never shown in production builds — the parent server layout only mounts
 * it when DEMO_MODE=1.
 */
export function DemoPanel({
  activeEmail,
  otherEmail,
  otherName,
  matchState,
  scenario,
}: {
  activeEmail: string;
  otherEmail: string;
  otherName: string;
  matchState: MatchState;
  scenario: DemoScenario;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function run(label: string, fn: () => Promise<Response>) {
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          setStatus(`${label} ✓`);
          router.refresh();
        } else {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setStatus(body.error ?? `${label} failed`);
        }
      } catch {
        setStatus(`${label} failed`);
      }
    });
  }

  const simulate = (payload: Record<string, unknown>) =>
    fetch("/api/demo/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-border bg-surface-1/95 p-2 shadow-xl backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-left text-xs"
        >
          <FlaskConical className="h-3.5 w-3.5 text-p1" />
          <span className="font-medium uppercase tracking-wider text-p1">
            Demo
          </span>
          <span className="ml-1 text-muted">
            {activeEmail.split("@")[0]} · {matchState} ·{" "}
            {DEMO_SCENARIOS.find((s) => s.id === scenario)?.label ?? scenario}
          </span>
          <span className="ml-auto text-muted">{open ? "hide" : "show"}</span>
        </button>

        {open ? (
          <div className="flex flex-col gap-3 px-1 pb-1">
            <Section label="Identity">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run("switched", () =>
                    fetch("/api/demo/switch", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ email: otherEmail }),
                    }),
                  )
                }
                className={btnCls}
              >
                <UserCog className="h-3.5 w-3.5" />
                Become {otherName}
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run("reset", () => simulate({ action: "reset" }))
                }
                className={btnCls}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset draft
              </button>
            </Section>

            <Section label="Match state">
              <div className="flex gap-1.5">
                {MATCH_STATES.map((s) => {
                  const Icon = s.icon;
                  const selected = s.id === matchState;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={isPending || selected}
                      onClick={() =>
                        run(`→ ${s.label}`, () =>
                          simulate({ action: "set-state", state: s.id }),
                        )
                      }
                      className={cn(
                        segmentCls,
                        selected
                          ? "border-p1 bg-p1/15 text-p1"
                          : "border-border bg-surface-2 hover:bg-surface-3",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section label="Scenario (scorecard preset)">
              <div className="flex flex-col gap-1">
                {DEMO_SCENARIOS.map((s) => {
                  const selected = s.id === scenario;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={isPending || selected}
                      onClick={() =>
                        run(`→ ${s.label}`, () =>
                          simulate({ action: "set-scenario", scenario: s.id }),
                        )
                      }
                      className={cn(
                        "flex flex-col items-start gap-0 rounded-lg border px-3 py-2 text-left text-[11px] transition-colors disabled:opacity-75",
                        selected
                          ? "border-p2 bg-p2/10"
                          : "border-border bg-surface-2 hover:bg-surface-3",
                      )}
                    >
                      <span className="font-medium text-foreground">
                        {selected ? "● " : ""}
                        {s.label}
                      </span>
                      <span className="text-[10px] text-muted">{s.hint}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {status ? (
              <div className="text-[10px] text-muted">{status}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

const btnCls = cn(
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50",
);

const segmentCls = cn(
  "inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-100",
);
