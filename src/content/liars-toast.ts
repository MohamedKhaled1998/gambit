import type { BluffMatchDef } from "../shared/types";

/** Liar's Toast: secret cards, public claims, secret calls. A match on the Bluff match type, as data. */
export const LIARS_TOAST: BluffMatchDef = {
  id: "liars-toast",
  name: "Liar's Toast",
  type: "bluff",
  rulesSummary:
    "Each step you get a secret card, 1 to 9, and toast a claim of its value. Then you may secretly call one guest a liar. Uncalled, you score your claim. Caught lying, you score nothing and your callers score your claim. Honest and called, you earn 5 extra per caller.",
  workedExample:
    "Ana holds 4 and claims 8; Ben holds 7 and claims 6; Cy holds 2 and claims 3. Ben calls Ana, Cy calls Ben. Ana was lying: she scores 0, Ben scores 8. Ben was honest: he scores 6 + 5 = 11 more, Cy nothing for that call. Nobody called Cy, so Cy scores 3 and her card stays hidden.",
  guestRange: { dance: [3, 10], cellar: null },
  steps: { dance: 6, cellar: null },
  maxCard: 9,
  honestBonus: 5,
  studySeconds: 0,
  answerSeconds: 15,
  stepSeconds: 35,
  preludeSeconds: 70,
  buyRate: 3,
  tieBreak: ["points", "calls", "draw"],
};
