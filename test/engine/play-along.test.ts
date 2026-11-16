import { describe, expect, it, vi } from "vitest";

// These tests are about The Tally and The Procession, so the game draws from those two.
vi.mock("../../src/content/library", async () => {
  const { THE_TALLY } = await import("../../src/content/the-tally");
  const { THE_PROCESSION } = await import("../../src/content/the-procession");
  return { LIBRARY: [THE_TALLY, THE_PROCESSION] };
});
import { apply, chatAccess, nextDeadline, viewFor } from "../../src/engine/game";
import type { GameState, GuestId, GuestView, RaceState } from "../../src/shared/types";
import { mixedPlayer, must, playGame, playMatch, playToEnd, started, tickToDeadline } from "./sim";

type V<P extends GuestView["phase"]> = Extract<GuestView, { phase: P }>;
const remaining = (s: GameState) => s.guests.filter((g) => g.unmaskedIn === undefined).map((g) => g.id);
const unmasked = (s: GameState) => s.guests.filter((g) => g.unmaskedIn !== undefined).map((g) => g.id);

/** Plays round 1 to the end, then returns round 2's Dance, just started. */
function roundTwoDance(n: number, seed = 3): GameState {
  let s = started(n, seed);
  while (!(s.phase === "mingle" && s.round === 2)) s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, mixedPlayer) : tickToDeadline(s);
  return tickToDeadline(s);
}

/** Round 2 after its Dance: guests are sent down and picks are open. */
const roundTwoSentDown = (n: number, seed = 3) => playMatch(roundTwoDance(n, seed), mixedPlayer);

const rightPosition = (s: GameState, guest: GuestId) => {
  const race = s.along!.match as RaceState;
  return race.layouts[guest]![race.step]!.indexOf(0);
};

describe("playing along in a solo match", () => {
  it("gives unmasked guests the real match's problems, in their own layout", () => {
    const s = roundTwoDance(7);
    const [ghost] = unmasked(s);
    const real = viewFor(s, remaining(s)[0]!) as V<"dance">;
    const along = (viewFor(s, ghost!) as V<"dance">).along!;
    expect(along.step!.prompt).toBe(real.step!.prompt);
    expect(along.step!.choices.slice().sort()).toEqual(real.step!.choices.slice().sort());
    expect(along.name).toBe("The Tally");
  });

  it("scores their answers by raw points, ranked among themselves, with the real ranking untouched", () => {
    let s = roundTwoDance(7);
    const [a, b] = unmasked(s) as [GuestId, GuestId];
    const race = s.along!.match as { stepStartedAt: number };
    s = must(s, { type: "answer", guest: a, position: rightPosition(s, a) }, race.stepStartedAt + 1000);
    s = must(s, { type: "answer", guest: b, position: (rightPosition(s, b) + 1) % 4 }, race.stepStartedAt + 2000);
    const along = (viewFor(s, a) as V<"dance">).along!;
    expect(along.step!.stage).toBe("reveal");
    expect(along.ranking.map((r) => [r.guest, r.points])).toEqual([[a, 10], [b, 0]]);
    expect((viewFor(s, remaining(s)[0]!) as V<"dance">).ranking).toHaveLength(5);
    expect(s.match!.stage).toBe("answer");
  });

  it("shows the ranking to every unmasked guest but a step only to its player", () => {
    const s = roundTwoDance(7);
    const [a, b] = unmasked(s) as [GuestId, GuestId];
    expect(JSON.stringify((viewFor(s, a) as V<"dance">).along!.step)).not.toEqual(JSON.stringify((viewFor(s, b) as V<"dance">).along!.step));
    expect((viewFor(s, a) as V<"dance">).along!.ranking.map((r) => r.guest).sort()).toEqual([a, b].sort());
  });

  it("keeps the real match's views, state and ranking the same whether or not unmasked guests play", () => {
    const quiet = roundTwoDance(7);
    let loud = quiet;
    const run = (s: GameState, play: boolean): GameState[] => {
      const seen: GameState[] = [];
      while (s.phase === "dance") {
        const race = s.match!;
        if (play && s.along && !s.along.done && (s.along.match as { stage: string }).stage === "answer")
          for (const g of unmasked(s)) {
            const r = apply(s, { type: "answer", guest: g, position: rightPosition(s, g) }, race.answerStartedAt + 1500);
            if (r.ok) s = r.state;
          }
        if (race.stage === "answer")
          for (const g of remaining(s)) {
            const r = apply(s, { type: "answer", guest: g, position: s.match!.layouts[g]![race.step]!.indexOf(0) }, race.answerStartedAt + 3000);
            if (r.ok) s = r.state;
          }
        s = tickToDeadline(s);
        seen.push(s);
      }
      return seen;
    };
    void loud;
    const a = run(quiet, false);
    const b = run(quiet, true);
    expect(a.length).toBeLessThanOrEqual(b.length);
    const last = (xs: GameState[]) => ({ ...xs.at(-1)!, along: null });
    expect(last(b)).toEqual(last(a));
    for (const g of remaining(quiet)) expect(viewFor(b.at(-1)!, g)).toEqual(viewFor(a.at(-1)!, g));
  });

  it("never shows remaining guests the play-along", () => {
    const s = roundTwoDance(7);
    for (const g of remaining(s)) {
      const v = viewFor(s, g)!;
      expect(v.along).toBeNull();
      expect(v.predictions).toBeNull();
    }
  });

  it("plays along on a clock of its own that the alarm includes, and never moves the real clock", () => {
    let s = roundTwoDance(7);
    const [a, b] = unmasked(s) as [GuestId, GuestId];
    const real = s.deadline;
    const start = (s.along!.match as { stepStartedAt: number }).stepStartedAt;
    s = must(s, { type: "answer", guest: a, position: 0 }, start + 1000);
    s = must(s, { type: "answer", guest: b, position: 0 }, start + 2000);
    expect(s.deadline).toBe(real);
    expect(nextDeadline(s)).toBe(start + 2000 + 3000);
    s = tickToDeadline(s);
    expect((viewFor(s, a) as V<"dance">).along!.step!.index).toBe(1);
    expect(s.match!.step).toBe(0);
    expect(s.deadline).toBe(real);
  });

  it("finishes the play-along with the match and plays the Cellar game along too", () => {
    let s = roundTwoDance(7);
    s = playMatch(s, mixedPlayer);
    expect(s.phase).toBe("sentDown");
    expect(s.along!.done).toBe(true);
    s = tickToDeadline(s);
    expect(s.phase).toBe("cellar");
    expect(s.along!.done).toBe(false);
    const [a] = unmasked(s);
    const along = (viewFor(s, a!) as V<"cellar">).along!;
    expect(along.name).toBe("The Procession");
    expect(along.step!.prompt).toBe(s.cellar!.race!.problems[0]!.prompt);
  });
});

