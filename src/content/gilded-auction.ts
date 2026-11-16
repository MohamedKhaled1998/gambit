import type { SealedBidMatchDef } from "../shared/types";

/** Gilded Auction: lots go to sealed bids. A match on the Sealed bid match type, as data. */
export const GILDED_AUCTION: SealedBidMatchDef = {
  id: "gilded-auction",
  name: "Gilded Auction",
  type: "sealedBid",
  rulesSummary:
    "You start with 50 points. Each lot has a public value. Bid in secret, from nothing up to all you hold; the highest bid pays what it bid and gains the lot's value. Losers pay nothing. Equal bids go to the first in. Favours buy points, five each.",
  workedExample:
    "A 30-point lot. Ana bids 12, Ben 18, Cy 0. Ben pays 18 and gains 30: 50 to 62. Ana stays at 50, having promised Cy she'd stay off this lot and kept it. The reveal names every bid.",
  guestRange: { dance: [3, 10], cellar: null },
  steps: { dance: 8, cellar: null },
  startingPoints: 50,
  lotBands: [
    { upTo: 5, lots: 6 },
    { upTo: 10, lots: 8 },
  ],
  lotValue: [10, 40],
  meanValue: 25,
  studySeconds: 0,
  answerSeconds: 20,
  stepSeconds: 25,
  preludeSeconds: 60,
  prelude: [
    { seconds: 10, caption: "Ana, Ben and Cy each start with 50 points. A lot comes up with a public value: this one is worth 30.", screen: { kind: "lot", stage: "bid", lot: 30, points: 50 } },
    { seconds: 10, caption: "Everyone bids in secret, from nothing up to all they hold. The highest bid pays what it bid.", screen: { kind: "lot", stage: "bid", lot: 30, points: 50 } },
    { seconds: 10, caption: "Ana bids 12. Ben bids 18. Cy bids nothing.", screen: { kind: "lot", stage: "bid", lot: 30, points: 50, bids: [{ guest: "ana", amount: 12 }, { guest: "ben", amount: 18 }, { guest: "cy", amount: 0 }] } },
    { seconds: 10, caption: "The reveal names every bid. Ben pays 18 and gains 30: 50 points become 62.", screen: { kind: "lot", stage: "reveal", lot: 30, points: 62, bids: [{ guest: "ben", amount: 18 }, { guest: "ana", amount: 12 }, { guest: "cy", amount: 0 }], winner: "ben", price: 18 } },
    { seconds: 10, caption: "Losers pay nothing. Ana stays at 50. Equal bids go to the first in.", screen: { kind: "lot", stage: "reveal", lot: 30, points: 50, bids: [{ guest: "ben", amount: 18 }, { guest: "ana", amount: 12 }, { guest: "cy", amount: 0 }], winner: "ben", price: 18 } },
    { seconds: 10, caption: "Promises are only promises: a guest may say they'll stay off a lot, and betray you. Favours buy extra points, five each.", screen: { kind: "lot", stage: "reveal", lot: 30, points: 50, bids: [{ guest: "ben", amount: 18 }, { guest: "ana", amount: 12 }, { guest: "cy", amount: 0 }], winner: "ben", price: 18 } },
  ],
  buyRate: 5,
  tieBreak: ["points", "lots", "draw"],
};
