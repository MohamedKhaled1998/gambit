import { describe, expect, it } from "vitest";
import { cellarSize, unmaskingsFor } from "../../src/engine/schedule";

/** The design doc's quick-game table with no Unmasking vote, by starting guests. */
const TABLE: Record<number, number[]> = {
  4: [0, 1, 1],
  5: [1, 1, 1],
  6: [2, 1, 1],
  7: [2, 2, 1],
  8: [2, 2, 2],
  9: [3, 2, 2],
  10: [3, 3, 2],
};

describe("the Unmasking schedule", () => {
  for (const [start, row] of Object.entries(TABLE)) {
    it(`unmasks ${row.join("/")} over three rounds from ${start} guests and leaves two`, () => {
      let remaining = Number(start);
      const counts: number[] = [];
      for (let round = 1; round <= 3; round++) {
        const k = unmaskingsFor({ remaining, unmaskings: remaining - 2, rounds: 4 - round });
        counts.push(k);
        remaining -= k;
      }
      expect(counts).toEqual(row);
      expect(remaining).toBe(2);
    });
  }

  it("makes a round a warm-up when fewer unmaskings are left than rounds", () => {
    expect(unmaskingsFor({ remaining: 4, unmaskings: 2, rounds: 3 })).toBe(0);
  });

  it("unmasks everyone above two in the last round", () => {
    expect(unmaskingsFor({ remaining: 9, unmaskings: 7, rounds: 1 })).toBe(7);
  });
});

describe("the Cellar's size", () => {
  it("is the lower half rounded up, and at least one more than the round unmasks", () => {
    expect(cellarSize(7, 1)).toBe(4);
    expect(cellarSize(10, 3)).toBe(5);
    expect(cellarSize(6, 4)).toBe(5);
    expect(cellarSize(3, 1)).toBe(2);
    expect(cellarSize(4, 0)).toBe(2);
  });
});
