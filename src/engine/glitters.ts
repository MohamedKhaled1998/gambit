import { COLOURS, type Mask, type Problem, type RaceMatchDef } from "../shared/types";
import { randomMask } from "./masks";
import { drawInt, shuffle } from "./random";

/**
 * All That Glitters' problems: a crowd of masks that grows from step to step, then a count. Early
 * steps ask for the gold masks; later ones for gold masks with a second trait, so the gold masks
 * without it are the decoys. Masks come from the six-colour palette alone, so nothing is near gold.
 */

type Gen = RaceMatchDef["generator"] & { kind: "glitters" };
const NOT_GOLD = COLOURS.filter((c) => c !== "gold");

const SECOND_TRAITS = [
  { prompt: "How many gold foxes?", withTrait: { shapes: ["fox"] as const }, without: { shapes: ["cat", "owl", "plain"] as const } },
  { prompt: "How many gold masks wore feathers?", withTrait: { feathers: [1, 2, 3] }, without: { feathers: [0] } },
];

/** Seeded problems; the right count is the first choice. No problem repeats. Returns the advanced seed. */
export function generateGlitters(seed: number, def: RaceMatchDef & { generator: Gen }, count: number): [Problem[], number] {
  const { crowd, secondFrom } = def.generator;
  const problems: Problem[] = [];
  const seen = new Set<string>();
  for (let step = 0; step < count; step++) {
    const progress = count === 1 ? 1 : step / (count - 1);
    const size = Math.round(crowd[0] + (crowd[1] - crowd[0]) * progress);
    const second = progress >= secondFrom;
    for (let tries = 0; ; tries++) {
      if (tries > 1000) throw new Error("All That Glitters ran out of distinct problems");
      let golds: number, which: number, withTrait: number, start: number;
      [golds, seed] = drawInt(seed, 4, Math.floor(size / 2));
      [which, seed] = drawInt(seed, 0, SECOND_TRAITS.length - 1);
      [withTrait, seed] = drawInt(seed, 1, golds - 2);
      const trait = SECOND_TRAITS[which]!;
      const masks: Mask[] = [];
      for (let i = 0; i < size; i++) {
        let m: Mask;
        if (i >= golds) [m, seed] = randomMask(seed, { colours: NOT_GOLD });
        else if (!second) [m, seed] = randomMask(seed, { colours: ["gold"] });
        else if (i < withTrait) [m, seed] = randomMask(seed, { colours: ["gold"], ...trait.withTrait });
        else [m, seed] = randomMask(seed, { colours: ["gold"], ...trait.without });
        masks.push(m);
      }
      const answer = second ? withTrait : golds;
      [start, seed] = drawInt(seed, Math.max(0, answer - 3), answer);
      const choices = [answer, ...[0, 1, 2, 3].map((k) => start + k).filter((v) => v !== answer)].map(String);
      const prompt = second ? trait.prompt : "How many were gold?";
      const key = `${prompt}|${[...choices].sort().join("|")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let crowdMasks: Mask[];
      [crowdMasks, seed] = shuffle(seed, masks);
      problems.push({ prompt, choices, study: { kind: "crowd", masks: crowdMasks } });
      break;
    }
  }
  return [problems, seed];
}
