import { COLOURS, FEATHER_MAX, SHAPES, type Mask, type Problem, type RaceMatchDef } from "../shared/types";
import { maskKey, maskName, TRIM_CHOICES } from "./masks";
import { drawInt, shuffle } from "./random";

/**
 * Odd Mask Out's problems: four masks, three sharing a value on one trait (the rule) and one breaking it.
 * Early steps vary every other trait freely, so one difference stands out; later steps give the other
 * traits decoy pairs (two and two, never three and one), so several differences exist but only one forms the pattern.
 */

type Gen = RaceMatchDef["generator"] & { kind: "oddmask" };
const TRAITS = ["colour", "shape", "trim", "feathers"] as const;
type Trait = (typeof TRAITS)[number];
const DOMAIN: { [T in Trait]: Mask[T][] } = {
  colour: [...COLOURS],
  shape: [...SHAPES],
  trim: TRIM_CHOICES,
  feathers: Array.from({ length: FEATHER_MAX + 1 }, (_, i) => i),
};

/** Four values of a trait: all different, or with decoy pairs and no value three times. */
function spread<T>(seed: number, domain: readonly T[], decoys: boolean): [T[], number] {
  if (!decoys) {
    let order: T[];
    [order, seed] = shuffle(seed, domain);
    return [order.slice(0, 4), seed];
  }
  for (;;) {
    const picks: T[] = [];
    for (let i = 0; i < 4; i++) {
      let k: number;
      [k, seed] = drawInt(seed, 0, domain.length - 1);
      picks.push(domain[k]!);
    }
    if (picks.every((p) => picks.filter((q) => q === p).length <= 2)) return [picks, seed];
  }
}

/** Seeded problems: the odd mask is the right answer, first. Returns the advanced seed. */
export function generateOddMasks(seed: number, def: RaceMatchDef & { generator: Gen }, count: number): [Problem[], number] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  for (let step = 0; step < count; step++) {
    const band = [...def.generator.bands].reverse().find((b) => step >= b.fromStep)!;
    for (let tries = 0; ; tries++) {
      let t: number, vi: number, wi: number;
      [t, seed] = drawInt(seed, 0, TRAITS.length - 1);
      const rule = TRAITS[t]!;
      const dom = DOMAIN[rule] as unknown[];
      [vi, seed] = drawInt(seed, 0, dom.length - 1);
      [wi, seed] = drawInt(seed, 0, dom.length - 2);
      const shared = dom[vi], odd = dom[wi >= vi ? wi + 1 : wi];
      const masks: Mask[] = [0, 1, 2, 3].map(() => ({ colour: "gold", shape: "plain", trim: null, feathers: 0 }));
      for (const trait of TRAITS) {
        let values: unknown[];
        if (trait === rule) values = [odd, shared, shared, shared];
        else [values, seed] = spread(seed, DOMAIN[trait] as unknown[], band.decoys);
        masks.forEach((m, i) => ((m as unknown as Record<string, unknown>)[trait] = values[i]));
      }
      const choices = masks.map(maskName);
      const key = [...choices].sort().join("|");
      const distinct = new Set(masks.map(maskKey)).size === 4;
      if (distinct && (!seen.has(key) || tries > 200)) {
        seen.add(key);
        problems.push({ prompt: "Which mask doesn't belong?", choices, choiceMasks: masks });
        break;
      }
    }
  }
  return [problems, seed];
}
