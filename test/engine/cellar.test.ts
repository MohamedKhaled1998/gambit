import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply, nextDeadline, viewFor } from "../../src/engine/game";
import { CELLAR_MS, SENT_DOWN_MS, UNMASKING_MS, type GameState, type GuestView } from "../../src/shared/types";
import { mixedPlayer, must, playDance, playGame, playMatch, started, tickToDeadline } from "./sim";

type V<P extends GuestView["phase"]> = Extract<GuestView, { phase: P }>;
const remaining = (s: GameState) => s.guests.filter((g) => g.unmaskedIn === undefined);
const sentDown = (n: number, seed = 3) => playDance(started(n, seed), mixedPlayer);
const inCellar = (n: number, seed = 3) => tickToDeadline(sentDown(n, seed));

describe("being sent down", () => {
  it("sends down the lower half by favours, rounded up", () => {
    const s = sentDown(7);
    expect(s.phase).toBe("sentDown");
    expect(s.cellar!.guests).toHaveLength(4);
    const fav = (id: string) => s.guests.find((g) => g.id === id)!.favours;
    const free = remaining(s).filter((g) => !s.cellar!.guests.includes(g.id));
    for (const c of s.cellar!.guests) for (const f of free) expect(fav(c)).toBeLessThanOrEqual(f.favours);
  });

  it("sends down at least one more than the round unmasks", () => {
    // Six guests unmask two in round 1: half of six is three, which is already one more.
    expect(sentDown(6).cellar!.guests).toHaveLength(3);
    // Ten guests unmask three: half is five.
    expect(sentDown(10).cellar!.guests).toHaveLength(5);
  });

  it("keeps free, on equal favours, the guest placed higher in the Dance", () => {
    for (let seed = 1; seed < 6; seed++) {
      const s = sentDown(8, seed); // places 4 and 5 both pay 0, so they hold equal favours
      const order = s.danceResult!.ranking.map((r) => r.guest);
      expect(s.cellar!.guests).toContain(order[4]);
      expect(s.cellar!.guests).not.toContain(order[3]);
    }
  });

  it("reveals the count and announces the Cellar game when guests are sent down, never before", () => {
    const s = sentDown(7);
    const v = viewFor(s, "g0") as V<"sentDown">;
    expect(v.unmaskings).toBe(2);
    expect(v.cellar.slice().sort()).toEqual(s.cellar!.guests.slice().sort());
    expect(v.cellarGame.name).toBe("The Procession");
    expect(nextDeadline(s)).toBe(s.deadline);
    for (const early of [started(7, 3), tickToDeadline(started(7, 3))]) {
      expect(JSON.stringify(viewFor(early, "g0"))).not.toMatch(/unmaskings|Procession/);
    }
  });

  it("gives the sent-down screen a minute", () => {
    const s = sentDown(5);
    expect(nextDeadline(s)! - s.match!.deadline).toBe(SENT_DOWN_MS);
  });
});

describe("the Cellar game", () => {
  it("is played by the Cellar alone, in a 3-minute slot", () => {
    const s = inCellar(7);
    expect(s.phase).toBe("cellar");
    expect(Object.keys(s.cellar!.race!.points).sort()).toEqual(s.cellar!.guests.slice().sort());
    expect(s.cellar!.race!.problems).toHaveLength(7);
    expect(s.cellar!.race!.def.answerSeconds).toBe(20);
    expect(nextDeadline(s)! - s.deadline!).toBeLessThanOrEqual(CELLAR_MS);
    expect(s.cellar!.race!.problems.length * 23_000).toBeLessThanOrEqual(CELLAR_MS);
  });

  it("shows free guests each Cellar guest's running points and rank but never a private problem", () => {
    let s = inCellar(7);
    const [down, free] = [s.cellar!.guests[0]!, remaining(s).find((g) => !s.cellar!.guests.includes(g.id))!.id];
    s = must(s, { type: "answer", guest: down, position: s.cellar!.race!.layouts[down]![0]!.indexOf(0) }, s.cellar!.race!.stepStartedAt + 1000);
    s = tickToDeadline(s);
    const watching = viewFor(s, free) as V<"cellar">;
    expect(watching.step).toBeNull();
    expect(watching.ranking).toHaveLength(4);
    expect(watching.ranking[0]).toMatchObject({ guest: down, points: 10 });
    expect(JSON.stringify(watching)).not.toContain(s.cellar!.race!.problems[0]!.prompt);
    expect((viewFor(s, down) as V<"cellar">).step).not.toBeNull();
  });

  it("lets a free guest neither answer nor buy points", () => {
    const s = inCellar(7);
    const free = remaining(s).find((g) => !s.cellar!.guests.includes(g.id))!.id;
    expect(apply(s, { type: "answer", guest: free, position: 0 }, s.deadline!)).toEqual({ ok: false, reason: "not playing in this match" });
    expect(apply(s, { type: "buyPoints", guest: free, favours: 1 }, s.deadline!)).toEqual({ ok: false, reason: "not playing in this match" });
  });

  it("lets a guest in the Cellar buy points as in a Dance", () => {
    const s0 = inCellar(7);
    const down = s0.cellar!.guests[0]!;
    const before = s0.guests.find((g) => g.id === down)!.favours;
    const s = must(s0, { type: "buyPoints", guest: down, favours: 2 }, s0.deadline!);
    expect(s.cellar!.race!.points[down]).toBe(10);
    expect(s.guests.find((g) => g.id === down)!.favours).toBe(before - 2);
    expect((viewFor(s, down) as V<"cellar">).favours).toBe(before - 2);
  });

  it("pays no favours and ends in a strict ranking", () => {
    const s0 = inCellar(7);
    const before = Object.fromEntries(s0.guests.map((g) => [g.id, g.favours]));
    const s = playMatch(s0, mixedPlayer);
    expect(s.phase).toBe("unmasking");
    expect(s.cellar!.ranking!.map((r) => r.guest).sort()).toEqual(s0.cellar!.guests.slice().sort());
    for (const g of remaining(s)) expect(g.favours).toBe(before[g.id]);
  });

  it("unmasks the lowest-ranked, as many as the round's count, and their favours vanish", () => {
    const s = playMatch(inCellar(7), mixedPlayer);
    const ranking = s.cellar!.ranking!.map((r) => r.guest);
    expect(s.cellar!.unmasked).toEqual(ranking.slice(-2));
    for (const id of s.cellar!.unmasked) expect(s.guests.find((g) => g.id === id)).toMatchObject({ unmaskedIn: 1, favours: 0 });
    expect(remaining(s)).toHaveLength(5);
    const v = viewFor(s, "g0") as V<"unmasking">;
    expect(v.unmasked).toEqual(ranking.slice(-2));
    expect(v.guests.filter((g) => g.unmasked).map((g) => g.id).sort()).toEqual(ranking.slice(-2).sort());
  });

  it("plays a warm-up round in full and unmasks nobody", () => {
    const s0 = inCellar(4);
    expect(s0.cellar!.unmaskings).toBe(0);
    expect(s0.cellar!.guests).toHaveLength(2);
    const s = playMatch(s0, mixedPlayer);
    expect(s.cellar!.race!.step).toBe(6);
    expect(s.cellar!.unmasked).toEqual([]);
    expect(remaining(s)).toHaveLength(4);
  });

  it("goes to the next round's Mingle after a minute of unmasking", () => {
    const s = playMatch(inCellar(7), mixedPlayer);
    const next = tickToDeadline(s);
    expect(nextDeadline(s)).toBe(s.deadline);
    expect(next).toMatchObject({ phase: "mingle", round: 2 });
    expect(next.deadline! - s.deadline!).toBe(4 * 60_000);
    expect(s.deadline! - (s.cellar!.race!.deadline)).toBe(UNMASKING_MS);
  });
});

