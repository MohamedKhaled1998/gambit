import type { GroupTargetMatchDef } from "../shared/types";

/** The Pledge: a pot with a target, and a reckoning. The only match on the Group target match type, as data. */
export const THE_PLEDGE: GroupTargetMatchDef = {
  id: "the-pledge",
  name: "The Pledge",
  type: "groupTarget",
  rulesSummary:
    "Each round you're handed 10 points. Pledge some to the pot in secret and keep the rest. At the reckoning, Share or Pocket. If the pot reached the target, all share and all win; a lone pocket wins more. Favours buy points, five each.",
  workedExample:
    "Six guests, target 180. The pot holds 186. Five choose Share and Dee chooses Pocket: Dee gets 3 favours and the others get nothing. Dee also kept the most points, so she tops the ranking.",
  guestRange: { dance: [3, 10], cellar: null },
  steps: { dance: 6, cellar: null },
  pledgeSteps: 5,
  pointsPerStep: 10,
  targetPerGuest: 30,
  allShareAward: 2,
  lonePocketAward: 3,
  studySeconds: 0,
  answerSeconds: 20,
  stepSeconds: 25,
  preludeSeconds: 60,
  buyRate: 5,
  tieBreak: ["points", "draw"],
  oncePerGame: true,
};
