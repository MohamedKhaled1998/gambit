import type { Problem, RaceMatchDef } from "../shared/types";
import { generateSequences } from "./sequences";
import { generateSums } from "./sums";

/** A match's problem bank: seeded problems from its generator. Returns the advanced seed. */
export function generateProblems(seed: number, def: RaceMatchDef, count: number): [Problem[], number] {
  const g = def.generator;
  return g.kind === "sums" ? generateSums(seed, def as RaceMatchDef & { generator: typeof g }, count) : generateSequences(seed, def as RaceMatchDef & { generator: typeof g }, count);
}
