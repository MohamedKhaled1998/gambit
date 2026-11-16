import type { Mask, Problem, RaceMatchDef } from "../shared/types";
import { maskName, randomMask } from "./masks";

/**
 * Seating Plan's problems: a grid of masks that grows 3×3, 4×4, 5×5, then one target named by its
 * traits. The target is the only mask in the grid with its colour and shape, and sits in cell 0 of
 * the canonical order (index 0 is the right answer); each guest's layout permutes the cells.
 */

type Gen = RaceMatchDef["generator"] & { kind: "seating" };

/** Seeded problems; no problem repeats. Returns the advanced seed. */
export function generateSeating(seed: number, def: RaceMatchDef & { generator: Gen }, count: number): [Problem[], number] {
  const { sizes } = def.generator;
  const problems: Problem[] = [];
  const seen = new Set<string>();
  for (let step = 0; step < count; step++) {
    const cols = sizes[Math.min(sizes.length - 1, Math.floor((step / count) * sizes.length))]!;
    for (let tries = 0; ; tries++) {
      if (tries > 1000) throw new Error("Seating Plan ran out of distinct problems");
      let target: Mask;
      [target, seed] = randomMask(seed);
      const grid: Mask[] = [target];
      while (grid.length < cols * cols) {
        let m: Mask;
        [m, seed] = randomMask(seed);
        if (m.colour !== target.colour || m.shape !== target.shape) grid.push(m);
      }
      const choices = grid.map(maskName);
      const prompt = `Where was the ${target.colour} ${target.shape}${target.shape === "plain" ? " mask" : ""}?`;
      const key = `${prompt}|${[...choices].sort().join("|")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({ prompt, choices, promptMasks: [target], study: { kind: "grid", masks: grid, cols } });
      break;
    }
  }
  return [problems, seed];
}
