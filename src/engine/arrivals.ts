import { COLOURS, SHAPES, type Mask, type Problem, type RaceMatchDef } from "../shared/types";
import { maskName, randomMask } from "./masks";
import { drawInt, shuffle } from "./random";

/**
 * Arrivals' problems: 4 to 8 masks arrive one at a time, every one a different colour and shape so
 * "the red fox" names exactly one; then one question about the order: just before, just after, first
 * to arrive, or how many came before. Mask questions have four mask choices; the count has four numbers.
 */

type Gen = RaceMatchDef["generator"] & { kind: "arrivals" };
const FORMS = ["before", "after", "first", "count"] as const;

/** Four consecutive numbers holding `answer`, none below 0; the answer first. */
function counts(seed: number, answer: number): [string[], number] {
  let start: number;
  [start, seed] = drawInt(seed, Math.max(0, answer - 3), answer);
  return [[answer, ...[0, 1, 2, 3].map((k) => start + k).filter((v) => v !== answer)].map(String), seed];
}

/** Seeded problems; no problem repeats. Returns the advanced seed. */
export function generateArrivals(seed: number, def: RaceMatchDef & { generator: Gen }, count: number): [Problem[], number] {
  const [min, max] = def.generator.length;
  const problems: Problem[] = [];
  const seen = new Set<string>();
  for (let step = 0; step < count; step++) {
    const progress = count === 1 ? 1 : step / (count - 1);
    const length = Math.round(min + (max - min) * progress);
    for (let tries = 0; ; tries++) {
      if (tries > 1000) throw new Error("Arrivals ran out of distinct problems");
      // A sequence of masks that differ in colour and shape.
      const pairs = COLOURS.flatMap((colour) => SHAPES.map((shape) => ({ colour, shape })));
      let order: typeof pairs, form: number, k: number;
      [order, seed] = shuffle(seed, pairs);
      const seq: Mask[] = [];
      for (const pair of order.slice(0, length)) {
        let m: Mask;
        [m, seed] = randomMask(seed, { colours: [pair.colour], shapes: [pair.shape] });
        seq.push(m);
      }
      [form, seed] = drawInt(seed, 0, FORMS.length - 1);
      const kind = FORMS[form]!;
      // The named mask's place: it needs a neighbour on the side asked about.
      [k, seed] = drawInt(seed, kind === "before" || kind === "count" ? 1 : 0, kind === "after" ? length - 2 : length - 1);
      const named = seq[k]!;
      const name = `the ${named.colour} ${named.shape}${named.shape === "plain" ? " mask" : ""}`;
      let prompt: string, choices: string[], choiceMasks: Mask[] | undefined;
      if (kind === "count") {
        prompt = `How many came in before ${name}?`;
        [choices, seed] = counts(seed, k);
      } else {
        const answerAt = kind === "before" ? k - 1 : kind === "after" ? k + 1 : 0;
        prompt = kind === "first" ? "Who arrived first?" : `Who came in just ${kind} ${name}?`;
        const others = seq.filter((_, i) => i !== answerAt && (kind === "first" || i !== k));
        let shuffled: Mask[];
        [shuffled, seed] = shuffle(seed, others);
        const wrong = shuffled.slice(0, 3);
        // A short sequence can't supply three decoys: add masks that never arrived.
        while (wrong.length < 3) {
          let m: Mask;
          [m, seed] = randomMask(seed);
          if (![...seq, ...wrong].some((x) => x.colour === m.colour && x.shape === m.shape)) wrong.push(m);
        }
        choiceMasks = [seq[answerAt]!, ...wrong];
        choices = choiceMasks.map(maskName);
      }
      const key = `${prompt}|${[...choices].sort().join("|")}`;
      if (seen.has(key) || new Set(choices).size !== 4) continue;
      seen.add(key);
      problems.push({
        prompt,
        choices,
        ...(kind !== "first" && { promptMasks: [named] }),
        ...(choiceMasks && { choiceMasks }),
        study: { kind: "sequence", masks: seq },
        studySeconds: length,
      });
      break;
    }
  }
  return [problems, seed];
}
