import type { RaceMatchDef } from "../shared/types";

/** Arrivals: masks arrive one at a time, then a question about the order. A Cellar game only. */
export const ARRIVALS: RaceMatchDef = {
  id: "arrivals",
  name: "Arrivals",
  type: "race",
  rulesSummary:
    "Masks arrive one by one, a second each. Watch the order. Then one question: who came in just before or after a named mask, who came first, or how many came before it. Tap your answer. A correct answer scores ten points. Favours buy points, five each.",
  workedExample:
    "An owl, a cat, a red fox, a plain mask and a gold owl arrive. Who came in just before the red fox? The choices are the owl, the cat, the plain mask and the gold owl. The cat is right.",
  guestRange: { dance: null, cellar: [2, 9] },
  steps: { dance: null, cellar: 7 },
  // The study lasts as long as the sequence, up to this many seconds.
  studySeconds: 8,
  answerSeconds: 10,
  stepSeconds: 21,
  preludeSeconds: 45,
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  masks: true,
  generator: { kind: "arrivals", length: [4, 8] },
};
