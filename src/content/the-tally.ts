import type { RaceMatchDef } from "../shared/types";

/** The Tally: sums flash up; tap the right answer. A match on the Race match type, as data. */
export const THE_TALLY: RaceMatchDef = {
  id: "the-tally",
  name: "The Tally",
  type: "race",
  rulesSummary:
    "A sum appears with four choices. Tap the right one before the music stops. A correct answer scores ten points, a wrong or missing one nothing. The sums get harder. The quickest breaks ties. Favours buy points, five each.",
  workedExample:
    "Step 5 shows 34 × 6, with choices 204, 194, 214 and 240. Ana taps 204 in 4.1 seconds and scores 10. Ben taps 194 and scores 0. Cy doesn't answer and scores 0. The reveal shows 204 and everyone's running rank.",
  guestRange: { dance: [3, 10], cellar: [2, 9] },
  steps: { dance: 12, cellar: 8 },
  studySeconds: 0,
  answerSeconds: 15,
  stepSeconds: 18,
  preludeSeconds: 45,
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  // Two-digit + and −, then two-digit × one-digit, then two operations.
  generator: {
    kind: "sums",
    bands: [
      { fromStep: 0, kind: "addsub" },
      { fromStep: 4, kind: "mul" },
      { fromStep: 8, kind: "twoOps" },
    ],
  },
};
