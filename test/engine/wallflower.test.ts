import { describe, expect, it } from "vitest";
import { WALLFLOWER } from "../../src/content/wallflower";
import { LIBRARY } from "../../src/content/library";
import { apply, viewFor } from "../../src/engine/game";
import { drawMatch } from "../../src/engine/draw-match";
import { rankPick, startPick } from "../../src/engine/pick";
import type { GameState, PickState, PickView } from "../../src/shared/types";
import { must, started, tickToDeadline } from "./sim";

/** A Dance of Wallflower for n guests (3-10), at its first step. */
function danceOf(n = 5, seed = 9): GameState {
  const game = started(Math.max(n, 4), seed);
  const guests = game.guests.slice(0, n);
  const [pick] = startPick(seed, WALLFLOWER, guests.map((g) => g.id), 1000, WALLFLOWER.steps.dance!);
  return { ...game, guests, phase: "dance", danceDef: WALLFLOWER, pick, auction: null, pledge: null, match: null, deadline: pick.deadline };
}
/** A Cellar game of Wallflower for the first n guests. */
function cellarOf(n: number, seed = 9): GameState {
  const game = started(Math.max(n + 1, 4), seed);
  const down = game.guests.slice(0, n).map((g) => g.id);
  const [pick] = startPick(seed, WALLFLOWER, down, 1000, WALLFLOWER.steps.cellar!);
  return { ...game, phase: "cellar", deadline: pick.deadline, cellar: { def: WALLFLOWER, encore: false, guests: down, unmaskings: 1, race: null, pick, ranking: null, unmasked: [] } };
}
const pickOf = (s: GameState, id: string) => (viewFor(s, id) as { pick: PickView }).pick;
const pickNo = (s: GameState, guest: string, number: number, at = 2000) => must(s, { type: "pick", guest, number }, at);
const ranking = (s: GameState) => (viewFor(s, "g0") as { ranking: { guest: string; points: number }[] }).ranking;

