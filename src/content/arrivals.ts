import type { RaceMatchDef } from "../shared/types";
import { mask } from "./demo";

const ARRIVING = [mask("onyx", "owl"), mask("silver", "cat"), mask("red", "fox"), mask("sapphire", "plain"), mask("gold", "owl")];
const CHOICES = [ARRIVING[0]!, ARRIVING[1]!, ARRIVING[3]!, ARRIVING[4]!];

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
  prelude: [
    { seconds: 9, caption: "Ana, Ben and Cy watch masks arrive, one a second: an owl, a cat, a red fox, a plain mask and a gold owl.", screen: { kind: "step", stage: "study", prompt: "", choices: [], study: { kind: "sequence", masks: ARRIVING } } },
    { seconds: 9, caption: "Who came in just before the red fox?", screen: { kind: "step", stage: "answer", prompt: "Who came in just before the red fox?", promptMasks: [ARRIVING[2]!], choices: ["", "", "", ""], choiceMasks: CHOICES } },
    { seconds: 9, caption: "Ben taps the cat. Ana taps the owl.", screen: { kind: "step", stage: "answer", prompt: "Who came in just before the red fox?", promptMasks: [ARRIVING[2]!], choices: ["", "", "", ""], choiceMasks: CHOICES, taps: { ben: 1, ana: 0 } } },
    { seconds: 9, caption: "The cat is right. Ben scores ten points; Ana and Cy score nothing.", screen: { kind: "step", stage: "reveal", prompt: "Who came in just before the red fox?", promptMasks: [ARRIVING[2]!], choices: ["", "", "", ""], choiceMasks: CHOICES, taps: { ben: 1, ana: 0 }, correct: 1 } },
    { seconds: 9, caption: "Questions vary: who came first, who came after, how many came before. Favours buy extra points, five each.", screen: { kind: "step", stage: "reveal", prompt: "Who came in just before the red fox?", promptMasks: [ARRIVING[2]!], choices: ["", "", "", ""], choiceMasks: CHOICES, taps: { ben: 1, ana: 0 }, correct: 1 } },
  ],
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  masks: true,
  generator: { kind: "arrivals", length: [4, 8] },
};