describe("what unmasked guests can't do", () => {
  it("gives them no gifts, favours to spend, Rooms or Table post", () => {
    const s = roundTwoDance(7);
    const [a] = unmasked(s) as [GuestId];
    const [r] = remaining(s) as [GuestId];
    expect(apply(s, { type: "buyPoints", guest: a, favours: 1 }, s.deadline!).ok).toBe(false);
    expect(apply(s, { type: "openRoom", guest: a, members: [r] }, s.deadline!).ok).toBe(false);
    expect(apply(s, { type: "gift", guest: a, to: r, favours: 1 }, s.deadline!).ok).toBe(false);
    const mingle = { ...s, phase: "mingle" as const };
    expect(apply(mingle, { type: "gift", guest: a, to: r, favours: 1 }, 0).ok).toBe(false);
    expect(chatAccess(s, a).find((c) => c.chat === "table")!.canPost).toBe(false);
    expect(chatAccess(s, a).some((c) => c.chat === "balcony" && c.canPost)).toBe(true);
  });

  it("lets remaining guests neither see nor answer for the play-along", () => {
    const s = roundTwoDance(7);
    const [a] = unmasked(s) as [GuestId];
    expect(apply(s, { type: "answer", guest: remaining(s)[0]!, position: 0 }, s.match!.answerStartedAt + 1).ok).toBe(true);
    expect(s.along!.match.points).not.toHaveProperty(remaining(s)[0]!);
    expect(a).toBeDefined();
  });
});