describe("Wallflower", () => {
  it("is in the library as a Dance for 3-10 and a Cellar game for 3-9, never 2", () => {
    expect(LIBRARY).toContain(WALLFLOWER);
    expect(WALLFLOWER).toMatchObject({ type: "uniquePick", buyRate: 3, preludeSeconds: 50, steps: { dance: 10, cellar: 7 } });
    expect(WALLFLOWER.guestRange).toEqual({ dance: [3, 10], cellar: [3, 9] });
  });

  it("plays the worked example: sixes clash, Cy 5 + 5, Dee 2, Eve 1", () => {
    let s = danceOf(5);
    expect(pickOf(s, "g0")).toMatchObject({ stage: "pick", range: 6, total: 10, yourPick: null, reveal: null });
    [6, 6, 5, 2, 1].forEach((n, i) => (s = pickNo(s, `g${i}`, n)));
    const r = pickOf(s, "g0").reveal!;
    expect(r.picks).toEqual([
      { guest: "g0", number: 6, unique: false }, { guest: "g1", number: 6, unique: false },
      { guest: "g2", number: 5, unique: true }, { guest: "g3", number: 2, unique: true }, { guest: "g4", number: 1, unique: true },
    ]);
    expect(r.scored).toEqual({ g0: 0, g1: 0, g2: 10, g3: 2, g4: 1 });
    expect(ranking(s).map((e) => [e.guest, e.points])).toEqual([["g2", 10], ["g3", 2], ["g4", 1], ["g0", 0], ["g1", 0]]);
  });

  it("sets the number range by band: 1-6 at 3-5 guests, 1-9 at 6-8, 1-12 at 9-10", () => {
    const rangeOf = (n: number) => pickOf(danceOf(n), "g0").range;
    expect([3, 5, 6, 8, 9, 10].map(rangeOf)).toEqual([6, 6, 9, 9, 12, 12]);
    const s = danceOf(6);
    expect(apply(s, { type: "pick", guest: "g0", number: 10 }, 2000)).toEqual({ ok: false, reason: "picks are whole numbers in the range" });
    expect(apply(s, { type: "pick", guest: "g0", number: 0 }, 2000).ok).toBe(false);
    expect(apply(s, { type: "pick", guest: "g0", number: 1.5 }, 2000).ok).toBe(false);
    expect(apply(s, { type: "pick", guest: "g0", number: 9 }, 2000).ok).toBe(true);
  });

  it("hides every pick until the reveal, then names them all", () => {
    let s = danceOf(4);
    s = pickNo(s, "g1", 3);
    expect(pickOf(s, "g1").yourPick).toBe(3);
    expect(pickOf(s, "g0")).toMatchObject({ yourPick: null, reveal: null });
    expect(JSON.stringify(viewFor(s, "g0"))).not.toContain('"picks"');
    expect(apply(s, { type: "pick", guest: "g1", number: 4 }, 2500)).toEqual({ ok: false, reason: "already picked" });
    expect(apply(s, { type: "pick", guest: "g0", number: 2 }, 16_000)).toEqual({ ok: false, reason: "too late" });
    s = tickToDeadline(s);
    const r = pickOf(s, "g0");
    expect(r).toMatchObject({ stage: "reveal", yourPick: null });
    expect(r.reveal!.picks).toEqual([{ guest: "g1", number: 3, unique: true }]);
    expect(r.deadline - 16_000).toBe(5000);
    s = tickToDeadline(s);
    expect(pickOf(s, "g0")).toMatchObject({ index: 1, stage: "pick", reveal: null });
  });

  it("scores a guest who didn't pick nothing, and the highest unique pick takes the bonus even when a higher number clashes", () => {
    let s = danceOf(4);
    s = pickNo(pickNo(pickNo(s, "g0", 6), "g1", 6), "g2", 4);
    s = tickToDeadline(s);
    expect(pickOf(s, "g3").reveal!.scored).toEqual({ g0: 0, g1: 0, g2: 9, g3: 0 });
  });

  it("buys points at 1 favour = 3", () => {
    const s = must(danceOf(4), { type: "buyPoints", guest: "g2", favours: 2 }, 2000);
    expect(ranking(s)[0]).toMatchObject({ guest: "g2", points: 6 });
    expect(s.guests[2]!.favours).toBe(8);
  });

  describe("ranks strictly: points, then more unique picks, then the draw", () => {
    /** A Unique pick match at rest with the given points, unique picks and draw keys per guest. */
    const standing = (rows: Record<string, [points: number, uniques: number, drawKey: number]>): PickState => {
      const [pick] = startPick(1, WALLFLOWER, Object.keys(rows), 0, 10);
      for (const [g, [points, uniques, key]] of Object.entries(rows)) Object.assign(pick, { points: { ...pick.points, [g]: points }, uniques: { ...pick.uniques, [g]: uniques }, drawKeys: { ...pick.drawKeys, [g]: key } });
      return pick;
    };

    it("puts more points first", () => {
      expect(rankPick(standing({ a: [3, 3, 0.1], b: [9, 1, 0.9], c: [5, 2, 0.5] })).map((r) => r.guest)).toEqual(["b", "c", "a"]);
    });

    it("puts the guest with more unique picks first when points are level, with no draw", () => {
      const r = rankPick(standing({ a: [5, 1, 0.1], b: [5, 2, 0.9], c: [2, 5, 0.5] }));
      expect(r.map((e) => e.guest)).toEqual(["b", "a", "c"]);
      expect(r.map((e) => e.drawn)).toEqual([false, false, false]);
    });

    it("lets the draw decide when points and unique picks are level, and marks both neighbours drawn", () => {
      const r = rankPick(standing({ a: [5, 2, 0.8], b: [5, 2, 0.2], c: [9, 1, 0.5], d: [1, 1, 0.5] }));
      expect(r.map((e) => e.guest)).toEqual(["c", "b", "a", "d"]);
      expect(r.map((e) => e.drawn)).toEqual([false, true, true, false]);
    });

    it("counts a unique pick for each step a guest stands alone, and ranks level guests by the draw", () => {
      // g0 stands alone on 6 in step 1 and g1 does in step 2: 11 points and one unique pick each.
      let s = danceOf(4);
      s = tickToDeadline(pickNo(s, "g0", 6));
      s = tickToDeadline(s);
      s = tickToDeadline(pickNo(pickNo(s, "g1", 6), "g2", 5));
      s = tickToDeadline(s);
      const r = (viewFor(s, "g0") as { ranking: { guest: string; points: number }[] }).ranking;
      expect(r.slice(0, 3).map((e) => [e.guest, e.points])).toEqual([["g0", 11], ["g1", 11], ["g2", 5]]);
      expect(s.pick!.uniques).toMatchObject({ g0: 1, g1: 1, g2: 1 });
    });
  });

  it("plays a whole Dance to a paid, strict ranking and sends the lower half down", () => {
    let s = danceOf(5);
    while (s.phase === "dance") {
      const p = s.pick!;
      if (p.stage === "pick") for (const id of Object.keys(p.points)) s = must(s, { type: "pick", guest: id, number: 1 + ((Number(id.slice(1)) + p.step) % 6) }, p.stepStartedAt + 1000);
      s = tickToDeadline(s);
    }
    expect(s.phase).toBe("sentDown");
    expect(new Set(s.danceResult!.ranking.map((r) => r.guest)).size).toBe(5);
  });

  describe("as a Cellar game", () => {
    it("is private to the Cellar: free guests watch only the ranking, and 7 steps run to an unmasking", () => {
      let s = cellarOf(3);
      const [a, b, c] = s.cellar!.guests as [string, string, string];
      const free = s.guests.find((g) => !s.cellar!.guests.includes(g.id))!.id;
      expect(pickOf(s, a)).toMatchObject({ range: 6, total: 7 });
      s = pickNo(s, a, 4);
      expect((viewFor(s, free) as { pick: unknown }).pick).toBeNull();
      expect(JSON.stringify(viewFor(s, free))).not.toContain('"yourPick":4');
      expect(pickOf(s, b).yourPick).toBeNull();
      expect(apply(s, { type: "pick", guest: free, number: 2 }, 2000)).toEqual({ ok: false, reason: "not playing in this match" });
      for (let i = 0; i < 7; i++) {
        if (s.cellar!.pick!.stage === "pick") s = pickNo(pickNo(s, b, 1 + (i % 6), s.cellar!.pick!.stepStartedAt + 500), c, 1 + ((i + 1) % 6), s.cellar!.pick!.stepStartedAt + 600);
        s = tickToDeadline(s);
        if (s.phase === "cellar" && s.cellar!.pick!.stage === "reveal") s = tickToDeadline(s);
      }
      expect(s.phase).toBe("unmasking");
      expect(s.cellar!.ranking).toHaveLength(3);
      expect(s.cellar!.unmasked).toHaveLength(1);
    });

    it("can be drawn as a Cellar game for Cellars of 3-9, never 2", () => {
      const drawnAs = (count: number) =>
        Array.from({ length: 300 }, (_, seed) => drawMatch({ library: LIBRARY, role: "cellar", count, round: 2, history: [], seed })?.match.id);
      for (let n = 3; n <= 9; n++) expect(drawnAs(n), `a Cellar of ${n}`).toContain("wallflower");
      expect(drawnAs(2)).not.toContain("wallflower");
      expect(drawnAs(2).every((id) => id !== undefined)).toBe(true);
    });
  });
});
