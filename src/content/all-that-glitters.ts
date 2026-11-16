import type { RaceMatchDef } from "../shared/types";

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
  pointsPerCorrect: 10,
  buyRate: 5,
  tieBreak: ["points", "time", "draw"],
  masks: true,
  generator: { kind: "glitters", crowd: [12, 30], secondFrom: 0.4 },
};
