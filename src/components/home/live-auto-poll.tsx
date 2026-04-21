"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Silent 60s auto-poll for the live match card. Calls the same
 * `/api/games/[id]/refresh` endpoint the manual "Refresh now" button uses,
 * then nudges the router to re-render the server component tree with the
 * fresh numbers.
 *
 * Deliberately renders nothing. Drop it anywhere inside the match-live
 * branch and it'll keep the page current in the background.
 *
 * Guardrails:
 *   - Only polls while the tab is visible. Background tabs skip.
 *   - Pauses on network errors (prevents retry storms if upstream is down).
 *   - The API route has its own 30s cooldown, so multiple tabs still
 *     won't multiply upstream calls.
 */
const POLL_INTERVAL_MS = 60_000;

export function LiveAutoPoll({ gameId }: { gameId: string }) {
  const router = useRouter();
  const errorBackoffUntil = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      if (Date.now() < errorBackoffUntil.current) return;

      try {
        const res = await fetch(`/api/games/${gameId}/refresh`, {
          method: "POST",
        });
        if (res.ok) {
          router.refresh();
        } else if (res.status !== 429) {
          // Treat non-429 errors as upstream flake; back off 2 min.
          errorBackoffUntil.current = Date.now() + 2 * 60_000;
        }
      } catch {
        errorBackoffUntil.current = Date.now() + 2 * 60_000;
      }
    }

    const handle = setInterval(tick, POLL_INTERVAL_MS);
    // Also poll on tab-visibility gain so returning to the tab shows
    // fresh numbers immediately instead of waiting up to 60s.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(handle);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [gameId, router]);

  return null;
}
