import type { GameMemberRow, GameRow, PickRow, PlayerSlot } from "@/lib/db-types";

/**
 * Turn-state machine for a draft game.
 *
 * Turn indices 0..7, alternating strictly:
 *   0: first picker  (player)
 *   1: other         (player)
 *   2: first picker  (player)
 *   3: other         (player)
 *   4: first picker  (player)
 *   5: other         (player)
 *   6: first picker  (team)
 *   7: other         (team)
 *
 * Whose turn a given index belongs to is determined by:
 *   - The game's `first_picker_user_id` goes on even indices
 *   - The other player on odd indices
 *
 * Exported helpers avoid any ambiguity at call-sites.
 */

export const TOTAL_TURNS = 8;
export const PLAYER_TURNS = 6;

export type DraftMembers = {
  p1: GameMemberRow;
  p2: GameMemberRow;
};

export function partitionMembers(members: Array<Pick<GameMemberRow, "game_id" | "user_id" | "slot">>): DraftMembers {
  const p1 = members.find((m) => m.slot === "P1");
  const p2 = members.find((m) => m.slot === "P2");
  if (!p1 || !p2) {
    throw new Error("Both P1 and P2 must be present for a draft.");
  }
  return { p1: p1 as GameMemberRow, p2: p2 as GameMemberRow };
}

/**
 * Return the slot (P1/P2) whose turn it is at a given turn index, based on
 * which slot the game's first picker holds.
 */
export function slotForTurn(firstPickerSlot: PlayerSlot, turnIndex: number): PlayerSlot {
  const myTurn = turnIndex % 2 === 0;
  if (firstPickerSlot === "P1") {
    return myTurn ? "P1" : "P2";
  }
  return myTurn ? "P2" : "P1";
}

export function pickTypeForTurn(turnIndex: number): "player" | "team" {
  return turnIndex < PLAYER_TURNS ? "player" : "team";
}

export type DraftTurnState = {
  /** Zero-based index of the next pick to be made (0..7). */
  nextTurnIndex: number;
  /** Total picks made so far (0..8). */
  picksMade: number;
  /** Whether the draft has used all 8 turns. */
  isComplete: boolean;
  /** Slot (P1/P2) whose turn it is, or null if the draft is complete. */
  nextSlot: PlayerSlot | null;
  /** User ID whose turn it is, or null if complete. */
  nextUserId: string | null;
  /** Pick type for the next turn, or null if complete. */
  nextPickType: "player" | "team" | null;
};

export function deriveTurnState(
  game: Pick<GameRow, "first_picker_user_id">,
  members: DraftMembers,
  picks: Pick<PickRow, "turn_index">[],
): DraftTurnState {
  const picksMade = picks.length;
  const isComplete = picksMade >= TOTAL_TURNS;
  if (isComplete) {
    return {
      nextTurnIndex: TOTAL_TURNS,
      picksMade,
      isComplete,
      nextSlot: null,
      nextUserId: null,
      nextPickType: null,
    };
  }

  const firstPickerSlot: PlayerSlot =
    game.first_picker_user_id === members.p1.user_id ? "P1" : "P2";

  const nextTurnIndex = picksMade;
  const nextSlot = slotForTurn(firstPickerSlot, nextTurnIndex);
  const nextUserId = nextSlot === "P1" ? members.p1.user_id : members.p2.user_id;
  return {
    nextTurnIndex,
    picksMade,
    isComplete,
    nextSlot,
    nextUserId,
    nextPickType: pickTypeForTurn(nextTurnIndex),
  };
}

/** Is it this user's turn? */
export function isMyTurn(
  userId: string,
  game: Pick<GameRow, "first_picker_user_id">,
  members: DraftMembers,
  picks: Pick<PickRow, "turn_index">[],
): boolean {
  const t = deriveTurnState(game, members, picks);
  return t.nextUserId === userId;
}

/**
 * Validate that a proposed pick is legal. Used server-side; client just
 * disables the UI but this is the authoritative check.
 */
export type PickValidationError =
  | { kind: "not-your-turn" }
  | { kind: "wrong-pick-type"; expected: "player" | "team"; got: "player" | "team" }
  | { kind: "duplicate-player" }
  | { kind: "draft-complete" };

export function validatePick({
  userId,
  game,
  members,
  existingPicks,
  proposed,
}: {
  userId: string;
  game: Pick<GameRow, "first_picker_user_id">;
  members: DraftMembers;
  existingPicks: Pick<PickRow, "turn_index" | "pick_type" | "player_id">[];
  proposed:
    | { pick_type: "player"; player_id: string; player_name: string }
    | { pick_type: "team"; team_code: string };
}): { ok: true; turn_index: number } | { ok: false; error: PickValidationError } {
  const t = deriveTurnState(game, members, existingPicks);
  if (t.isComplete) return { ok: false, error: { kind: "draft-complete" } };
  if (t.nextUserId !== userId) return { ok: false, error: { kind: "not-your-turn" } };

  const expectedType = t.nextPickType!;
  if (proposed.pick_type !== expectedType) {
    return {
      ok: false,
      error: {
        kind: "wrong-pick-type",
        expected: expectedType,
        got: proposed.pick_type,
      },
    };
  }

  if (proposed.pick_type === "player") {
    const already = existingPicks.some(
      (p) => p.pick_type === "player" && p.player_id === proposed.player_id,
    );
    if (already) return { ok: false, error: { kind: "duplicate-player" } };
  }

  return { ok: true, turn_index: t.nextTurnIndex };
}
