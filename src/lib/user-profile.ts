/**
 * Shared helpers for normalizing the two user-profile fields we persist:
 *   - email: lowercased + trimmed so a user signing in as "Foo@Bar.com"
 *     collides with a previous "foo@bar.com" row instead of creating a
 *     duplicate auth.users / public.users pair.
 *   - display_name: first whitespace-separated word of whatever the user
 *     typed, title-cased. "sanchit aggarwal" -> "Sanchit", "MARY jane" ->
 *     "Mary". Keeps the UI short and predictable, and avoids "accidental
 *     rename" on re-login since the same typed name always normalizes the
 *     same way.
 *
 * All entry points that accept user-typed email / display_name should run
 * these helpers before writing to the DB or calling Supabase Auth.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0] ?? trimmed;
  return titleCase(firstWord);
}

function titleCase(word: string): string {
  if (!word) return word;
  // Keep hyphen/apostrophe segments title-cased too ("mary-jane" -> "Mary-Jane",
  // "d'souza" -> "D'Souza") so multi-part first names look right.
  return word
    .split(/([-'])/)
    .map((seg) =>
      seg === "-" || seg === "'"
        ? seg
        : seg.charAt(0).toLocaleUpperCase() +
          seg.slice(1).toLocaleLowerCase(),
    )
    .join("");
}
