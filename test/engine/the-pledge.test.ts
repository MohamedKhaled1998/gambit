import { describe, expect, it } from "vitest";
import { THE_PLEDGE } from "../../src/content/the-pledge";
import { LIBRARY } from "../../src/content/library";
import { apply, viewFor } from "../../src/engine/game";
import { drawMatch } from "../../src/engine/draw-match";
import { startPledge } from "../../src/engine/pledge";
import type { GameState, PledgeView, ReckoningChoice } from "../../src/shared/types";
import { mixedPlayer, must, playGame, started, tickToDeadline } from "./sim";

/** A Dance of The Pledge for n guests (3-10), at its first pledge step. */
function pledgeOf(n = 6, seed = 9): GameState {
  const game = started(Math.max(n, 4), seed);
  const guests = game.guests.slice(0, n);
  const [pledge] = startPledge(seed, THE_PLEDGE, guests.map((g) => g.id), 1000);
  return { ...game, guests, phase: "dance", danceDef: THE_PLEDGE, pledge, auction: null, match: null, deadline: pledge.deadline };
}
const stepOf = (s: GameState, id: string) => (viewFor(s, id) as { pledge: PledgeView }).pledge;
const ids = (s: GameState) => s.guests.map((g) => g.id);
const pledge = (s: GameState, guest: string, amount: number, at = 2000) => must(s, { type: "pledge", guest, amount }, at);
const reckon = (s: GameState, guest: string, choice: ReckoningChoice, at = 2000) => must(s, { type: "reckon", guest, choice }, at);
/** Everyone pledges `amounts[guest]` (default 0), then the step's reveal and the next step open. */
function pledgeStep(s: GameState, amounts: number[]): GameState {
  ids(s).forEach((id, i) => (s = pledge(s, id, amounts[i] ?? 0, s.pledge!.stepStartedAt + 1000)));
  return tickToDeadline(s);
}
/** Plays the five pledge steps so the guests are at the reckoning. */
function toReckoning(s: GameState, perStep: number[][]): GameState {
  for (const amounts of perStep) s = pledgeStep(s, amounts);
  return s;
}
const totalPot = (s: GameState) => stepOf(s, "g0").pot;
const same = (n: number, v: number) => Array.from({ length: n }, () => v);

