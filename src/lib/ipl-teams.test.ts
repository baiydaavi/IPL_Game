import { describe, expect, it } from "vitest";

import { iplTeamCode } from "@/lib/ipl-teams";

describe("iplTeamCode", () => {
  it.each([
    ["Chennai Super Kings", "CSK"],
    ["Mumbai Indians", "MI"],
    ["Royal Challengers Bengaluru", "RCB"],
    ["Royal Challengers Bangalore", "RCB"],
    ["Kolkata Knight Riders", "KKR"],
    ["Delhi Capitals", "DC"],
    ["Punjab Kings", "PBKS"],
    ["Rajasthan Royals", "RR"],
    ["Sunrisers Hyderabad", "SRH"],
    ["Gujarat Titans", "GT"],
    ["Lucknow Super Giants", "LSG"],
  ])("maps %j to %j", (input, expected) => {
    expect(iplTeamCode(input)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(iplTeamCode("CHENNAI SUPER KINGS")).toBe("CSK");
    expect(iplTeamCode("chennai super kings")).toBe("CSK");
    expect(iplTeamCode("Chennai super KINGS")).toBe("CSK");
  });

  it("trims surrounding whitespace before lookup", () => {
    expect(iplTeamCode("  Mumbai Indians  ")).toBe("MI");
    expect(iplTeamCode("\tDelhi Capitals\n")).toBe("DC");
  });

  it("returns the upper-cased input for unknown teams (graceful fallback)", () => {
    expect(iplTeamCode("Unknown Team FC")).toBe("UNKNOWN TEAM FC");
    expect(iplTeamCode("xyz")).toBe("XYZ");
  });

  it("treats already-canonical codes as unknowns and just upper-cases them", () => {
    // The map is only keyed by full names. Pre-coded inputs flow through
    // the fallback path and come out unchanged in the upper-cased form.
    expect(iplTeamCode("CSK")).toBe("CSK");
    expect(iplTeamCode("csk")).toBe("CSK");
  });
});
