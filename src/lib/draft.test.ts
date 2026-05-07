/**
 * Draft turn-state machine. The server uses these helpers to authorise
 * picks (`/api/games/[id]/pick`), so they're load-bearing — anything
 * subtle here results in either an unbreakable softlock or someone
 * picking out of turn.
 */

import { describe, expect, it } from "vitest";

import type { GameMemberRow, GameRow, PickRow, PlayerSlot } from "@/lib/db-types";
import {
  deriveTurnState,
  isMyTurn,
  pickTypeForTurn,
  slotForTurn,
  validatePick,
  partitionMembers,
  PLAYER_TURNS,
  TOTAL_TURNS,
} from "@/lib/draft";

const GAME_ID = "game-1";
const USER_P1 = "user-p1";
const USER_P2 = "user-p2";

function members(): {
  p1: GameMemberRow;
  p2: GameMemberRow;
} {
  return {
    p1: {
      game_id: GAME_ID,
      user_id: USER_P1,
      slot: "P1",
      joined_at: "2026-04-26T00:00:00Z",
    },
    p2: {
      game_id: GAME_ID,
      user_id: USER_P2,
      slot: "P2",
      joined_at: "2026-04-26T00:00:00Z",
    },
  };
}

function game(firstPicker: string): Pick<GameRow, "first_picker_user_id"> {
  return { first_picker_user_id: firstPicker };
}

function pick(
  user: string,
  turn: number,
  pick_type: "player" | "team" = "player",
  player_id: string | null = `p-${turn}`,
): Pick<PickRow, "turn_index" | "pick_type" | "player_id"> {
  return { turn_index: turn, pick_type, player_id };
}

describe("slotForTurn", () => {
  it("alternates starting with the first picker's slot on even indices", () => {
    const seq: PlayerSlot[] = [];
    for (let i = 0; i < TOTAL_TURNS; i++) seq.push(slotForTurn("P1", i));
    expect(seq).toEqual(["P1", "P2", "P1", "P2", "P1", "P2", "P1", "P2"]);
  });

  it("inverts the order when P2 is the first picker", () => {
    const seq: PlayerSlot[] = [];
    for (let i = 0; i < TOTAL_TURNS; i++) seq.push(slotForTurn("P2", i));
    expect(seq).toEqual(["P2", "P1", "P2", "P1", "P2", "P1", "P2", "P1"]);
  });
});

describe("pickTypeForTurn", () => {
  it("turns 0..5 are player picks, 6..7 are team picks", () => {
    for (let i = 0; i < PLAYER_TURNS; i++) {
      expect(pickTypeForTurn(i)).toBe("player");
    }
    expect(pickTypeForTurn(6)).toBe("team");
    expect(pickTypeForTurn(7)).toBe("team");
  });
});

describe("partitionMembers", () => {
  it("returns p1 and p2 keyed by slot", () => {
    const ms = members();
    const part = partitionMembers([ms.p1, ms.p2]);
    expect(part.p1.user_id).toBe(USER_P1);
    expect(part.p2.user_id).toBe(USER_P2);
  });

  it("throws if either slot is missing", () => {
    const ms = members();
    expect(() => partitionMembers([ms.p1])).toThrow();
    expect(() => partitionMembers([ms.p2])).toThrow();
    expect(() => partitionMembers([])).toThrow();
  });
});

describe("deriveTurnState", () => {
  it("returns turn 0 / first picker on a fresh game", () => {
    const t = deriveTurnState(game(USER_P1), members(), []);
    expect(t.nextTurnIndex).toBe(0);
    expect(t.picksMade).toBe(0);
    expect(t.isComplete).toBe(false);
    expect(t.nextSlot).toBe("P1");
    expect(t.nextUserId).toBe(USER_P1);
    expect(t.nextPickType).toBe("player");
  });

  it("advances to the other player after one pick", () => {
    const picks = [pick(USER_P1, 0)];
    const t = deriveTurnState(game(USER_P1), members(), picks);
    expect(t.nextTurnIndex).toBe(1);
    expect(t.nextUserId).toBe(USER_P2);
    expect(t.nextPickType).toBe("player");
  });

  it("returns nextPickType=team for turns 6 and 7", () => {
    const picks = Array.from({ length: 6 }, (_, i) =>
      pick(i % 2 === 0 ? USER_P1 : USER_P2, i),
    );
    const t = deriveTurnState(game(USER_P1), members(), picks);
    expect(t.nextTurnIndex).toBe(6);
    expect(t.nextPickType).toBe("team");
    expect(t.nextUserId).toBe(USER_P1);
  });

  it("marks isComplete and clears next* when all 8 picks are in", () => {
    const picks = Array.from({ length: 8 }, (_, i) =>
      pick(i % 2 === 0 ? USER_P1 : USER_P2, i),
    );
    const t = deriveTurnState(game(USER_P1), members(), picks);
    expect(t.isComplete).toBe(true);
    expect(t.picksMade).toBe(8);
    expect(t.nextTurnIndex).toBe(8);
    expect(t.nextSlot).toBeNull();
    expect(t.nextUserId).toBeNull();
    expect(t.nextPickType).toBeNull();
  });

  it("respects first_picker_user_id when P2 picks first", () => {
    const t = deriveTurnState(game(USER_P2), members(), []);
    expect(t.nextSlot).toBe("P2");
    expect(t.nextUserId).toBe(USER_P2);
  });
});

