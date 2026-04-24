import { describe, expect, it } from "vitest";

import { normalizeDisplayName, normalizeEmail } from "./user-profile";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("is idempotent", () => {
    const once = normalizeEmail("User@Example.com");
    expect(normalizeEmail(once)).toBe(once);
  });

  it("returns empty string when given only whitespace", () => {
    expect(normalizeEmail("   ")).toBe("");
  });

  it("preserves plus-addressing and dots in the local part", () => {
    expect(normalizeEmail("Foo.Bar+Label@Example.com")).toBe(
      "foo.bar+label@example.com",
    );
  });

  it("collides different casings into the same string", () => {
    const a = normalizeEmail("Sanchitaggarwal2403@gmail.com");
    const b = normalizeEmail("sanchitaggarwal2403@gmail.com");
    const c = normalizeEmail("SANCHITAGGARWAL2403@GMAIL.COM");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe("normalizeDisplayName", () => {
  it("keeps a single-word name but title-cases it", () => {
    expect(normalizeDisplayName("sanchit")).toBe("Sanchit");
    expect(normalizeDisplayName("SANCHIT")).toBe("Sanchit");
    expect(normalizeDisplayName("Sanchit")).toBe("Sanchit");
  });

  it("drops trailing words so Sanchit Aggarwal -> Sanchit", () => {
    expect(normalizeDisplayName("Sanchit Aggarwal")).toBe("Sanchit");
    expect(normalizeDisplayName("sanchit aggarwal kumar")).toBe("Sanchit");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeDisplayName("  Avinash  ")).toBe("Avinash");
  });

  it("collapses inner whitespace runs (only first token survives)", () => {
    expect(normalizeDisplayName("Sanchit    Aggarwal")).toBe("Sanchit");
    expect(normalizeDisplayName("\tSanchit\tAggarwal")).toBe("Sanchit");
  });

  it("title-cases hyphenated first names", () => {
    expect(normalizeDisplayName("mary-jane watson")).toBe("Mary-Jane");
    expect(normalizeDisplayName("MARY-JANE")).toBe("Mary-Jane");
  });

  it("title-cases apostrophe-containing first names", () => {
    expect(normalizeDisplayName("d'souza francis")).toBe("D'Souza");
    expect(normalizeDisplayName("O'BRIEN")).toBe("O'Brien");
  });

  it("returns empty string when given only whitespace", () => {
    expect(normalizeDisplayName("   ")).toBe("");
    expect(normalizeDisplayName("")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeDisplayName("sanchit aggarwal");
    expect(normalizeDisplayName(once)).toBe(once);
  });

  it("handles single-character names", () => {
    expect(normalizeDisplayName("a")).toBe("A");
    expect(normalizeDisplayName("a b c")).toBe("A");
  });
});
