/**
 * Theme helpers: two-player accent system and IPL team color map.
 *
 * All colors live in `globals.css` as CSS custom properties; this module
 * exposes typed helpers so components don't have to memorize class names.
 */

export type PlayerSlot = "P1" | "P2";

export type AccentClasses = {
  /** Tailwind bg utility for the accent fill. */
  bg: string;
  /** Tailwind bg utility for the soft (12% alpha) accent. */
  bgSoft: string;
  /** Tailwind text utility for the accent foreground. */
  text: string;
  /** Tailwind border utility. */
  border: string;
  /** Tailwind ring utility for focus states. */
  ring: string;
};

const P1_ACCENT: AccentClasses = {
  bg: "bg-p1",
  bgSoft: "bg-p1-soft",
  text: "text-p1",
  border: "border-p1",
  ring: "ring-p1",
};

const P2_ACCENT: AccentClasses = {
  bg: "bg-p2",
  bgSoft: "bg-p2-soft",
  text: "text-p2",
  border: "border-p2",
  ring: "ring-p2",
};

/**
 * Resolve the Tailwind utility classes for a given player slot. Use this in UI
 * code so we never hardcode the orange/cyan decision in more than one place.
 */
export function accentFor(slot: PlayerSlot): AccentClasses {
  return slot === "P1" ? P1_ACCENT : P2_ACCENT;
}

/**
 * IPL team color map. The `tint` value is a mid-opacity hex used as a soft
 * gradient edge on cards; the `fg` value is the primary jersey color for chips
 * and labels. Keys are the canonical short codes CricketData returns.
 */
export type IplTeamCode =
  | "CSK"
  | "MI"
  | "RCB"
  | "KKR"
  | "DC"
  | "PBKS"
  | "RR"
  | "SRH"
  | "GT"
  | "LSG";

export type TeamPalette = {
  /** Canonical display name. */
  name: string;
  /** Primary brand color (hex). */
  fg: string;
  /** Soft tint for card gradient edges. */
  tint: string;
};

export const IPL_TEAMS: Record<IplTeamCode, TeamPalette> = {
  CSK: { name: "Chennai Super Kings", fg: "#FDB913", tint: "rgba(253, 185, 19, 0.18)" },
  MI: { name: "Mumbai Indians", fg: "#004BA0", tint: "rgba(0, 75, 160, 0.22)" },
  RCB: { name: "Royal Challengers Bengaluru", fg: "#DA1818", tint: "rgba(218, 24, 24, 0.18)" },
  KKR: { name: "Kolkata Knight Riders", fg: "#3A225D", tint: "rgba(120, 81, 169, 0.22)" },
  DC: { name: "Delhi Capitals", fg: "#17449B", tint: "rgba(23, 68, 155, 0.22)" },
  PBKS: { name: "Punjab Kings", fg: "#D71920", tint: "rgba(215, 25, 32, 0.18)" },
  RR: { name: "Rajasthan Royals", fg: "#EA1A85", tint: "rgba(234, 26, 133, 0.18)" },
  SRH: { name: "Sunrisers Hyderabad", fg: "#F26522", tint: "rgba(242, 101, 34, 0.18)" },
  GT: { name: "Gujarat Titans", fg: "#1C1C4B", tint: "rgba(28, 28, 75, 0.28)" },
  LSG: { name: "Lucknow Super Giants", fg: "#00A9E0", tint: "rgba(0, 169, 224, 0.2)" },
};

/**
 * Look up a team palette by code, with a graceful fallback for unknown teams
 * (CricketData occasionally returns full names instead of codes).
 */
export function teamPalette(code: string): TeamPalette {
  const upper = code.toUpperCase() as IplTeamCode;
  if (upper in IPL_TEAMS) {
    return IPL_TEAMS[upper];
  }
  return {
    name: code,
    fg: "#a1a1aa",
    tint: "rgba(255, 255, 255, 0.08)",
  };
}
