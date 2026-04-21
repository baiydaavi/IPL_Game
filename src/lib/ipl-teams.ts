/**
 * IPL team-name normalization. Pure / no server-only deps so it can be
 * imported from both client and server modules.
 */

const IPL_TEAM_NAME_TO_CODE: Record<string, string> = {
  "chennai super kings": "CSK",
  "mumbai indians": "MI",
  "royal challengers bengaluru": "RCB",
  "royal challengers bangalore": "RCB", // older name, just in case
  "kolkata knight riders": "KKR",
  "delhi capitals": "DC",
  "punjab kings": "PBKS",
  "rajasthan royals": "RR",
  "sunrisers hyderabad": "SRH",
  "gujarat titans": "GT",
  "lucknow super giants": "LSG",
};

/**
 * Map a CricketData team name (or code) to our canonical IPL team code.
 * Returns the upper-cased input if unknown so the UI still shows *something*.
 */
export function iplTeamCode(nameOrCode: string): string {
  const normalized = nameOrCode.trim().toLowerCase();
  return IPL_TEAM_NAME_TO_CODE[normalized] ?? nameOrCode.trim().toUpperCase();
}
