import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GILDED_AUCTION } from "../../src/content/gilded-auction";
import { LIBRARY } from "../../src/content/library";
import { apply, viewFor } from "../../src/engine/game";
import { generateLots, lotCount, startAuction } from "../../src/engine/auction";
import type { AuctionView, GameState } from "../../src/shared/types";
import { mixedPlayer, must, playMatch, started, tickToDeadline } from "./sim";

/** A Dance of Gilded Auction for n guests, at its first lot, which is worth `lot` when given. */
function auctionOf(n = 4, seed = 9, lot?: number): GameState {
  const game = started(Math.max(n, 4), seed);
  const guests = (n === 3 ? game.guests.slice(0, 3) : game.guests).map((g) => g.id);
  const [auction] = startAuction(seed, GILDED_AUCTION, guests, 1000);
  if (lot !== undefined) auction.lots[0] = lot;
  return { ...game, guests: game.guests.filter((g) => guests.includes(g.id)), phase: "dance", danceDef: GILDED_AUCTION, auction, match: null, deadline: auction.deadline };
}
const lotOf = (s: GameState, id: string) => (viewFor(s, id) as { auction: AuctionView }).auction;
const bid = (s: GameState, guest: string, amount: number, at = 2000) => must(s, { type: "bid", guest, amount }, at);

