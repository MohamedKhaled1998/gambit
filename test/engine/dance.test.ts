import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply, nextDeadline, viewFor } from "../../src/engine/game";
import { DANCE_PAYOUTS, DANCE_MS, MINGLE_MS } from "../../src/shared/types";
import type { GuestView } from "../../src/shared/types";
import { foyerWith, intoDance, mixedPlayer, must, playDance, started, tickToDeadline } from "./sim";

const ranking = (s: ReturnType<typeof started>) => s.danceResult!.ranking.map((r) => r.guest);

describe("Round 1's clock", () => {
  it("opens with a 4-minute Mingle that announces the Dance", () => {
    const s = started(5, 1, 1000);
    expect(s.phase).toBe("mingle");
    expect(nextDeadline(s)).toBe(1000 + MINGLE_MS);
    expect(viewFor(s, "g1")).toMatchObject({ phase: "mingle", round: 1, announcement: { name: "The Tally" } });
  });

  it("moves to the Dance only through a tick at the deadline", () => {
    const s = started(5, 1, 0);
    expect(must(s, { type: "tick" }, MINGLE_MS - 1)).toEqual(s);
    const dance = must(s, { type: "tick" }, MINGLE_MS);
    expect(dance.phase).toBe("dance");
    expect(dance.match!.stepStartedAt).toBe(MINGLE_MS);
  });

  it("keeps time on the clock when a tick comes late", () => {
    const late = must(started(5, 1, 0), { type: "tick" }, MINGLE_MS + 40_000);
    expect(late.match!.step).toBe(2); // 18s steps measured from the Dance's start, not from the late tick
    expect(late.match!.stepStartedAt).toBe(MINGLE_MS + 36_000);
  });

  it("finishes the Dance inside its 5 minutes and shows the standings", () => {
    const s = playDance(started(6, 3, 0), () => null);
    expect(s.phase).toBe("standings");
    expect(nextDeadline(s)).toBeNull();
    expect(s.danceResult!.ranking).toHaveLength(6);
    // 12 steps of 18s each from the start of the Dance.
    const dance = intoDance(started(6, 3, 0));
    expect(dance.match!.deadline - MINGLE_MS).toBeLessThanOrEqual(DANCE_MS);
  });
});

