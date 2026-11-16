import type { RaceMatchDef } from "../shared/types";

/** The Procession: the guests walk in a pattern; who comes next? Cellar only, on the Race match type. */
export const THE_PROCESSION: RaceMatchDef = {
  id: "the-procession",
  name: "The Procession",
  type: "race",
  rulesSummary:
    "The guests walk in a pattern, numbers or masks, with the last one missing. Tap the one who comes next before the music stops. A correct answer scores ten points. Later patterns weave two rules together. Favours buy points, five each.",
  workedExample:
    "The sequence is 3, 5, 9, 17, then a gap, with choices 25, 31, 33 and 34. Each gap doubles: plus 2, plus 4, plus 8, so the next gap is 16 and 33 comes next.",
  guestRange: { dance: null, cellar: [2, 9] },
  steps: { dance: null, cellar: 7 },
  studySeconds: 0,
  answerSeconds: 20,
  stepSeconds: 23,
  preludeSeconds: 45,
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  // One rule, then two rules interleaved.
  generator: { kind: "sequences", bands: [{ fromStep: 0, rules: 1 }, { fromStep: 4, rules: 2 }] },
};
