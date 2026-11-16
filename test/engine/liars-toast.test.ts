import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LIARS_TOAST } from "../../src/content/liars-toast";
import { LIBRARY } from "../../src/content/library";
import { apply, viewFor } from "../../src/engine/game";
import { dealCards, rankBluff, startBluff } from "../../src/engine/bluff";
import type { BluffState, BluffView, GameState } from "../../src/shared/types";
import { mixedPlayer, must, playMatch, started, tickToDeadline } from "./sim";

/** A Dance of Liar's Toast for `n` guests (g0, g1, ...) at its first step, with the first step's cards set to `cards`. */
function toastOf(n = 4, seed = 9, cards?: number[]): GameState {
  const game = started(Math.max(n, 4), seed);
  const guests = game.guests.slice(0, n).map((g) => g.id);
  const [bluff] = startBluff(seed, LIARS_TOAST, guests, 1000);
  if (cards) guests.forEach((g, i) => (bluff.cards[0]![g] = cards[i]!));
  return { ...game, guests: game.guests.filter((g) => guests.includes(g.id)), phase: "dance", danceDef: LIARS_TOAST, bluff, auction: null, match: null, deadline: bluff.deadline };
}
const toastView = (s: GameState, id: string) => (viewFor(s, id) as { bluff: BluffView }).bluff;
const ranking = (s: GameState) => (viewFor(s, "g0") as { ranking: { guest: string; points: number; calls?: number }[] }).ranking;
const pointsOf = (s: GameState, id: string) => ranking(s).find((r) => r.guest === id)!.points;
const claim = (s: GameState, guest: string, value: number, at = 2000) => must(s, { type: "claim", guest, value }, at);
const call = (s: GameState, guest: string, target: string | null, at = 3000) => must(s, { type: "call", guest, target }, at);

