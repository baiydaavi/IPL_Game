/**
 * Shared shapes for IPL fixture rows. Separated from `cricket-cache.ts` so
 * client components can import the type without pulling in the server-only
 * cache module.
 */

export type CachedFixture = {
  match_id: string;
  date: string;
  team_a: string;
  team_b: string;
  team_a_code: string;
  team_b_code: string;
  status: string | null;
  venue: string | null;
};
