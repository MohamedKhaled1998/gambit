import { COLOURS, SHAPES, type Problem, type RaceMatchDef } from "../shared/types";
import { drawInt, shuffle } from "./random";

/**
 * The Procession's problems: number sequences (steady steps, doubling, alternating gaps,
 * adding the last two) and mask sequences (colour, shape or feather count changing by a rule).
 * One rule shows five terms; two rules interleaved show six. The answer is always the next term.
 */

type Seq = RaceMatchDef["generator"] & { kind: "sequences" };

interface Made {
  prompt: string;
  /** The right answer first, then wrong ones; may hold duplicates. */
  choices: string[];
}

const FEATHERS = 9;

/** `count` terms of a sequence of one rule, and the next term. */
function numberRule(seed: number, count: number, small: boolean): [number[], number] {
  const terms: number[] = [];
  let kind: number, a: number, d: number, e: number;
  [kind, seed] = drawInt(seed, 0, 3);
  [a, seed] = drawInt(seed, 1, small ? 5 : 9);
  [d, seed] = drawInt(seed, 2, small ? 4 : 7);
  [e, seed] = drawInt(seed, 1, small ? 3 : 6);
  if (kind === 0) for (let i = 0; i < count; i++) terms.push(a + d * i);
  else if (kind === 1) for (let i = 0; i < count; i++) terms.push(a * 2 ** i);
  else if (kind === 2) {
    // Alternating gaps: +d then +e then +d…, with d ≠ e.
    if (e === d) e += 1;
    let v = a;
    for (let i = 0; i < count; i++) {
      terms.push(v);
      v += i % 2 === 0 ? d : e;
    }
  } else {
    terms.push(a, a + e);
    while (terms.length < count) terms.push(terms[terms.length - 1]! + terms[terms.length - 2]!);
  }
  return [terms, seed];
}

function numbers(seed: number, rules: 1 | 2): [Made, number] {
  let terms: number[];
  if (rules === 1) {
    [terms, seed] = numberRule(seed, 6, false);
  } else {
    // Two tracks interleaved: even places follow one rule, odd places another; the answer is on the first.
    let a: number[], b: number[];
    [a, seed] = numberRule(seed, 4, true);
    [b, seed] = numberRule(seed, 3, true);
    terms = [0, 1, 2, 3, 4, 5, 6].map((i) => (i % 2 === 0 ? a[i / 2]! : b[(i - 1) / 2]!));
  }
  const answer = terms[terms.length - 1]!;
  const shown = terms.slice(0, -1);
  const last = shown[shown.length - 1]!;
  const gap = Math.abs(answer - last);
  const wrong = [answer + 1, answer - 1, answer + 2, answer - 2, last + gap + 1, answer + 10, answer * 2].filter((v) => v !== answer && v > 0);
  return [{ prompt: `${shown.join(", ")}, ?`, choices: [String(answer), ...wrong.map(String)] }, seed];
}

interface MaskTerm {
  colour: number;
  shape: number;
  feathers: number;
}
const wrap = (v: number, n: number) => ((v % n) + n) % n;
const name = (m: MaskTerm) => `${COLOURS[wrap(m.colour, COLOURS.length)]} ${SHAPES[wrap(m.shape, SHAPES.length)]} ${wrap(m.feathers, FEATHERS) + 1}`;
const ATTRS = ["colour", "shape", "feathers"] as const;

/** Mask `i` along a track that moves one attribute on by one per step. */
function track(base: MaskTerm, attr: (typeof ATTRS)[number], i: number): MaskTerm {
  return { ...base, [attr]: base[attr] + i };
}

function masks(seed: number, rules: 1 | 2): [Made, number] {
  const pick = (s: number): [MaskTerm, number] => {
    let colour: number, shape: number, feathers: number;
    [colour, s] = drawInt(s, 0, COLOURS.length - 1);
    [shape, s] = drawInt(s, 0, SHAPES.length - 1);
    [feathers, s] = drawInt(s, 0, FEATHERS - 1);
    return [{ colour, shape, feathers }, s];
  };
  let base: MaskTerm, other: MaskTerm, ai: number, bi: number;
  [base, seed] = pick(seed);
  [other, seed] = pick(seed);
  [ai, seed] = drawInt(seed, 0, 2);
  [bi, seed] = drawInt(seed, 0, 1);
  const attrA = ATTRS[ai]!;
  const attrB = ATTRS[(ai + 1 + bi) % 3]!;
  const length = rules === 1 ? 6 : 7;
  const terms = Array.from({ length }, (_, i) => (rules === 1 ? track(base, attrA, i) : i % 2 === 0 ? track(base, attrA, i / 2) : track(other, attrB, (i - 1) / 2)));
  const answer = terms[length - 1]!;
  const wrong: MaskTerm[] = [];
  for (const attr of ATTRS) for (const delta of [1, -1, 2]) wrong.push({ ...answer, [attr]: answer[attr] + delta });
  let order: MaskTerm[];
  [order, seed] = shuffle(seed, wrong);
  return [{ prompt: `${terms.slice(0, -1).map(name).join(", ")}, ?`, choices: [name(answer), ...order.map(name)] }, seed];
}

/** Seeded problems, one rule then two; no prompt repeats. Returns the advanced seed. */
export function generateSequences(seed: number, def: RaceMatchDef & { generator: Seq }, count: number): [Problem[], number] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  for (let step = 0; step < count; step++) {
    const band = [...def.generator.bands].reverse().find((b) => step >= b.fromStep)!;
    for (let tries = 0; ; tries++) {
      let isMask: number, made: Made;
      [isMask, seed] = drawInt(seed, 0, 1);
      [made, seed] = isMask ? masks(seed, band.rules) : numbers(seed, band.rules);
      if (!seen.has(made.prompt) || tries > 200) {
        seen.add(made.prompt);
        const choices = [made.choices[0]!, ...[...new Set(made.choices.slice(1))].filter((c) => c !== made.choices[0]).slice(0, 3)];
        problems.push({ prompt: made.prompt, choices });
        break;
      }
    }
  }
  return [problems, seed];
}
