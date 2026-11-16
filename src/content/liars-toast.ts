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
  prelude: [
    { seconds: 10, caption: "Ana, Ben and Cy each get a secret card, 1 to 9. Ana holds 4.", screen: { kind: "toast", stage: "claim", card: 4 } },
    { seconds: 10, caption: "Everyone toasts a claim of their card's value. Ana claims 8. Ben claims 6. Cy claims 3.", screen: { kind: "toast", stage: "claim", card: 4, claims: { ana: 8, ben: 6, cy: 3 } } },
    { seconds: 10, caption: "Claims are public. Now each guest may secretly call one other guest a liar, or no one.", screen: { kind: "toast", stage: "call", card: 4, claims: { ana: 8, ben: 6, cy: 3 } } },
    { seconds: 10, caption: "Ben calls Ana. Cy calls Ben.", screen: { kind: "toast", stage: "call", card: 4, claims: { ana: 8, ben: 6, cy: 3 }, calls: [{ caller: "ben", target: "ana" }, { caller: "cy", target: "ben" }] } },
    { seconds: 10, caption: "Ana was lying, holding 4: she scores nothing, and Ben scores her claim, 8.", screen: { kind: "toast", stage: "reveal", card: 4, claims: { ana: 8, ben: 6, cy: 3 }, calls: [{ caller: "ben", target: "ana" }, { caller: "cy", target: "ben" }], cards: { ana: 4, ben: 7 } } },
    { seconds: 10, caption: "Ben told the truth, holding 7, so he scores his claim, 6, and 5 extra for the call against him.", screen: { kind: "toast", stage: "reveal", card: 4, claims: { ana: 8, ben: 6, cy: 3 }, calls: [{ caller: "ben", target: "ana" }, { caller: "cy", target: "ben" }], cards: { ana: 4, ben: 7 } } },
    { seconds: 10, caption: "Nobody called Cy, so Cy scores 3 and the card stays hidden. Favours buy extra points, three each.", screen: { kind: "toast", stage: "reveal", card: 4, claims: { ana: 8, ben: 6, cy: 3 }, calls: [{ caller: "ben", target: "ana" }, { caller: "cy", target: "ben" }], cards: { ana: 4, ben: 7 } } },
  ],
  buyRate: 3,
  tieBreak: ["points", "calls", "draw"],
};
