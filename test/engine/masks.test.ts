import { describe, expect, it } from "vitest";
import { COLOURS, FEATHER_MAX, SHAPES, TRIMS, type Mask } from "../../src/shared/types";
import { drawMask, maskKey } from "../../src/engine/masks";
import { foyerWith } from "./sim";

describe("the mask generator", () => {
  it("makes only palette colours, listed shapes and trims, and 0-3 feathers", () => {
    let seed = 1;
    for (let i = 0; i < 400; i++) {
      let m: Mask;
      [m, seed] = drawMask(seed, []);
      expect(COLOURS).toContain(m.colour);
      expect(SHAPES).toContain(m.shape);
      if (m.trim !== null) expect(TRIMS).toContain(m.trim);
      expect(Number.isInteger(m.feathers)).toBe(true);
      expect(m.feathers).toBeGreaterThanOrEqual(0);
      expect(m.feathers).toBeLessThanOrEqual(FEATHER_MAX);
    }
    expect(FEATHER_MAX).toBe(3);
    expect(COLOURS).toEqual(["gold", "silver", "red", "sapphire", "emerald", "onyx"]);
  });

  it("never repeats a colour and shape already worn, so avatars differ at 20px", () => {
    let seed = 7;
    const taken: Mask[] = [];
    for (let i = 0; i < 24; i++) {
      let m: Mask;
      [m, seed] = drawMask(seed, taken);
      expect(taken.map((t) => `${t.colour}/${t.shape}`)).not.toContain(`${m.colour}/${m.shape}`);
      taken.push(m);
    }
  });

  it("gives every guest in the Foyer a distinct mask, with every trait", () => {
    const masks = foyerWith(10).guests.map((g) => g.mask);
    expect(new Set(masks.map(maskKey)).size).toBe(10);
    for (const m of masks) expect(m).toHaveProperty("feathers");
  });
});
