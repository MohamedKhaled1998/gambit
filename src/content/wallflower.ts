import type { UniquePickMatchDef } from "../shared/types";

/** Wallflower: numbers nobody else picked score. A Dance or a Cellar game, on the Unique pick match type, as data. */
export const WALLFLOWER: UniquePickMatchDef = {
  id: "wallflower",
  name: "Wallflower",
  type: "uniquePick",
  rulesSummary:
    "Each step, pick a number in secret. A number nobody else picked scores its value, and the highest of those scores five more. Numbers picked by two or more score nothing. The reveal names every pick. Favours buy points, three each.",
  workedExample:
    "Five guests, numbers 1 to 6. Ana and Ben both pick 6 and score nothing. Cy picks 5 and scores 5 plus 5 for the highest unique number. Dee picks 2 and scores 2. Eve picks 1 and scores 1.",
  guestRange: { dance: [3, 10], cellar: [3, 9] },
  steps: { dance: 10, cellar: 7 },
  rangeBands: [
    { upTo: 5, max: 6 },
    { upTo: 8, max: 9 },
    { upTo: 10, max: 12 },
  ],
  topBonus: 5,
  studySeconds: 0,
  answerSeconds: 15,
  stepSeconds: 20,
  preludeSeconds: 50,
  buyRate: 3,
  tieBreak: ["points", "uniques", "draw"],
};
