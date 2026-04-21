import "server-only";

/**
 * Vercel Cron authenticates by sending the `CRON_SECRET` as a bearer token in
 * the `Authorization` header. See https://vercel.com/docs/cron-jobs/manage-cron-jobs.
 *
 * We also accept the same header for ad-hoc manual invocations (useful for
 * debugging from curl). Locally, if CRON_SECRET is unset, we allow all calls
 * so the dev experience isn't broken.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.warn("CRON_SECRET is not set in production. Rejecting cron call.");
      return false;
    }
    return true;
  }

  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}
