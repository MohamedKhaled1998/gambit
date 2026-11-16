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
  buyRate: 5,
  tieBreak: ["points", "lots", "draw"],
};
