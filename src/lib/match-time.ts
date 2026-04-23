/**
 * CricAPI returns a `dateTimeGMT` field that's an ISO-8601 string WITHOUT
 * a timezone suffix, e.g. "2025-04-25T14:00:00". JS `new Date(...)` then
 * interprets that as *local* time instead of UTC — producing wildly wrong
 * clock displays depending on the viewer's timezone.
 *
 * This helper normalizes such strings to explicit UTC by appending a `Z`
 * when neither `Z` nor a numeric offset is present. Already-correct ISO
 * strings pass through untouched.
 *
 * Use wherever a match start time is displayed or compared to `Date.now()`.
 */
const HAS_TZ_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/;

export function normalizeMatchIso(iso: string): string {
  if (!iso) return iso;
  return HAS_TZ_SUFFIX.test(iso) ? iso : `${iso}Z`;
}

/**
 * Parse a match ISO to a Date, treating unsuffixed strings as UTC.
 * Returns the same Date JS would give you for a well-formed, Z-suffixed
 * ISO string.
 */
export function parseMatchDate(iso: string): Date {
  return new Date(normalizeMatchIso(iso));
}
