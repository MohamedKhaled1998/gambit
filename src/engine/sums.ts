import type { Problem, RaceMatchDef } from "../shared/types";
import { drawInt, shuffle } from "./random";

type Band = RaceMatchDef["generator"]["bands"][number]["kind"];

/** Near-misses of `answer`: off by 1 or 10, or the result of the wrong operation. */
function nearMisses(seed: number, answer: number, wrongOp: number): [number[], number] {
  const pool = [answer + 1, answer - 1, answer + 10, answer - 10, wrongOp].filter((v) => v !== answer);
  let [shuffled, next] = shuffle(seed, [...new Set(pool)]);
  const out = shuffled.slice(0, 3);
  for (let k = 2; out.length < 3; k++) {
    for (const v of [answer + k, answer - k]) if (out.length < 3 && v !== answer && !out.includes(v)) out.push(v);
  }
  return [out, next];
}

function one(seed: number, kind: Band): [Problem & { key: string }, number] {
  let a: number, b: number, c: number, op: number;
  let prompt: string, answer: number, wrongOp: number;
  if (kind === "addsub") {
    [a, seed] = drawInt(seed, 11, 99);
    [b, seed] = drawInt(seed, 11, 99);
    [op, seed] = drawInt(seed, 0, 1);
    if (op === 0) [prompt, answer, wrongOp] = [`${a} + ${b}`, a + b, Math.abs(a - b)];
    else {
      const [hi, lo] = [Math.max(a, b), Math.min(a, b)];
      [prompt, answer, wrongOp] = [`${hi} − ${lo}`, hi - lo, hi + lo];
    }
  } else if (kind === "mul") {
    [a, seed] = drawInt(seed, 11, 99);
    [b, seed] = drawInt(seed, 3, 9);
    [prompt, answer, wrongOp] = [`${a} × ${b}`, a * b, a + b];
  } else {
    [a, seed] = drawInt(seed, 11, 60);
    [b, seed] = drawInt(seed, 11, 60);
    [c, seed] = drawInt(seed, 2, 9);
    [op, seed] = drawInt(seed, 0, 1);
    if (op === 0) [prompt, answer, wrongOp] = [`${a} + ${b} × ${c}`, a + b * c, (a + b) * c];
    else [prompt, answer, wrongOp] = [`${a} × ${c} − ${b}`, a * c - b, a * c + b];
  }
  let misses: number[];
  [misses, seed] = nearMisses(seed, answer, wrongOp);
  return [{ prompt, key: prompt, choices: [answer, ...misses].map(String) }, seed];
}

/** Seeded problems, harder as the steps go on; no prompt repeats. Returns the advanced seed. */
export function generateSums(seed: number, def: RaceMatchDef, count: number): [Problem[], number] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  for (let step = 0; step < count; step++) {
    const band = [...def.generator.bands].reverse().find((b) => step >= b.fromStep)!;
    for (let tries = 0; ; tries++) {
      let p: Problem & { key: string };
      [p, seed] = one(seed, band.kind);
      if (!seen.has(p.key) || tries > 200) {
        seen.add(p.key);
        problems.push({ prompt: p.prompt, choices: p.choices });
        break;
      }
    }
  }
  return [problems, seed];
}
