import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { drawMatch, type Drawn } from "../../src/engine/draw-match";
import type { MatchDef } from "../../src/shared/types";

const def = (id: string, dance: [number, number] | null, cellar: [number, number] | null, extra: Partial<MatchDef> = {}): MatchDef =>
  ({ id, name: id, type: "race", guestRange: { dance, cellar }, ...extra }) as MatchDef;

const A = def("a", [3, 10], [2, 9]);
const B = def("b", [3, 10], [2, 9]);
const C = def("c", [3, 10], [2, 9]);
const D = def("d", [3, 10], null);
const ids = (lib: MatchDef[], history: Drawn[], role: "dance" | "cellar", round: number, count = 6, seed = 1) =>
  drawMatch({ library: lib, role, count, round, history, seed })?.match.id;

describe("drawing a match", () => {
  it("draws from the matches not yet drawn this game first", () => {
    const history: Drawn[] = [{ round: 1, role: "dance", id: "a" }];
    for (let seed = 0; seed < 30; seed++) expect(["b", "c"]).toContain(ids([A, B, C], history, "dance", 2, 6, seed));
  });

  it("only draws matches that fit the role and the guest count", () => {
    expect(ids([D, def("e", [3, 10], [2, 9], { })], [], "cellar", 1, 6)).toBe("e");
    expect(ids([A, def("f", [3, 4], null)], [], "dance", 1, 8)).toBe("a");
    expect(ids([A], [], "cellar", 1, 12)).toBeUndefined();
  });

  it("falls to matches not yet drawn in this role when all were drawn", () => {
    const history: Drawn[] = [
      { round: 1, role: "dance", id: "a" }, { round: 1, role: "cellar", id: "b" },
      { round: 2, role: "dance", id: "c" }, { round: 2, role: "cellar", id: "d" },
    ];
    // Round 3 cellar: all drawn; not-yet-in-cellar-role among a,c (b,d excluded by cellar? d fits no cellar): a, c — c is last round's dance
    for (let seed = 0; seed < 30; seed++) expect(ids([A, B, C, D], history, "cellar", 3, 6, seed)).toBe("a");
  });

  it("falls to the match drawn longest ago when every one was drawn in this role", () => {
    const history: Drawn[] = [
      { round: 1, role: "dance", id: "a" }, { round: 2, role: "dance", id: "b" }, { round: 3, role: "dance", id: "c" },
    ];
    expect(ids([A, B, C], history, "dance", 4)).toBe("a");
  });

  it("never draws this round's or last round's match", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const history: Drawn[] = [{ round: 1, role: "dance", id: "a" }, { round: 1, role: "cellar", id: "b" }, { round: 2, role: "dance", id: "c" }];
        expect(["d", "e"]).toContain(ids([A, B, C, def("d", null, [2, 9]), def("e", null, [2, 9])], history, "cellar", 2, 5, seed));
      }),
    );
  });

  it("marks a second draw as an Encore, and a first draw as not", () => {
    const history: Drawn[] = [{ round: 1, role: "dance", id: "a" }];
    expect(drawMatch({ library: [A], role: "dance", count: 5, round: 3, history, seed: 1 })!.encore).toBe(true);
    expect(drawMatch({ library: [A, B], role: "dance", count: 5, round: 2, history, seed: 1 })!.encore).toBe(false);
  });

  it("falls back to last round's match rather than stall when nothing else fits", () => {
    const history: Drawn[] = [{ round: 1, role: "dance", id: "a" }];
    expect(ids([A], history, "dance", 2)).toBe("a");
  });

  it("draws a once-a-game match at most once", () => {
    const P = def("p", [3, 10], null, { oncePerGame: true });
    const history: Drawn[] = [{ round: 1, role: "dance", id: "p" }];
    expect(ids([P, A], history, "dance", 4)).toBe("a");
  });

  it("is repeatable from the seed and advances it", () => {
    const a = drawMatch({ library: [A, B, C], role: "dance", count: 6, round: 1, history: [], seed: 7 })!;
    const b = drawMatch({ library: [A, B, C], role: "dance", count: 6, round: 1, history: [], seed: 7 })!;
    expect(a).toEqual(b);
    expect(a.seed).not.toBe(7);
  });
});
