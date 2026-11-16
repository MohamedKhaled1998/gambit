import type { RaceMatchDef } from "../shared/types";

/** Seating Plan: a grid of masks shows, the lights go out, tap where the named mask sat. */
export const SEATING_PLAN: RaceMatchDef = {
  id: "seating-plan",
  name: "Seating Plan",
  type: "race",
  rulesSummary:
    "The guests take their seats on a grid, then the lights go out. A mask is named: tap the cell where it sat. Your grid is laid out in your own order, so only your memory helps. A correct tap scores ten points. Favours buy points, five each.",
  workedExample:
    "A four by four grid shows for five seconds and goes dark. Where was the silver fox? Ben saw it top right on his layout and taps there, scoring ten. Ana's layout had it bottom left and she taps the cell beside it, scoring nothing.",
  guestRange: { dance: [3, 10], cellar: [2, 9] },
  steps: { dance: 12, cellar: 8 },
  studySeconds: 5,
  answerSeconds: 8,
  stepSeconds: 16,
  preludeSeconds: 45,
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  masks: true,
  generator: { kind: "seating", sizes: [3, 4, 5] },
};
