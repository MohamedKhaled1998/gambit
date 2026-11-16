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
  prelude: [
    { seconds: 9, caption: "Ana, Ben and Cy watch the guests walk in a pattern: 3, 5, 9, 17, and then a gap.", screen: { kind: "step", stage: "answer", prompt: "3, 5, 9, 17, ?", choices: ["25", "31", "33", "34"] } },
    { seconds: 9, caption: "Who comes next? Each gap doubles: plus 2, plus 4, plus 8.", screen: { kind: "step", stage: "answer", prompt: "3, 5, 9, 17, ?", choices: ["25", "31", "33", "34"] } },
    { seconds: 9, caption: "Ben taps 33. Cy taps 31.", screen: { kind: "step", stage: "answer", prompt: "3, 5, 9, 17, ?", choices: ["25", "31", "33", "34"], taps: { ben: 2, cy: 1 } } },
    { seconds: 9, caption: "The next gap is 16, so 33 is right. Ben scores ten points; Cy and Ana score nothing.", screen: { kind: "step", stage: "reveal", prompt: "3, 5, 9, 17, ?", choices: ["25", "31", "33", "34"], taps: { ben: 2, cy: 1 }, correct: 2 } },
    { seconds: 9, caption: "Later patterns weave two rules together. Favours buy extra points, five each.", screen: { kind: "step", stage: "reveal", prompt: "3, 5, 9, 17, ?", choices: ["25", "31", "33", "34"], taps: { ben: 2, cy: 1 }, correct: 2 } },
  ],
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  masks: true,
  // One rule, then two rules interleaved.
  generator: { kind: "sequences", bands: [{ fromStep: 0, rules: 1 }, { fromStep: 4, rules: 2 }] },
};
