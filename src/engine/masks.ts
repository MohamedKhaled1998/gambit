import { COLOURS, FEATHER_MAX, SHAPES, TRIMS, type Mask } from "../shared/types";
import { draw, drawInt } from "./random";

/** The shared mask generator: every mask in the game, a guest's or a problem's, is a trait combination from here. */

export const TRIM_CHOICES: (Mask["trim"])[] = [null, ...TRIMS];

/** Two masks with the same key are the same mask. */
export const maskKey = (m: Mask) => `${m.colour}/${m.shape}/${m.trim ?? "none"}/${m.feathers}`;

/** Every mask the generator can make. */
export function allMasks(): Mask[] {
  const out: Mask[] = [];
  for (const colour of COLOURS)
    for (const shape of SHAPES)
      for (const trim of TRIM_CHOICES) for (let feathers = 0; feathers <= FEATHER_MAX; feathers++) out.push({ colour, shape, trim, feathers });
  return out;
}

/** A plain-words name, with no commas; also the accessible label. */
export function maskName(m: Mask): string {
  const feathers = m.feathers === 0 ? "no feathers" : `${m.feathers} feather${m.feathers === 1 ? "" : "s"}`;
  return `${m.colour} ${m.shape} (${[m.trim, feathers].filter(Boolean).join(" and ")})`;
}

/**
 * A random mask no one in `taken` resembles: guests differ in colour and shape, the traits that
 * still read at 20px, so there are 24 guests' worth. Returns the advanced seed.
 */
export function drawMask(seed: number, taken: readonly Mask[]): [Mask, number] {
  const used = new Set(taken.map((m) => `${m.colour}/${m.shape}`));
  const free = allMasks().filter((m) => !used.has(`${m.colour}/${m.shape}`));
  const [r, next] = draw(seed);
  return [free[Math.floor(r * free.length)]!, next];
}

/** A random mask of any traits. Returns the advanced seed. */
export function randomMask(seed: number, where: { colours?: readonly Mask["colour"][]; shapes?: readonly Mask["shape"][]; feathers?: readonly number[] } = {}): [Mask, number] {
  const colours = where.colours ?? COLOURS, shapes = where.shapes ?? SHAPES, feathers = where.feathers ?? Array.from({ length: FEATHER_MAX + 1 }, (_, i) => i);
  let c: number, sh: number, t: number, f: number;
  [c, seed] = drawInt(seed, 0, colours.length - 1);
  [sh, seed] = drawInt(seed, 0, shapes.length - 1);
  [t, seed] = drawInt(seed, 0, TRIM_CHOICES.length - 1);
  [f, seed] = drawInt(seed, 0, feathers.length - 1);
  return [{ colour: colours[c]!, shape: shapes[sh]!, trim: TRIM_CHOICES[t]!, feathers: feathers[f]! }, seed];
}