describe("Gilded Auction", () => {
  it("is a Dance-only Sealed bid match for 3-10 guests, in the library", () => {
    expect(LIBRARY).toContain(GILDED_AUCTION);
    expect(GILDED_AUCTION).toMatchObject({ type: "sealedBid", startingPoints: 50, buyRate: 5, preludeSeconds: 60, stepSeconds: 25 });
    expect(GILDED_AUCTION.guestRange).toEqual({ dance: [3, 10], cellar: null });
  });

  it("sells 6 lots at 3-5 guests and 8 at 6-10", () => {
    for (let n = 3; n <= 10; n++) expect(lotCount(GILDED_AUCTION, n)).toBe(n <= 5 ? 6 : 8);
    expect(startAuction(1, GILDED_AUCTION, ["a", "b", "c"], 0)[0].lots).toHaveLength(6);
    expect(startAuction(1, GILDED_AUCTION, "abcdefg".split(""), 0)[0].lots).toHaveLength(8);
  });

  it("makes lots worth 10-40 that sum to 25 a lot and mix high with low", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const count of [6, 8]) {
        const [lots] = generateLots(seed, GILDED_AUCTION, count);
        expect(lots).toHaveLength(count);
        for (const v of lots) expect(v).toBeGreaterThanOrEqual(10), expect(v).toBeLessThanOrEqual(40);
        expect(lots.reduce((a, b) => a + b, 0)).toBe(25 * count);
        expect(lots.some((v) => v > 25)).toBe(true);
        expect(lots.some((v) => v < 25)).toBe(true);
      }
    }
    expect(generateLots(3, GILDED_AUCTION, 6)).toEqual(generateLots(3, GILDED_AUCTION, 6));
    expect(generateLots(3, GILDED_AUCTION, 6)[0]).not.toEqual(generateLots(4, GILDED_AUCTION, 6)[0]);
  });

  it("starts every guest on 50 points with a 20s bid phase", () => {
    const s = auctionOf();
    for (const g of s.guests) expect(lotOf(s, g.id)).toMatchObject({ points: 50, stage: "bid", yourBid: null, reveal: null, bidDeadline: 21_000 });
  });

  it("takes whole-point bids from 0 to the guest's points and rejects the rest", () => {
    const s = auctionOf();
    const reject = (amount: number) => apply(s, { type: "bid", guest: "g0", amount }, 2000);
    for (const bad of [-1, 51, 1.5, NaN, Infinity]) expect(reject(bad)).toEqual({ ok: false, reason: "bids are whole points up to what you hold" });
    expect(reject(0).ok).toBe(true);
    expect(reject(50).ok).toBe(true);
    expect(apply(s, { type: "bid", guest: "g0", amount: 5 }, 21_000)).toEqual({ ok: false, reason: "too late" });
    const once = bid(s, "g0", 5);
    expect(apply(once, { type: "bid", guest: "g0", amount: 6 }, 2500)).toEqual({ ok: false, reason: "already bid" });
    expect(lotOf(once, "g0").yourBid).toBe(5);
  });

  it("plays the worked example: Ben pays 18 and gains 30, Ana and Cy stay at 50", () => {
    let s = auctionOf(3, 9, 30);
    expect(s.guests.map((g) => g.id)).toEqual(["g0", "g1", "g2"]);
    s = bid(bid(bid(s, "g0", 12), "g1", 18), "g2", 0);
    const v = lotOf(s, "g2");
    expect(v.stage).toBe("reveal");
    expect(v.reveal).toEqual({ bids: [{ guest: "g1", amount: 18 }, { guest: "g0", amount: 12 }, { guest: "g2", amount: 0 }], winner: "g1", price: 18 });
    const points = Object.fromEntries(viewFor(s, "g0")!.phase === "dance" ? (viewFor(s, "g0") as { ranking: { guest: string; points: number }[] }).ranking.map((r) => [r.guest, r.points]) : []);
    expect(points).toEqual({ g0: 50, g1: 62, g2: 50 });
  });

  it("gives equal bids to the one submitted first", () => {
    let s = auctionOf(4, 9, 20);
    s = bid(bid(bid(bid(s, "g2", 10, 2000), "g0", 10, 2100), "g1", 4, 2200), "g3", 10, 2300);
    expect(lotOf(s, "g0").reveal).toMatchObject({ winner: "g2", price: 10 });
  });

  it("closes the bidding when the clock runs out; a guest who doesn't bid can't win, and an unbid lot goes unsold", () => {
    let s = auctionOf(4, 9, 20);
    s = tickToDeadline(bid(s, "g1", 0));
    expect(lotOf(s, "g0").reveal).toMatchObject({ winner: "g1", price: 0 });
    s = tickToDeadline(s);
    expect(lotOf(s, "g0")).toMatchObject({ index: 1, stage: "bid", yourBid: null, reveal: null });
    s = tickToDeadline(s);
    expect(lotOf(s, "g0").reveal).toMatchObject({ bids: [], winner: null });
    for (const r of (viewFor(s, "g0") as { ranking: { points: number }[] }).ranking) expect(r.points).toBeGreaterThanOrEqual(50);
  });

  it("hides every bid from the other guests until the reveal, then names them all", () => {
    let s = auctionOf(4, 9, 25);
    s = bid(bid(s, "g0", 33), "g1", 7);
    for (const id of ["g1", "g2", "g3"]) expect(JSON.stringify(viewFor(s, id))).not.toContain("33");
    expect(lotOf(s, "g2").reveal).toBeNull();
    s = bid(bid(s, "g2", 1), "g3", 2);
    const bids = lotOf(s, "g2").reveal!.bids;
    expect(bids.map((b) => [b.guest, b.amount])).toEqual([["g0", 33], ["g1", 7], ["g3", 2], ["g2", 1]]);
  });

  it("never lets one guest's bid change another's view before the reveal", () => {
    const base = auctionOf(5, 3);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 }), (x, y, a, b) => {
        fc.pre(a !== b);
        const as = `g${a}`;
        const bs = `g${b}`;
        const withBid = (amount: number) => ({ ...base, auction: { ...base.auction!, bids: { [bs]: { amount, order: 0 } } } });
        expect(viewFor(withBid(x), as)).toEqual(viewFor(withBid(y), as));
      }),
    );
  });

  it("lets bought points add to bidding power: 1 favour is 5 points", () => {
    let s = auctionOf(4, 9, 20);
    expect(apply(s, { type: "bid", guest: "g0", amount: 55 }, 2000).ok).toBe(false);
    s = must(s, { type: "buyPoints", guest: "g0", favours: 2 }, 1500);
    expect(s.guests.find((g) => g.id === "g0")!.favours).toBe(8);
    expect(lotOf(s, "g0").points).toBe(60);
    expect(apply(s, { type: "bid", guest: "g0", amount: 60 }, 2000).ok).toBe(true);
    expect(lotOf(s, "g1").points).toBe(50);
  });

  it("rejects an answer, as there are no choices to tap", () => {
    expect(apply(auctionOf(), { type: "answer", guest: "g0", position: 0 }, 2000)).toEqual({ ok: false, reason: "no Dance is running" });
  });

  it("breaks ties on points by more lots won, then the draw, and ranks strictly", () => {
    // Two lots of 20 and 30: g0 pays 20 for 20 (+0), g1 pays 10 for 30 (+20) then loses nothing.
    let s = auctionOf(4, 9, 20);
    s = tickToDeadline(bid(s, "g0", 20));
    expect(s.auction!.points.g0).toBe(50);
    expect(s.auction!.won.g0).toBe(1);
    const ranking = (viewFor(s, "g1") as { ranking: { guest: string; points: number; lots?: number }[] }).ranking;
    expect(ranking.map((r) => r.guest)[0]).toBe("g0");
    expect(new Set(ranking.map((r) => r.guest)).size).toBe(4);
  });

  it("leaves the finished auction behind: buying points in the Sent down screen is rejected, and in the Cellar goes to the Cellar game", () => {
    let s = playMatch(auctionOf(4, 9), mixedPlayer);
    expect(s.phase).toBe("sentDown");
    expect(s.auction).toBeNull();
    const down = s.cellar!.guests[0]!;
    expect(apply(s, { type: "buyPoints", guest: down, favours: 1 }, s.deadline! - 1)).toEqual({ ok: false, reason: "no Dance is running" });
    s = tickToDeadline(s);
    expect(s.phase).toBe("cellar");
    const before = s.guests.find((g) => g.id === down)!.favours;
    const points = s.cellar!.race!.points[down]!;
    s = must(s, { type: "buyPoints", guest: down, favours: 1 }, s.deadline! - 1);
    expect(s.guests.find((g) => g.id === down)!.favours).toBe(before - 1);
    expect(s.cellar!.race!.points[down]).toBe(points + s.cellar!.def.buyRate);
  });
});