describe("The Tally", () => {
  it("plays 12 steps with an answer window of 15s and a step of 18s", () => {
    let s = intoDance(started(4, 9));
    const steps: number[] = [];
    while (s.phase === "dance") {
      steps.push(s.match!.step);
      expect(s.match!.answerDeadline - s.match!.stepStartedAt).toBe(15_000);
      s = tickToDeadline(tickToDeadline(s));
    }
    expect(new Set(steps).size).toBe(12);
  });

  it("gives every guest the same problems in the same order with choices shuffled per guest", () => {
    const s = intoDance(started(8, 5));
    const shapes = new Set<string>();
    for (const g of s.guests) {
      const v = viewFor(s, g.id) as Extract<GuestView, { phase: "dance" }>;
      expect(v.step.prompt).toBe((viewFor(s, "g0") as Extract<GuestView, { phase: "dance" }>).step.prompt);
      expect([...v.step.choices].sort()).toEqual([...(viewFor(s, "g0") as Extract<GuestView, { phase: "dance" }>).step.choices].sort());
      shapes.add(v.step.choices.join());
    }
    expect(shapes.size).toBeGreaterThan(1);
  });

  it("makes harder problems as the match goes on and never repeats one", () => {
    const { problems } = intoDance(started(4, 11)).match!;
    expect(problems[0]!.prompt).toMatch(/^\d+ [+−] \d+$/);
    expect(problems[5]!.prompt).toMatch(/^\d+ × \d$/);
    expect(problems[10]!.prompt.split(/[+×−]/).length).toBe(3);
    expect(new Set(problems.map((p) => p.prompt)).size).toBe(12);
    for (const p of problems) expect(new Set(p.choices).size).toBe(4);
  });

  it("offers near-miss wrong choices", () => {
    const { problems } = intoDance(started(4, 12)).match!;
    for (const p of problems) {
      const right = Number(p.choices[0]);
      // Off by 1 or 10, or the wrong operation: at least two of the three wrong choices are within 10.
      expect(p.choices.slice(1).filter((c) => Math.abs(Number(c) - right) <= 10).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("scores 10 for a right answer, 0 for a wrong one and none, and shows only the guest's own answer before the reveal", () => {
    let s = intoDance(started(4, 2));
    const right = (g: string) => s.match!.layouts[g]![0]!.indexOf(0);
    s = must(s, { type: "answer", guest: "g0", position: right("g0") }, MINGLE_MS + 4000);
    s = must(s, { type: "answer", guest: "g1", position: (right("g1") + 1) % 4 }, MINGLE_MS + 5000);
    const v0 = viewFor(s, "g0") as Extract<GuestView, { phase: "dance" }>;
    expect(v0.step.yourAnswer).toBe(right("g0"));
    expect(v0.step.reveal).toBeNull();
    expect(v0.ranking.every((r) => r.points === 0)).toBe(true);
    s = tickToDeadline(s);
    const after = viewFor(s, "g0") as Extract<GuestView, { phase: "dance" }>;
    expect(after.step.stage).toBe("reveal");
    expect(after.step.reveal).toEqual({ correct: right("g0"), yourResult: "right" });
    expect(Object.fromEntries(after.ranking.map((r) => [r.guest, r.points]))).toEqual({ g0: 10, g1: 0, g2: 0, g3: 0 });
    expect((viewFor(s, "g2") as Extract<GuestView, { phase: "dance" }>).step.reveal!.yourResult).toBe("none");
  });

  it("rejects a late answer and a second answer, and takes one answer per step", () => {
    const s = intoDance(started(4, 2));
    expect(apply(s, { type: "answer", guest: "g0", position: 0 }, MINGLE_MS + 15_000)).toEqual({ ok: false, reason: "too late" });
    const once = must(s, { type: "answer", guest: "g0", position: 0 }, MINGLE_MS + 14_999);
    expect(apply(once, { type: "answer", guest: "g0", position: 1 }, MINGLE_MS + 14_999)).toEqual({ ok: false, reason: "already answered" });
    expect(apply(s, { type: "answer", guest: "g0", position: 4 }, MINGLE_MS + 1)).toEqual({ ok: false, reason: "no such choice" });
    expect(apply(started(4, 2), { type: "answer", guest: "g0", position: 0 }, 1)).toEqual({ ok: false, reason: "no Dance is running" });
  });

  it("ends a step early when every guest has answered", () => {
    let s = intoDance(started(4, 2));
    for (const g of s.guests) s = must(s, { type: "answer", guest: g.id, position: 0 }, MINGLE_MS + 2000);
    expect(s.match!.stage).toBe("reveal");
    expect(nextDeadline(s)).toBe(MINGLE_MS + 5000);
  });

  it("counts the full answer window as the time of a missing answer", () => {
    const s = playDance(started(4, 2), (g) => (g === "g0" ? { position: 0, ms: 1000 } : null));
    expect(s.danceResult!.ranking.find((r) => r.guest === "g1")!.time).toBe(12 * 15_000);
  });
});

describe("buying points", () => {
  const inDance = () => intoDance(started(4, 2));

  it("turns 1 favour into 5 points and the favour vanishes", () => {
    const s = must(inDance(), { type: "buyPoints", guest: "g1", favours: 3 }, MINGLE_MS + 100);
    expect(s.match!.points.g1).toBe(15);
    expect(s.guests.find((g) => g.id === "g1")!.favours).toBe(7);
    expect((viewFor(s, "g1") as Extract<GuestView, { phase: "dance" }>).favours).toBe(7);
  });

  it("never takes favours below 0", () => {
    const s = inDance();
    expect(apply(s, { type: "buyPoints", guest: "g1", favours: 11 }, MINGLE_MS)).toEqual({ ok: false, reason: "not enough favours" });
    const broke = must(s, { type: "buyPoints", guest: "g1", favours: 10 }, MINGLE_MS);
    expect(apply(broke, { type: "buyPoints", guest: "g1", favours: 1 }, MINGLE_MS)).toEqual({ ok: false, reason: "not enough favours" });
    expect(apply(s, { type: "buyPoints", guest: "g1", favours: 0 }, MINGLE_MS)).toEqual({ ok: false, reason: "bad amount" });
    expect(apply(s, { type: "buyPoints", guest: "g1", favours: 1.5 }, MINGLE_MS)).toEqual({ ok: false, reason: "bad amount" });
  });

  it("works in any step of the match, including a reveal, but not in the Mingle", () => {
    expect(apply(started(4, 2), { type: "buyPoints", guest: "g1", favours: 1 }, 5)).toEqual({ ok: false, reason: "no Dance is running" });
    const revealing = tickToDeadline(inDance());
    expect(revealing.match!.stage).toBe("reveal");
    expect(apply(revealing, { type: "buyPoints", guest: "g1", favours: 1 }, MINGLE_MS + 15_100).ok).toBe(true);
  });

  it("can win a ranking place, and floors the payout at 0", () => {
    let s = intoDance(started(4, 2));
    s = must(s, { type: "buyPoints", guest: "g3", favours: 10 }, MINGLE_MS);
    s = playDance(s, () => null);
    expect(s.danceResult!.ranking[0]!.guest).toBe("g3");
    expect(s.guests.find((g) => g.id === "g3")!.favours).toBe(2); // 10 spent, +2 paid
  });
});

describe("the ranking and payout", () => {
  it("ranks by points, then lower total answer time", () => {
    const s = playDance(started(4, 7), (g, _step, right) => {
      if (g === "g0") return { position: right, ms: 9000 };
      if (g === "g1") return { position: right, ms: 2000 };
      return null;
    });
    expect(ranking(s).slice(0, 2)).toEqual(["g1", "g0"]);
    expect(s.danceResult!.ranking.slice(0, 2).every((r) => !r.drawn)).toBe(true);
  });

  it("settles a dead heat by a draw from the game's seed, shown on screen", () => {
    const a = playDance(started(4, 7), () => null);
    const b = playDance(started(4, 7), () => null);
    expect(ranking(a)).toEqual(ranking(b));
    expect(a.danceResult!.ranking.every((r) => r.drawn)).toBe(true);
    const c = playDance(started(4, 8), () => null);
    const orders = new Set([ranking(a).join(), ranking(c).join(), ranking(playDance(started(4, 9), () => null)).join(), ranking(playDance(started(4, 10), () => null)).join()]);
    expect(orders.size).toBeGreaterThan(1);
  });

  it("pays the table for every guest count from 3 to 10", () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9, 10]) {
      // The Foyer wants 4 guests to start; a game of 3 comes later, so test the table itself against the engine for 4-10.
      if (n < 4) continue;
      const s = playDance(started(n, 100 + n), mixedPlayer);
      expect(s.danceResult!.ranking.map((r) => s.danceResult!.payout[r.guest])).toEqual([...DANCE_PAYOUTS[n]!]);
      for (const g of s.guests) expect(g.favours).toBe(Math.max(0, 10 + s.danceResult!.payout[g.id]!));
    }
  });

  it("holds the design document's table exactly", () => {
    expect(DANCE_PAYOUTS).toEqual({
      3: [2, 0, -2],
      4: [2, 1, -1, -2],
      5: [2, 1, 0, -1, -2],
      6: [3, 2, 1, -1, -2, -3],
      7: [3, 2, 1, 0, -1, -2, -3],
      8: [3, 2, 1, 0, 0, -1, -2, -3],
      9: [3, 2, 1, 0, 0, 0, -1, -2, -3],
      10: [3, 2, 1, 1, 0, 0, -1, -1, -2, -3],
    });
    for (const [n, row] of Object.entries(DANCE_PAYOUTS)) {
      expect(row).toHaveLength(Number(n));
      expect(row.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it("shows exact favours and the Dance ranking at the standings", () => {
    const s = playDance(started(5, 4), mixedPlayer);
    const v = viewFor(s, "g2") as Extract<GuestView, { phase: "standings" }>;
    expect(v.phase).toBe("standings");
    expect(Object.values(v.favours).reduce((a, b) => a + b, 0)).toBe(50);
  });

  it("always ends in a strict ranking of every guest", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 4, max: 10 }), (seed, n) => {
        const s = playDance(started(n, seed), (g, _st, right) => (Number(g.slice(1)) % 2 ? { position: right, ms: 3000 } : null));
        expect(new Set(ranking(s)).size).toBe(n);
      }),
      { numRuns: 30 },
    );
  });
});

describe("the Foyer still rejects", () => {
  it("ticks do nothing in the Foyer", () => {
    const s = foyerWith(4);
    expect(must(s, { type: "tick" }, 10 * MINGLE_MS)).toEqual(s);
  });
});