describe("predicting who a Cellar game unmasks", () => {
  it("opens picks to unmasked guests when guests are sent down, one pick per unmasking", () => {
    const s = roundTwoSentDown(7);
    const [a] = unmasked(s) as [GuestId];
    const v = viewFor(s, a) as V<"sentDown">;
    expect(v.predictions!.open).toEqual({ kind: "cellar", cellar: s.cellar!.guests, picks: s.cellar!.unmaskings });
    expect(viewFor(s, remaining(s)[0]!)!.predictions).toBeNull();
  });

  it("takes a pick for each unmasking from the Cellar, and lets a guest change them until the match starts", () => {
    let s = roundTwoSentDown(7);
    const [a] = unmasked(s) as [GuestId];
    const [x, y, z] = s.cellar!.guests as [GuestId, GuestId, GuestId];
    expect(s.cellar!.unmaskings).toBe(2);
    for (const picks of [[], [x], [x, x], [x, y, z]]) expect(apply(s, { type: "predict", guest: a, picks }, 0)).toEqual({ ok: false, reason: "pick one guest for each unmasking" });
    expect(apply(s, { type: "predict", guest: a, picks: [a, x] }, 0)).toEqual({ ok: false, reason: "no such guest" });
    expect(apply(s, { type: "predict", guest: remaining(s)[0]!, picks: [x, y] }, 0)).toEqual({ ok: false, reason: "only unmasked guests predict" });
    s = must(s, { type: "predict", guest: a, picks: [x, y] });
    s = must(s, { type: "predict", guest: a, picks: [y, z] });
    expect((viewFor(s, a) as V<"sentDown">).predictions!.rounds.at(-1)!.picks[a]).toEqual([y, z]);
    s = tickToDeadline(s);
    expect(s.phase).toBe("cellar");
    expect(apply(s, { type: "predict", guest: a, picks: [x, y] }, 0)).toEqual({ ok: false, reason: "predictions are closed" });
    expect((viewFor(s, a) as V<"cellar">).predictions!.open).toBeNull();
    expect((viewFor(s, a) as V<"cellar">).predictions!.rounds.at(-1)!.picks[a]).toEqual([y, z]);
  });

  it("shows picks live on the Balcony, and to nobody else", () => {
    let s = roundTwoSentDown(7);
    const [a, b] = unmasked(s) as [GuestId, GuestId];
    const [x, y] = s.cellar!.guests as [GuestId, GuestId];
    s = must(s, { type: "predict", guest: a, picks: [x, y] });
    expect((viewFor(s, b) as V<"sentDown">).predictions!.rounds.at(-1)!.picks).toEqual({ [a]: [x, y] });
    for (const g of remaining(s)) expect(JSON.stringify(viewFor(s, g))).not.toContain('"picks":{"');
  });

  it("scores one point per correct pick when the Cellar game unmasks, and shows it on the Balcony", () => {
    // The real game does not depend on predictions, so the same game unmasks the same guests.
    const truth = playGame(started(7, 3), mixedPlayer).predictions[1]!.unmasked!;
    expect(truth).toHaveLength(2);
    let s = roundTwoSentDown(7);
    const [a, b] = unmasked(s) as [GuestId, GuestId];
    const [hit] = truth as [GuestId, GuestId];
    const miss = s.cellar!.guests.find((g) => !truth.includes(g))!;
    s = must(s, { type: "predict", guest: a, picks: truth });
    s = must(s, { type: "predict", guest: b, picks: [hit, miss] });
    while (s.phase !== "unmasking") s = s.phase === "cellar" ? playMatch(s, mixedPlayer) : tickToDeadline(s);
    const v = viewFor(s, a) as V<"unmasking">;
    expect(v.predictions!.scores[a]).toBe(2);
    expect(v.predictions!.scores[b]).toBe(1);
    expect(v.predictions!.rounds.at(-1)!.unmasked).toEqual(s.cellar!.unmasked);
  });

  it("opens no picks in a warm-up round", () => {
    let s = started(4, 3);
    while (s.phase !== "sentDown") s = s.phase === "dance" ? playMatch(s, mixedPlayer) : tickToDeadline(s);
    expect(s.cellar!.unmaskings).toBe(0);
    expect(s.predictions).toEqual([]);
  });
});

describe("the end screen", () => {
  /** Plays the game; at each sent-down screen the unmasked guests pick as `pick` says (index among the unmasked, the round's truth). */
  function playPicking(n: number, seed: number, pick: (cellar: GuestId[], k: number, who: number, truth: GuestId[]) => GuestId[]): GameState {
    const truth = playGame(started(n, seed), mixedPlayer).predictions.map((r) => r.unmasked!);
    let s = started(n, seed);
    while (s.phase !== "lastDance") {
      if (s.phase === "sentDown")
        for (const [who, g] of unmasked(s).entries()) {
          const picks = pick(s.cellar!.guests, s.cellar!.unmaskings, who, truth[s.round - 1]!);
          if (s.cellar!.unmaskings > 0 && picks.length > 0) s = must(s, { type: "predict", guest: g, picks });
        }
      s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, mixedPlayer) : tickToDeadline(s);
    }
    return playToEnd(s, mixedPlayer);
  }
  /** Every guest of the Cellar not unmasked, then those unmasked, k of them. */
  const wrong = (cellar: GuestId[], k: number, truth: GuestId[]) => [...cellar.filter((g) => !truth.includes(g)), ...truth].slice(0, k);

  it("reveals every prediction to everyone and names the Oracle", () => {
    const end = playPicking(8, 5, (cellar, k, who, truth) => (who === 0 ? truth : wrong(cellar, k, truth)));
    const v = viewFor(end, remaining(end)[0]!) as V<"lastDance">;
    expect(v.reveal!.rounds).toHaveLength(3);
    expect(v.reveal!.oracle).toEqual([unmasked(end).find((g) => v.reveal!.scores[g] === Math.max(...Object.values(v.reveal!.scores)))]);
    expect(v.reveal!.scores[v.reveal!.oracle[0]!]).toBeGreaterThan(0);
    expect(v.reveal!.rounds[1]!.picks).not.toEqual({});
    expect(v.predictions).toBeNull();
  });

  it("shares the Oracle title on a tie", () => {
    const end = playPicking(8, 5, (_c, _k, _w, truth) => truth);
    const v = viewFor(end, remaining(end)[0]!) as V<"lastDance">;
    const best = Math.max(...Object.values(v.reveal!.scores));
    expect(v.reveal!.oracle.length).toBeGreaterThan(1);
    for (const g of v.reveal!.oracle) expect(v.reveal!.scores[g]).toBe(best);
  });

  it("names no Oracle when nobody scored", () => {
    const end = playPicking(8, 5, () => []);
    expect((viewFor(end, "g0") as V<"lastDance">).reveal!.oracle).toEqual([]);
  });
});
