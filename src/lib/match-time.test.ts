import { describe, expect, it } from "vitest";

import { normalizeMatchIso, parseMatchDate } from "@/lib/match-time";

describe("normalizeMatchIso", () => {
  it("appends Z when no timezone suffix is present (CricAPI's common case)", () => {
    expect(normalizeMatchIso("2026-04-26T14:00:00")).toBe("2026-04-26T14:00:00Z");
  });

  it("leaves Z-suffixed strings untouched", () => {
    expect(normalizeMatchIso("2026-04-26T14:00:00Z")).toBe("2026-04-26T14:00:00Z");
  });

  it("leaves +HH:MM offsets untouched", () => {
    expect(normalizeMatchIso("2026-04-26T19:30:00+05:30")).toBe(
      "2026-04-26T19:30:00+05:30",
    );
  });

  it("leaves -HHMM offsets untouched", () => {
    expect(normalizeMatchIso("2026-04-26T09:00:00-0700")).toBe(
      "2026-04-26T09:00:00-0700",
    );
  });

  it("returns falsy input as-is", () => {
    expect(normalizeMatchIso("")).toBe("");
  });
});

describe("parseMatchDate", () => {
  it("parses a tz-less string AS UTC, not local time", () => {
    const d = parseMatchDate("2026-04-26T14:00:00");
    expect(d.toISOString()).toBe("2026-04-26T14:00:00.000Z");
  });

  it("parses a Z-suffixed string at the same instant a plain Date would", () => {
    const iso = "2026-04-26T14:00:00Z";
    expect(parseMatchDate(iso).getTime()).toBe(new Date(iso).getTime());
  });

  it("parses a +offset string at the correct UTC instant", () => {
    // 19:30 IST = 14:00 UTC
    const d = parseMatchDate("2026-04-26T19:30:00+05:30");
    expect(d.toISOString()).toBe("2026-04-26T14:00:00.000Z");
  });
});
