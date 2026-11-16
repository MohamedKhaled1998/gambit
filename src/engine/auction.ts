import type { AuctionState, AuctionView, GuestId, RankingEntry, Rejection, SealedBidMatchDef } from "../shared/types";
import { draw, drawInt, shuffle } from "./random";

/** The Sealed bid match type: one lot a step, one sealed bid per guest, the highest bid takes the lot. */

const REVEAL_MS = 5000;

/** How many lots a game of `guests` sells. */
export function lotCount(def: SealedBidMatchDef, guests: number): number {
  return (def.lotBands.find((b) => guests <= b.upTo) ?? def.lotBands[def.lotBands.length - 1]!).lots;
}

/**
 * Lot values from `lotValue[0]` to `lotValue[1]`, summing to `meanValue` × lots, mixing high and low.
 * Built in pairs that sum to twice the mean (a high with its low), each pair in a random order, the pairs shuffled.
 */
export function generateLots(seed: number, def: SealedBidMatchDef, count: number): [number[], number] {
  const [lo, hi] = def.lotValue;
  const pairSum = 2 * def.meanValue;
  let pairs: number[][] = [];
  for (let i = 0; i < Math.floor(count / 2); i++) {
    let a: number;
    // The high of the pair lies between the mean and the top, its low is whatever completes the pair.
    [a, seed] = drawInt(seed, Math.max(def.meanValue, pairSum - hi), hi);
    let flip: number;
    [flip, seed] = draw(seed);
    const b = pairSum - a;
    pairs.push(flip < 0.5 ? [a, b] : [b, a]);
  }
  [pairs, seed] = shuffle(seed, pairs);
  const values = pairs.flat();
  if (count % 2) values.push(def.meanValue);
  if (values.some((v) => v < lo || v > hi)) throw new Error("a lot fell outside its band");
  return [values, seed];
}

export function startAuction(seed: number, def: SealedBidMatchDef, guests: GuestId[], at: number): [AuctionState, number] {
  let lots;
  [lots, seed] = generateLots(seed, def, lotCount(def, guests.length));
  const drawKeys: AuctionState["drawKeys"] = {};
  const points: AuctionState["points"] = {};
  const won: AuctionState["won"] = {};
  for (const g of guests) {
    [drawKeys[g], seed] = draw(seed);
    points[g] = def.startingPoints;
    won[g] = 0;
  }
  const auction: AuctionState = { def, lots, step: 0, stage: "bid", stepStartedAt: at, bidDeadline: at, deadline: at, drawKeys, bids: {}, points, won, sale: null };
  openStep(auction, at);
  return [auction, seed];
}

function openStep(a: AuctionState, at: number): void {
  a.stage = "bid";
  a.stepStartedAt = at;
  a.bidDeadline = at + a.def.answerSeconds * 1000;
  a.deadline = a.bidDeadline;
  a.bids = {};
  a.sale = null;
}

/** The bids of the step, winner first: highest, then submitted first. */
function byStanding(a: AuctionState): [GuestId, { amount: number; order: number }][] {
  return Object.entries(a.bids).sort(([, x], [, y]) => y.amount - x.amount || x.order - y.order);
}

/** Sells the lot and opens its reveal at `at`. A guest who didn't bid can't win; with no bids the lot goes unsold. */
function reveal(a: AuctionState, at: number): void {
  const top = byStanding(a)[0];
  if (top) {
    const [winner, bid] = top;
    a.points[winner]! += a.lots[a.step]! - bid.amount;
    a.won[winner]! += 1;
    a.sale = { winner, price: bid.amount };
  }
  a.stage = "reveal";
  a.deadline = at + REVEAL_MS;
}

/** Moves the clock to `at` (a deadline); returns false once the last reveal is over. */
export function advanceAuction(a: AuctionState, at: number): boolean {
  if (a.stage === "bid") {
    reveal(a, at);
    return true;
  }
  if (a.step + 1 >= a.lots.length) return false;
  a.step += 1;
  openStep(a, at);
  return true;
}

export function bidAuction(a: AuctionState, guest: GuestId, amount: number, now: number): Rejection | null {
  if (a.stage !== "bid" || now >= a.bidDeadline) return "too late";
  if (guest in a.bids) return "already bid";
  if (!Number.isInteger(amount) || amount < 0 || amount > a.points[guest]!) return "bids are whole points up to what you hold";
  a.bids[guest] = { amount, order: Object.keys(a.bids).length };
  if (Object.keys(a.bids).length === Object.keys(a.points).length) reveal(a, now);
  return null;
}

export function buyAuctionPoints(a: AuctionState, guest: GuestId, favours: number): void {
  a.points[guest]! += favours * a.def.buyRate;
}

/** A strict ranking: points, then more lots won, then the draw. */
export function rankAuction(a: AuctionState): RankingEntry[] {
  const entries = Object.keys(a.points).map((guest) => ({ guest, points: a.points[guest]!, lots: a.won[guest]! }));
  entries.sort((x, y) => y.points - x.points || y.lots - x.lots || a.drawKeys[x.guest]! - a.drawKeys[y.guest]!);
  return entries.map((e, i) => {
    const tiedWith = (o?: typeof e) => !!o && o.points === e.points && o.lots === e.lots;
    return { guest: e.guest, points: e.points, time: 0, lots: e.lots, drawn: tiedWith(entries[i - 1]) || tiedWith(entries[i + 1]) };
  });
}

/** Everything one guest may see of the step; others' bids only once the lot is revealed. */
export function auctionView(a: AuctionState, guest: GuestId): AuctionView {
  const revealed = a.stage === "reveal";
  return {
    index: a.step,
    total: a.lots.length,
    stage: a.stage,
    startedAt: a.stepStartedAt,
    bidDeadline: a.bidDeadline,
    deadline: a.deadline,
    lot: a.lots[a.step]!,
    points: a.points[guest]!,
    yourBid: a.bids[guest]?.amount ?? null,
    reveal: revealed ? { bids: byStanding(a).map(([g, b]) => ({ guest: g, amount: b.amount })), winner: a.sale?.winner ?? null, price: a.sale?.price ?? 0 } : null,
  };
}
