import "server-only";

/**
 * Admin allowlist. `ADMIN_EMAILS` is a comma-separated list of email
 * addresses. Any user whose `auth.users.email` matches is allowed into
 * /admin and all /api/admin/* routes.
 */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