describe("drawing the round's matches", () => {
  it("plays The Tally as each Dance and The Procession as each Cellar game, as Encores after round 1", () => {
    const seen: { round: number; phase: string; name: string; encore: boolean }[] = [];
    playGame(started(7, 4), mixedPlayer, (s) => {
      if (s.phase === "sentDown") seen.push({ round: s.round, phase: "cellar", name: s.cellar!.def.name, encore: s.cellar!.encore });
      if (s.phase === "sentDown" && s.round === 1) seen.push({ round: 1, phase: "dance", name: s.danceDef!.name, encore: s.danceEncore });
      if (s.phase === "mingle") seen.push({ round: s.round, phase: "dance", name: s.danceDef!.name, encore: s.danceEncore });
    });
    expect(seen.filter((x) => x.phase === "dance").map((x) => x.encore)).toEqual([false, true, true]);
    expect(seen.filter((x) => x.phase === "cellar").map((x) => x.encore)).toEqual([false, true, true]);
  });

  it("gives an Encore fresh problems", () => {
    const dance: string[][] = [];
    const cellar: string[][] = [];
    playGame(started(7, 4), mixedPlayer, (s) => {
      if (s.phase === "sentDown") dance.push(s.match!.problems.map((p) => p.prompt));
      if (s.phase === "unmasking") cellar.push(s.cellar!.race!.problems.map((p) => p.prompt));
    });
    expect(dance).toHaveLength(3);
    expect(dance[1]).not.toEqual(dance[0]);
    expect(dance[2]).not.toEqual(dance[1]);
    expect(cellar[1]).not.toEqual(cellar[0]);
  });
});

describe("a whole quick game", () => {
  const TABLE: Record<number, number[]> = { 4: [0, 1, 1], 5: [1, 1, 1], 6: [2, 1, 1], 7: [2, 2, 1], 8: [2, 2, 2], 9: [3, 2, 2], 10: [3, 3, 2] };
  for (let n = 4; n <= 10; n++) {
    it(`unmasks ${TABLE[n]!.join("/")} over three rounds from ${n} guests, and leaves two`, () => {
      const counts: number[] = [];
      const end = playGame(started(n, 20 + n), mixedPlayer, (s) => {
        if (s.phase === "unmasking") counts.push(s.cellar!.unmasked.length);
      });
      expect(counts).toEqual(TABLE[n]);
      expect(end.phase).toBe("lastDance");
      expect(remaining(end)).toHaveLength(2);
      expect(nextDeadline(end)).toBeNull();
      const v = viewFor(end, "g0") as V<"lastDance">;
      expect(v.finalists.slice().sort()).toEqual(remaining(end).map((g) => g.id).sort());
      expect(end.guests.filter((g) => g.unmaskedIn !== undefined).every((g) => g.favours === 0)).toBe(true);
    });
  }

  it("always leaves two, whoever plays and whatever the seed", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 4, max: 10 }), fc.integer({ min: 0, max: 3 }), (seed, n, skill) => {
        const end = playGame(started(n, seed), (g, _st, right) => (Number(g.slice(1)) % (skill + 1) ? null : { position: right, ms: 3000 }));
        expect(remaining(end)).toHaveLength(2);
      }),
      { numRuns: 25 },
    );
  });

  it("never lets favours go below 0", () => {
    const end = playGame(started(9, 5), mixedPlayer);
    for (const g of end.guests) expect(g.favours).toBeGreaterThanOrEqual(0);
  });
});