describe("isMyTurn", () => {
  it("is true only for the user whose turn it currently is", () => {
    expect(isMyTurn(USER_P1, game(USER_P1), members(), [])).toBe(true);
    expect(isMyTurn(USER_P2, game(USER_P1), members(), [])).toBe(false);
  });

  it("flips after each pick", () => {
    const picks = [pick(USER_P1, 0)];
    expect(isMyTurn(USER_P2, game(USER_P1), members(), picks)).toBe(true);
    expect(isMyTurn(USER_P1, game(USER_P1), members(), picks)).toBe(false);
  });

  it("is false for everyone once the draft completes", () => {
    const picks = Array.from({ length: 8 }, (_, i) =>
      pick(i % 2 === 0 ? USER_P1 : USER_P2, i),
    );
    expect(isMyTurn(USER_P1, game(USER_P1), members(), picks)).toBe(false);
    expect(isMyTurn(USER_P2, game(USER_P1), members(), picks)).toBe(false);
  });
});

describe("validatePick", () => {
  it("accepts a valid first player pick", () => {
    const result = validatePick({
      userId: USER_P1,
      game: game(USER_P1),
      members: members(),
      existingPicks: [],
      proposed: { pick_type: "player", player_id: "x1", player_name: "Xavier" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn_index).toBe(0);
  });

  it("rejects when it's the other player's turn", () => {
    const result = validatePick({
      userId: USER_P2,
      game: game(USER_P1),
      members: members(),
      existingPicks: [],
      proposed: { pick_type: "player", player_id: "x1", player_name: "Xavier" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-your-turn");
  });

  it("rejects a team pick during the player phase", () => {
    const result = validatePick({
      userId: USER_P1,
      game: game(USER_P1),
      members: members(),
      existingPicks: [],
      proposed: { pick_type: "team", team_code: "CSK" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("wrong-pick-type");
  });

  it("rejects a player pick during the team phase", () => {
    const existing = Array.from({ length: 6 }, (_, i) =>
      pick(i % 2 === 0 ? USER_P1 : USER_P2, i),
    );
    const result = validatePick({
      userId: USER_P1,
      game: game(USER_P1),
      members: members(),
      existingPicks: existing,
      proposed: { pick_type: "player", player_id: "x1", player_name: "Xavier" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("wrong-pick-type");
  });

  it("rejects a duplicate player_id (already drafted by anyone)", () => {
    const existing = [pick(USER_P1, 0, "player", "x1")];
    const result = validatePick({
      userId: USER_P2,
      game: game(USER_P1),
      members: members(),
      existingPicks: existing,
      proposed: { pick_type: "player", player_id: "x1", player_name: "Xavier" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("duplicate-player");
  });

  it("allows two players to pick the same TEAM (team picks are not unique)", () => {
    const existing = [
      ...Array.from({ length: 6 }, (_, i) =>
        pick(i % 2 === 0 ? USER_P1 : USER_P2, i),
      ),
      pick(USER_P1, 6, "team", null),
    ];
    const result = validatePick({
      userId: USER_P2,
      game: game(USER_P1),
      members: members(),
      existingPicks: existing,
      proposed: { pick_type: "team", team_code: "CSK" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects any pick once the draft is complete", () => {
    const existing = Array.from({ length: 8 }, (_, i) =>
      pick(i % 2 === 0 ? USER_P1 : USER_P2, i),
    );
    const result = validatePick({
      userId: USER_P1,
      game: game(USER_P1),
      members: members(),
      existingPicks: existing,
      proposed: { pick_type: "team", team_code: "CSK" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("draft-complete");
  });

  it("returns the correct next turn_index for accepted picks", () => {
    const existing = [pick(USER_P1, 0)];
    const result = validatePick({
      userId: USER_P2,
      game: game(USER_P1),
      members: members(),
      existingPicks: existing,
      proposed: { pick_type: "player", player_id: "y1", player_name: "Yannick" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.turn_index).toBe(1);
  });
});