describe("Liar's Toast", () => {
  it("is a Dance-only Bluff match for 3-10 guests, in the library", () => {
    expect(LIBRARY).toContain(LIARS_TOAST);
    expect(LIARS_TOAST).toMatchObject({ type: "bluff", buyRate: 3, preludeSeconds: 70, stepSeconds: 35, answerSeconds: 15 });
    expect(LIARS_TOAST.steps.dance).toBe(6);
    expect(LIARS_TOAST.guestRange).toEqual({ dance: [3, 10], cellar: null });
  });

  it("deals every guest an independent card from 1 to 9 at each of 6 steps, the same for the same seed", () => {
    const [cards] = dealCards(5, LIARS_TOAST, ["a", "b", "c"], 6);
    expect(cards).toHaveLength(6);
    for (const row of cards) for (const c of Object.values(row)) expect(c).toBeGreaterThanOrEqual(1), expect(c).toBeLessThanOrEqual(9);
    expect(dealCards(5, LIARS_TOAST, ["a", "b", "c"], 6)[0]).toEqual(cards);
    expect(dealCards(6, LIARS_TOAST, ["a", "b", "c"], 6)[0]).not.toEqual(cards);
  });

  it("opens with a 15s claim phase where you see your own card only", () => {
    const s = toastOf(4, 9, [4, 7, 2, 9]);
    expect(toastView(s, "g0")).toMatchObject({ stage: "claim", yourCard: 4, yourClaim: null, claims: null, claimDeadline: 16_000, reveal: null });
    expect(toastView(s, "g1").yourCard).toBe(7);
  });

  it("takes one whole claim from 1 to 9 per guest and rejects the rest", () => {
    const s = toastOf();
    for (const bad of [0, 10, 1.5, NaN]) expect(apply(s, { type: "claim", guest: "g0", value: bad }, 2000)).toEqual({ ok: false, reason: "claims are whole values from 1 to the top card" });
    expect(apply(s, { type: "claim", guest: "g0", value: 5 }, 16_000)).toEqual({ ok: false, reason: "too late" });
    const once = claim(s, "g0", 5);
    expect(apply(once, { type: "claim", guest: "g0", value: 6 }, 2500)).toEqual({ ok: false, reason: "already claimed" });
    expect(toastView(once, "g0").yourClaim).toBe(5);
    expect(apply(s, { type: "call", guest: "g0", target: "g1" }, 2000)).toEqual({ ok: false, reason: "wait for the call phase" });
  });

  it("shows everyone's claims once the claim phase closes, and not before", () => {
    let s = claim(claim(toastOf(4, 9, [4, 7, 2, 9]), "g0", 8), "g1", 6);
    expect(toastView(s, "g2").claims).toBeNull();
    expect(JSON.stringify(viewFor(s, "g2"))).not.toContain('"g0":8');
    s = tickToDeadline(s);
    expect(toastView(s, "g2")).toMatchObject({ stage: "call", claims: { g0: 8, g1: 6 }, callDeadline: 31_000 });
  });

  it("opens the call phase early when every guest has claimed", () => {
    let s = toastOf(3, 9, [1, 2, 3]);
    for (const g of ["g0", "g1", "g2"]) s = claim(s, g, 5);
    expect(toastView(s, "g0")).toMatchObject({ stage: "call", callDeadline: 17_000 });
  });

  it("takes one call on another guest, or on no one, and rejects the rest", () => {
    let s = tickToDeadline(claim(toastOf(), "g0", 5));
    expect(apply(s, { type: "call", guest: "g0", target: "g0" }, 20_000)).toEqual({ ok: false, reason: "you can't call yourself" });
    expect(apply(s, { type: "call", guest: "g0", target: "nobody" }, 20_000)).toEqual({ ok: false, reason: "no such guest" });
    expect(apply(s, { type: "call", guest: "g0", target: "g1" }, 31_000)).toEqual({ ok: false, reason: "too late" });
    expect(apply(s, { type: "claim", guest: "g1", value: 3 }, 20_000)).toEqual({ ok: false, reason: "too late" });
    s = call(s, "g0", "g1", 20_000);
    expect(apply(s, { type: "call", guest: "g0", target: null }, 20_500)).toEqual({ ok: false, reason: "already called" });
    expect(toastView(s, "g0")).toMatchObject({ called: true, yourCall: "g1" });
    expect(toastView(call(tickToDeadline(claim(toastOf(), "g0", 5)), "g0", null, 20_000), "g0")).toMatchObject({ called: true, yourCall: null });
  });

  it("rejects a call on a name that is no guest, including inherited object keys", () => {
    const s = tickToDeadline(claim(toastOf(), "g0", 5));
    for (const target of ["constructor", "__proto__", "toString"]) expect(apply(s, { type: "call", guest: "g0", target }, 20_000)).toEqual({ ok: false, reason: "no such guest" });
  });

  it("plays the worked example: Ana 0, Ben 8 + 11, Cy 3, and Cy's card stays hidden", () => {
    let s = toastOf(3, 9, [4, 7, 2]);
    s = claim(claim(claim(s, "g0", 8), "g1", 6), "g2", 3);
    s = call(call(call(s, "g0", null), "g1", "g0"), "g2", "g1");
    const v = toastView(s, "g2");
    expect(v.stage).toBe("reveal");
    expect(v.reveal).toEqual({ calls: [{ caller: "g1", target: "g0" }, { caller: "g2", target: "g1" }], cards: { g0: 4, g1: 7 } });
    expect(pointsOf(s, "g0")).toBe(0);
    expect(pointsOf(s, "g1")).toBe(19);
    expect(pointsOf(s, "g2")).toBe(3);
    expect(JSON.stringify(viewFor(s, "g1"))).not.toContain('"g2":2');
  });

  it("scores an uncalled guest their claim, an honest called guest the claim + 5 per caller, and each caller of a liar the claim", () => {
    // g0 holds 9 claims 5 (honest, called by g1 and g2); g3 holds 1 claims 9 (lying, called by g0 only); g1 and g2 uncalled.
    let s = toastOf(4, 9, [9, 3, 3, 1]);
    s = claim(claim(claim(claim(s, "g0", 5), "g1", 3), "g2", 2), "g3", 9);
    s = call(call(call(call(s, "g0", "g3"), "g1", "g0"), "g2", "g0"), "g3", null);
    expect(pointsOf(s, "g0")).toBe(5 + 10 + 9);
    expect(pointsOf(s, "g1")).toBe(3);
    expect(pointsOf(s, "g2")).toBe(2);
    expect(pointsOf(s, "g3")).toBe(0);
  });

  it("counts a card equal to the claim as honest", () => {
    let s = toastOf(3, 9, [5, 5, 5]);
    s = claim(claim(claim(s, "g0", 5), "g1", 1), "g2", 1);
    s = call(call(call(s, "g1", "g0"), "g0", null), "g2", null);
    expect(pointsOf(s, "g0")).toBe(10);
  });

  it("scores a guest who doesn't claim 0, and a caller of them nothing", () => {
    let s = toastOf(3, 9, [9, 1, 1]);
    s = tickToDeadline(claim(claim(s, "g1", 4), "g2", 4));
    expect(toastView(s, "g1").claims).toEqual({ g1: 4, g2: 4 });
    s = call(call(s, "g1", "g0"), "g2", null);
    s = tickToDeadline(s);
    expect(pointsOf(s, "g0")).toBe(0);
    expect(pointsOf(s, "g1")).toBe(4);
    expect(pointsOf(s, "g2")).toBe(4);
  });

  it("treats a guest who doesn't call as calling no one when the clock runs out", () => {
    let s = toastOf(3, 9, [1, 1, 1]);
    s = claim(claim(claim(s, "g0", 7), "g1", 2), "g2", 2);
    s = tickToDeadline(call(s, "g1", "g0"));
    expect(s.bluff!.stage).toBe("reveal");
    expect(pointsOf(s, "g0")).toBe(0);
    expect(pointsOf(s, "g1")).toBe(2 + 7);
    expect(pointsOf(s, "g2")).toBe(2);
  });

  it("reveals only the called cards, every call by name, and moves on to the next step", () => {
    let s = toastOf(4, 9, [4, 7, 2, 9]);
    s = claim(claim(claim(claim(s, "g0", 8), "g1", 6), "g2", 3), "g3", 9);
    s = call(call(call(s, "g0", "g1"), "g1", "g0"), "g2", "g1");
    expect(toastView(s, "g3").reveal).toBeNull();
    s = call(s, "g3", null);
    for (const id of ["g0", "g1", "g2", "g3"]) expect(toastView(s, id).reveal!.cards).toEqual({ g0: 4, g1: 7 });
    s = tickToDeadline(s);
    expect(toastView(s, "g0")).toMatchObject({ index: 1, stage: "claim", yourClaim: null, reveal: null, claims: null });
  });

  it("never lets another guest's card or call change a guest's view before it is revealed", () => {
    const base = toastOf(5, 3);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 }), (x, y, a, b) => {
        fc.pre(a !== b);
        const withCard = (card: number): GameState => ({ ...base, bluff: { ...base.bluff!, cards: base.bluff!.cards.map((row, i) => (i === 0 ? { ...row, [`g${b}`]: card } : row)) } });
        expect(viewFor(withCard(x), `g${a}`)).toEqual(viewFor(withCard(y), `g${a}`));
      }),
    );
  });

  it("hides calls until the reveal", () => {
    const base = tickToDeadline(claim(toastOf(4, 3), "g1", 5));
    const withCall = (target: string | null): GameState => ({ ...base, bluff: { ...base.bluff!, calls: { g1: target } } });
    expect(viewFor(withCall("g2"), "g0")).toEqual(viewFor(withCall(null), "g0"));
    expect(viewFor(withCall("g2"), "g3")).toEqual(viewFor(withCall("g0"), "g3"));
  });

  it("lets bought points raise the score: 1 favour is 3 points", () => {
    let s = toastOf();
    s = must(s, { type: "buyPoints", guest: "g0", favours: 2 }, 1500);
    expect(s.guests.find((g) => g.id === "g0")!.favours).toBe(8);
    expect(pointsOf(s, "g0")).toBe(6);
  });

  it("rejects a bid in a Bluff Dance", () => {
    expect(apply(toastOf(), { type: "bid", guest: "g0", amount: 1 }, 2000)).toEqual({ ok: false, reason: "no auction is running" });
  });

  it("breaks ties on points by more correct calls, then the draw, and ranks strictly", () => {
    const b: BluffState = toastOf(4).bluff!;
    b.points = { g0: 10, g1: 10, g2: 10, g3: 10 };
    b.caught = { g0: 1, g1: 2, g2: 2, g3: 0 };
    b.drawKeys = { g0: 0.5, g1: 0.9, g2: 0.1, g3: 0.3 };
    const r = rankBluff(b);
    expect(r.map((e) => e.guest)).toEqual(["g2", "g1", "g0", "g3"]);
    expect(r.map((e) => e.drawn)).toEqual([true, true, false, false]);
  });

  it("plays six steps to a strict ranking and leaves the Dance behind", () => {
    for (const n of [3, 4, 7, 10]) {
      const s = playMatch(toastOf(n, 20 + n), mixedPlayer);
      expect(s.phase).toBe("sentDown");
      expect(s.bluff).toBeNull();
      expect(new Set(s.danceResult!.ranking.map((r) => r.guest)).size).toBe(n);
    }
  });
});