describe("The Pledge", () => {
  it("is a Dance-only Group target match for 3-10 guests, drawn at most once a game", () => {
    expect(LIBRARY).toContain(THE_PLEDGE);
    expect(THE_PLEDGE).toMatchObject({ type: "groupTarget", buyRate: 5, preludeSeconds: 60, oncePerGame: true, pledgeSteps: 5 });
    expect(THE_PLEDGE.guestRange).toEqual({ dance: [3, 10], cellar: null });
  });

  it("hands every guest 10 points a step and sets the target at 30 a guest", () => {
    for (const n of [3, 6, 10]) {
      const s = pledgeOf(n);
      for (const id of ids(s)) expect(stepOf(s, id)).toMatchObject({ stage: "pledge", stock: 10, kept: 0, yourPledge: null, pot: 0, target: 30 * n, index: 0, total: 6, actDeadline: 21_000 });
    }
  });

  it("takes whole-point pledges from 0 to the stock, once, and in time", () => {
    const s = pledgeOf();
    const reject = (amount: number) => apply(s, { type: "pledge", guest: "g0", amount }, 2000);
    for (const bad of [-1, 11, 2.5, NaN]) expect(reject(bad)).toEqual({ ok: false, reason: "pledges are whole points up to your stock" });
    expect(reject(0).ok && reject(10).ok).toBe(true);
    expect(apply(s, { type: "pledge", guest: "g0", amount: 3 }, 21_000)).toEqual({ ok: false, reason: "too late" });
    const once = pledge(s, "g0", 4);
    expect(apply(once, { type: "pledge", guest: "g0", amount: 5 }, 2500)).toEqual({ ok: false, reason: "already pledged" });
    expect(stepOf(once, "g0").yourPledge).toBe(4);
    expect(apply(s, { type: "reckon", guest: "g0", choice: "share" }, 2000)).toEqual({ ok: false, reason: "wait for the reckoning" });
  });

  it("shows only the pot total after each step, and keeps pledges, kept points and ranks out of every view until the final reveal", () => {
    let s = pledgeOf(4);
    s = pledge(pledge(s, "g0", 9), "g1", 7);
    expect(stepOf(s, "g2").pot).toBe(0);
    s = pledge(pledge(s, "g2", 1), "g3", 0);
    expect(stepOf(s, "g2")).toMatchObject({ stage: "reveal", pot: 17, kept: 9, final: null });
    expect(stepOf(s, "g1").kept).toBe(3);
    for (const id of ids(s)) {
      const v = viewFor(s, id) as { ranking: unknown[] };
      expect(v.ranking).toEqual([]);
      expect(JSON.stringify(v)).not.toContain('"amounts"');
    }
    s = tickToDeadline(s);
    expect(stepOf(s, "g0")).toMatchObject({ index: 1, stage: "pledge", pot: 17, yourPledge: null, stock: 10 });
  });

  it("closes a step when the clock runs out: a guest who doesn't pledge pledges nothing and keeps the 10", () => {
    let s = pledgeOf(4);
    s = tickToDeadline(pledge(s, "g1", 10));
    expect(stepOf(s, "g0")).toMatchObject({ stage: "reveal", pot: 10, kept: 10 });
    expect(stepOf(s, "g1").kept).toBe(0);
  });

  it("opens the reckoning after five steps, 20s, and a guest who doesn't choose shares", () => {
    let s = toReckoning(pledgeOf(4), same(5, 0).map(() => [5, 5, 5, 5]));
    expect(stepOf(s, "g0")).toMatchObject({ index: 5, stage: "reckon", pot: 100, yourChoice: null });
    expect(stepOf(s, "g0").actDeadline - stepOf(s, "g0").startedAt).toBe(20_000);
    s = reckon(s, "g1", "pocket");
    expect(stepOf(s, "g1").yourChoice).toBe("pocket");
    expect(stepOf(s, "g2").yourChoice).toBeNull();
    expect(apply(s, { type: "reckon", guest: "g1", choice: "share" }, 2500)).toEqual({ ok: false, reason: "already chose" });
    expect(apply(s, { type: "reckon", guest: "g2", choice: "nope" as ReckoningChoice }, 2500)).toEqual({ ok: false, reason: "no such choice" });
    expect(apply(s, { type: "pledge", guest: "g2", amount: 1 }, 2500).ok).toBe(false);
    s = tickToDeadline(s);
    const v = stepOf(s, "g3");
    expect(v.stage).toBe("final");
    expect(v.deadline - s.pledge!.stepStartedAt).toBe(30_000);
    expect(v.final!.choices).toEqual({ g0: "share", g1: "pocket", g2: "share", g3: "share" });
  });

  it("plays the worked example: six guests, target 180, pot 186, Dee pockets alone", () => {
    // Dee (g3) pledges nothing; the other five pledge 7 a step for four steps, then 9, 9, 9, 9, 10.
    const others = (v: number[]) => [v[0]!, v[1]!, v[2]!, 0, v[3]!, v[4]!];
    let s = toReckoning(pledgeOf(6), [...same(4, 0).map(() => others([7, 7, 7, 7, 7])), others([9, 9, 9, 9, 10])]);
    expect(totalPot(s)).toBe(186);
    expect(stepOf(s, "g0").target).toBe(180);
    for (const id of ids(s)) s = reckon(s, id, id === "g3" ? "pocket" : "share");
    const v = stepOf(s, "g0");
    expect(v.stage).toBe("final");
    expect(v.final!.award).toEqual({ g0: 0, g1: 0, g2: 0, g3: 3, g4: 0, g5: 0 });
    const ranking = (viewFor(s, "g0") as { ranking: { guest: string; points: number }[] }).ranking;
    expect(ranking[0]).toMatchObject({ guest: "g3", points: 50 });
    s = tickToDeadline(s);
    expect(s.phase).toBe("sentDown");
    expect(s.danceResult!.payout).toEqual({ g0: 0, g1: 0, g2: 0, g3: 3, g4: 0, g5: 0 });
    expect(s.guests.find((g) => g.id === "g3")!.favours).toBe(13);
    expect(s.guests.find((g) => g.id === "g0")!.favours).toBe(10);
  });

  const award = (pot: number, choices: ReckoningChoice[]): Record<string, number> => {
    // Four guests, target 120. The pot of `pot` comes from guest g0 and g1 pledging in the last step as needed.
    let s = pledgeOf(4);
    let left = pot;
    for (let step = 0; step < 5; step++) {
      const amounts = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) { amounts[i] = Math.min(10, left); left -= amounts[i]!; }
      s = pledgeStep(s, amounts);
    }
    expect(totalPot(s)).toBe(pot);
    ids(s).forEach((id, i) => (s = reckon(s, id, choices[i]!)));
    return stepOf(s, "g0").final!.award;
  };

  it("awards everyone +2 when the pot reached the target and nobody pockets", () => {
    expect(award(120, ["share", "share", "share", "share"])).toEqual({ g0: 2, g1: 2, g2: 2, g3: 2 });
    expect(award(121, ["share", "share", "share", "share"])).toEqual({ g0: 2, g1: 2, g2: 2, g3: 2 });
  });
  it("awards a lone pocket +3 and nobody else anything", () => {
    expect(award(120, ["share", "pocket", "share", "share"])).toEqual({ g0: 0, g1: 3, g2: 0, g3: 0 });
  });
  it("awards nothing when two or more pocket", () => {
    expect(award(150, ["pocket", "pocket", "share", "share"])).toEqual({ g0: 0, g1: 0, g2: 0, g3: 0 });
    expect(award(150, ["pocket", "pocket", "pocket", "pocket"])).toEqual({ g0: 0, g1: 0, g2: 0, g3: 0 });
  });
  it("awards nothing when the pot missed the target, whatever the choices", () => {
    expect(award(119, ["share", "share", "share", "share"])).toEqual({ g0: 0, g1: 0, g2: 0, g3: 0 });
    expect(award(0, ["share", "pocket", "share", "share"])).toEqual({ g0: 0, g1: 0, g2: 0, g3: 0 });
  });

  it("lets bought points be pledged: 1 favour is 5 points", () => {
    let s = pledgeOf(4);
    s = must(s, { type: "buyPoints", guest: "g0", favours: 2 }, 1500);
    expect(s.guests[0]!.favours).toBe(8);
    expect(stepOf(s, "g0").stock).toBe(20);
    expect(stepOf(s, "g1").stock).toBe(10);
    expect(apply(s, { type: "pledge", guest: "g0", amount: 21 }, 2000).ok).toBe(false);
    s = pledge(s, "g0", 18);
    s = tickToDeadline(s);
    expect(stepOf(s, "g0")).toMatchObject({ pot: 18, kept: 2 });
    // Points bought after the step's reveal are kept, and the next step hands a fresh 10, not a bigger stock.
    s = must(s, { type: "buyPoints", guest: "g0", favours: 1 }, s.deadline! - 6000);
    expect(stepOf(s, "g0").kept).toBe(7);
    s = tickToDeadline(s);
    expect(stepOf(s, "g0")).toMatchObject({ stock: 10, kept: 7 });
  });

  it("ranks by kept points, then the draw, always strictly, and still breaks ties in favours when guests are sent down", () => {
    // g0 pledges everything every step, g1..g3 nothing: the lowest kept points is g0; nobody earns an award.
    let s = toReckoning(pledgeOf(4), same(5, 0).map(() => [10, 0, 0, 0]));
    for (const id of ids(s)) s = reckon(s, id, "share");
    const ranking = (viewFor(s, "g0") as { ranking: { guest: string; points: number; drawn: boolean }[] }).ranking;
    expect(ranking.map((r) => r.points)).toEqual([50, 50, 50, 0]);
    expect(ranking[3]!.guest).toBe("g0");
    expect(new Set(ranking.map((r) => r.guest)).size).toBe(4);
    expect(ranking.slice(0, 3).every((r) => r.drawn)).toBe(true);
    s = tickToDeadline(s);
    expect(s.phase).toBe("sentDown");
    // The pot (50) missed 120: favours are all equal, so the lowest kept points goes down first.
    expect(s.cellar!.guests).toContain("g0");
    for (const g of s.guests) expect(g.favours).toBe(10);
  });

  it("never draws The Pledge twice in a game", () => {
    for (let seed = 0; seed < 60; seed++) {
      const history = [{ round: 1, role: "dance" as const, id: THE_PLEDGE.id }];
      for (let round = 2; round <= 7; round++) {
        for (let count = 3; count <= 10; count++) {
          const d = drawMatch({ library: LIBRARY, role: "dance", count, round, history, seed });
          expect(d?.match.id).not.toBe(THE_PLEDGE.id);
        }
      }
    }
    for (let seed = 1; seed <= 25; seed++) {
      const done = playGame(started(10, seed), mixedPlayer);
      expect(done.drawn.filter((d) => d.id === THE_PLEDGE.id).length).toBeLessThanOrEqual(1);
    }
  });

  it("is drawn as a Dance and played to the Sent down screen with simulated guests", () => {
    let played = 0;
    for (let seed = 1; seed <= 40 && played < 3; seed++) {
      const done = playGame(started(8, seed), mixedPlayer);
      if (done.drawn.some((d) => d.id === THE_PLEDGE.id)) played++;
    }
    expect(played).toBeGreaterThan(0);
  });
});
