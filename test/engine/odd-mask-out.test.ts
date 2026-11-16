import { describe, expect, it } from "vitest";
import { ODD_MASK_OUT } from "../../src/content/odd-mask-out";
import { THE_PROCESSION } from "../../src/content/the-procession";
import { LIBRARY } from "../../src/content/library";
import { generateProblems } from "../../src/engine/problems";
import { COLOURS, SHAPES, TRIMS, type Mask } from "../../src/shared/types";
import { maskKey } from "../../src/engine/masks";

const TRAITS = ["colour", "shape", "trim", "feathers"] as const;
/** Every (trait, mask) where the other three share a value on that trait and this mask differs. */
function breakers(masks: Mask[]): { trait: string; at: number }[] {
  const out: { trait: string; at: number }[] = [];
  for (const trait of TRAITS)
    masks.forEach((m, at) => {
      const rest = masks.filter((_, i) => i !== at);
      if (rest.every((r) => r[trait] === rest[0]![trait]) && m[trait] !== rest[0]![trait]) out.push({ trait, at });
    });
  return out;
}

describe("Odd Mask Out", () => {
  it("is in the library as a Race match: 14 steps as a Dance, 9 as a Cellar game, answer 12s", () => {
    expect(LIBRARY).toContain(ODD_MASK_OUT);
    expect(ODD_MASK_OUT).toMatchObject({ type: "race", answerSeconds: 12, stepSeconds: 15, preludeSeconds: 45 });
    expect(ODD_MASK_OUT.steps).toEqual({ dance: 14, cellar: 9 });
    expect(ODD_MASK_OUT.guestRange).toEqual({ dance: [3, 10], cellar: [2, 9] });
  });

  it("makes four distinct masks as the choices, exactly one breaking the rule, the right one first", () => {
    for (let seed = 0; seed < 150; seed++) {
      const problems = generateProblems(seed, ODD_MASK_OUT, 14)[0];
      expect(problems).toHaveLength(14);
      for (const p of problems) {
        const masks = p.choiceMasks!;
        expect(masks).toHaveLength(4);
        expect(p.choices).toHaveLength(4);
        expect(new Set(masks.map(maskKey)).size).toBe(4);
        expect(new Set(p.choices).size).toBe(4);
        for (const m of masks) {
          expect(COLOURS).toContain(m.colour);
          expect(SHAPES).toContain(m.shape);
          if (m.trim) expect(TRIMS).toContain(m.trim);
        }
        expect(breakers(masks)).toEqual([{ trait: expect.any(String), at: 0 }]);
      }
    }
  });

  it("never repeats a problem within a game, and repeats from the seed", () => {
    for (let seed = 0; seed < 50; seed++) {
      const ps = generateProblems(seed, ODD_MASK_OUT, 14)[0];
      expect(new Set(ps.map((p) => [...p.choices].sort().join("|"))).size).toBe(14);
    }
    expect(generateProblems(3, ODD_MASK_OUT, 14)).toEqual(generateProblems(3, ODD_MASK_OUT, 14));
  });

  it("starts with one obvious difference: no trait but the rule's splits the masks", () => {
    for (let seed = 0; seed < 50; seed++) {
      const p = generateProblems(seed, ODD_MASK_OUT, 14)[0][0]!;
      const rule = breakers(p.choiceMasks!)[0]!.trait as (typeof TRAITS)[number];
      for (const t of TRAITS) if (t !== rule) expect(new Set(p.choiceMasks!.map((m) => String(m[t]))).size).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("questions that name masks", () => {
  it("carry the masks' traits in The Procession's mask sequences", () => {
    let withMasks = 0;
    for (let seed = 0; seed < 60; seed++)
      for (const p of generateProblems(seed, THE_PROCESSION, 7)[0]) {
        if (!p.promptMasks) continue;
        withMasks++;
        expect(p.promptMasks.length).toBeGreaterThanOrEqual(5);
        expect(p.choiceMasks).toHaveLength(4);
        for (const m of [...p.promptMasks, ...p.choiceMasks!]) expect(m.feathers).toBeLessThanOrEqual(3);
      }
    expect(withMasks).toBeGreaterThan(20);
  });
});
