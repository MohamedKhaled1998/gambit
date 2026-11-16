import type { RaceMatchDef } from "../shared/types";
import { DEMO_GRID } from "./demo";

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
  prelude: [
    { seconds: 9, caption: "Ana, Ben and Cy take their seats: a four by four grid shows for five seconds. The silver fox sits top right.", screen: { kind: "step", stage: "study", prompt: "", choices: [], study: { kind: "grid", masks: DEMO_GRID, cols: 4 }, grid: { cols: 4 } } },
    { seconds: 9, caption: "The lights go out. Where was the silver fox?", screen: { kind: "step", stage: "answer", prompt: "", promptMasks: [DEMO_GRID[3]!], choices: DEMO_GRID.map(() => "cell"), grid: { cols: 4 }, lightsOut: true } },
    { seconds: 9, caption: "Your grid is laid out in your own order. Ben saw it top right on his layout and taps there. Ana taps the cell beside it.", screen: { kind: "step", stage: "answer", prompt: "", promptMasks: [DEMO_GRID[3]!], choices: DEMO_GRID.map(() => "cell"), grid: { cols: 4 }, lightsOut: true, taps: { ben: 3, ana: 2 } } },
    { seconds: 9, caption: "Ben scores ten points. Ana scores nothing, and Cy ran out of time.", screen: { kind: "step", stage: "reveal", prompt: "", promptMasks: [DEMO_GRID[3]!], choices: DEMO_GRID.map(() => "cell"), grid: { cols: 4 }, taps: { ben: 3, ana: 2 }, correct: 3 } },
    { seconds: 9, caption: "Only your memory helps. Favours buy extra points, five each.", screen: { kind: "step", stage: "reveal", prompt: "", promptMasks: [DEMO_GRID[3]!], choices: DEMO_GRID.map(() => "cell"), grid: { cols: 4 }, taps: { ben: 3, ana: 2 }, correct: 3 } },
  ],
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  masks: true,
  generator: { kind: "seating", sizes: [3, 4, 5] },
};
