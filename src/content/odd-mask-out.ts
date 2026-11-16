import type { RaceMatchDef } from "../shared/types";
import { mask } from "./demo";

const ROW = [mask("red", "cat", null, 3), mask("gold", "owl", null, 3), mask("silver", "fox", null, 3), mask("red", "fox", null, 2)];

/** Odd Mask Out: four masks, three sharing a rule and one breaking it. A Dance or a Cellar game, on the Race match type. */
export const ODD_MASK_OUT: RaceMatchDef = {
  id: "odd-mask-out",
  name: "Odd Mask Out",
  type: "race",
  rulesSummary:
    "Four masks stand in a row. Three share a rule and one breaks it. Tap the mask that doesn't belong before the music stops. A correct answer scores ten points. Later rounds hide the rule among decoys. Favours buy points, five each.",
  workedExample:
    "A red cat with 3 feathers, a gold owl with 3, a silver fox with 3 and a red fox with 2. Colours and shapes vary freely, but feather count is the rule, so the red fox with 2 is out.",
  guestRange: { dance: [3, 10], cellar: [2, 9] },
  steps: { dance: 14, cellar: 9 },
  studySeconds: 0,
  answerSeconds: 12,
  stepSeconds: 15,
  preludeSeconds: 45,
  prelude: [
    { seconds: 9, caption: "Ana, Ben and Cy see four masks in a row. Three share a rule and one breaks it.", screen: { kind: "step", stage: "answer", prompt: "Which mask doesn't belong?", choices: ["", "", "", ""], choiceMasks: ROW } },
    { seconds: 9, caption: "Colours and shapes vary freely, but feather count is the rule. Three have three feathers; one has two.", screen: { kind: "step", stage: "answer", prompt: "Which mask doesn't belong?", choices: ["", "", "", ""], choiceMasks: ROW } },
    { seconds: 9, caption: "Cy taps the red fox. Ana taps the gold owl.", screen: { kind: "step", stage: "answer", prompt: "Which mask doesn't belong?", choices: ["", "", "", ""], choiceMasks: ROW, taps: { cy: 3, ana: 1 } } },
    { seconds: 9, caption: "The red fox with two feathers is out. Cy scores ten points; Ana and Ben score nothing.", screen: { kind: "step", stage: "reveal", prompt: "Which mask doesn't belong?", choices: ["", "", "", ""], choiceMasks: ROW, taps: { cy: 3, ana: 1 }, correct: 3 } },
    { seconds: 9, caption: "Later rounds hide the rule among decoys. Favours buy extra points, five each.", screen: { kind: "step", stage: "reveal", prompt: "Which mask doesn't belong?", choices: ["", "", "", ""], choiceMasks: ROW, taps: { cy: 3, ana: 1 }, correct: 3 } },
  ],
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  masks: true,
  // One obvious difference, then decoy pairs on the other traits.
  generator: { kind: "oddmask", bands: [{ fromStep: 0, decoys: false }, { fromStep: 5, decoys: true }] },
};
