import type { RaceMatchDef } from "../shared/types";
import { DEMO_CROWD } from "./demo";

/** All That Glitters: a crowd of masks flashes up, then a count. A Dance or a Cellar game, on the Race match type. */
export const ALL_THAT_GLITTERS: RaceMatchDef = {
  id: "all-that-glitters",
  name: "All That Glitters",
  type: "race",
  rulesSummary:
    "A crowd of masks appears for a moment, then vanishes. Count the gold ones before the music stops, and later only the gold ones with a second trait. Tap your count from four choices. A correct answer scores ten points. Favours buy points, five each.",
  workedExample:
    "Eighteen masks flash for three seconds, seven of them gold: five gold foxes and two gold owls. How many gold foxes? Choices 4, 5, 6, 7. Ana picks 7, counting the owls, and scores nothing; Ben picks 5 and scores ten.",
  guestRange: { dance: [3, 10], cellar: [2, 9] },
  steps: { dance: 12, cellar: 8 },
  studySeconds: 3,
  answerSeconds: 10,
  stepSeconds: 16,
  preludeSeconds: 45,
  prelude: [
    { seconds: 8, caption: "Ana, Ben and Cy see eighteen masks flash for three seconds.", screen: { kind: "step", stage: "study", prompt: "", choices: [], study: { kind: "crowd", masks: DEMO_CROWD } } },
    { seconds: 9, caption: "Seven were gold: five gold foxes and two gold owls. How many gold foxes? Choices 4, 5, 6 and 7.", screen: { kind: "step", stage: "answer", prompt: "How many gold foxes?", choices: ["4", "5", "6", "7"] } },
    { seconds: 9, caption: "Ana picks 7, counting the owls. Ben picks 5.", screen: { kind: "step", stage: "answer", prompt: "How many gold foxes?", choices: ["4", "5", "6", "7"], taps: { ana: 3, ben: 1 } } },
    { seconds: 9, caption: "Five is right. Ben scores ten points; Ana and Cy score nothing.", screen: { kind: "step", stage: "reveal", prompt: "How many gold foxes?", choices: ["4", "5", "6", "7"], taps: { ana: 3, ben: 1 }, correct: 1 } },
    { seconds: 10, caption: "Later you count only gold masks with a second trait. Favours buy extra points, five each.", screen: { kind: "step", stage: "reveal", prompt: "How many gold foxes?", choices: ["4", "5", "6", "7"], taps: { ana: 3, ben: 1 }, correct: 1 } },
  ],
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  masks: true,
  generator: { kind: "glitters", crowd: [12, 30], secondFrom: 0.4 },
};
