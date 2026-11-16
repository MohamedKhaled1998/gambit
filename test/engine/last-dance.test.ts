import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/content/library";
import { apply, chatAccess, nextDeadline, viewFor } from "../../src/engine/game";
import { drawFinalMatch } from "../../src/engine/last-dance";
import { ADDRESS_MS, DELETE_AFTER_MS, JURY_VOTE_MS, QUESTIONS_MS, type GameState, type GuestId, type GuestView } from "../../src/shared/types";
import { mixedPlayer, must, playGame, playLastDanceMatch, started, tickToDeadline } from "./sim";

type V = Extract<GuestView, { phase: "lastDance" }>;
const view = (s: GameState, g: GuestId) => viewFor(s, g) as V;
const remaining = (s: GameState) => s.guests.filter((g) => g.unmaskedIn === undefined).map((g) => g.id);
const jurors = (s: GameState) => s.guests.filter((g) => g.unmaskedIn !== undefined).map((g) => g.id);
const table = (s: GameState, g: GuestId) => chatAccess(s, g).find((c) => c.chat === "table")!.canPost;
/** The first finalist always answers right, the second never does: the first wins the match. */


function atMatchEnd(n = 8, seed = 11): GameState {
  let s = playGame(started(n, seed), mixedPlayer);
  const [a] = remaining(s);
  return playLastDanceMatch(s, (g, _st, right) => (g === a ? { position: right, ms: 1000 } : null));
}
const toStage = (s: GameState, stage: string) => {
  while (s.lastDance!.stage !== stage) s = tickToDeadline(s);
  return s;
};

describe("the Last Dance's match", () => {
  it("follows the last unmasking directly, with an intro that announces a Race match", () => {
    const s = playGame(started(8, 11), mixedPlayer);
    expect(s.lastDance!.stage).toBe("intro");
    expect(s.lastDance!.def.type).toBe("race");
    expect(nextDeadline(s)).not.toBeNull();
  });

  it("draws an unused Race match while one is left", () => {
    const s = playGame(started(8, 11), mixedPlayer);
    expect(s.drawn.some((d) => d.id === s.lastDance!.def.id)).toBe(true); // recorded as drawn now
    expect(s.drawn.filter((d) => d.id === s.lastDance!.def.id)).toHaveLength(1);
    expect(s.lastDance!.encore).toBe(false);
  });

  it("falls back to the Race encore drawn longest ago, never one drawn in the last round", () => {
    const races = LIBRARY.filter((m) => m.type === "race" && m.steps.cellar !== null);
    expect(races).toHaveLength(6);
    // Every Race match drawn once, in this order; the last two in the last round (3).
    const history = races.map((m, i) => ({ round: i < 4 ? 1 + (i % 2) : 3, role: "cellar" as const, id: m.id }));
    for (let seed = 0; seed < 30; seed++) {
      const drawn = drawFinalMatch({ drawn: history, rounds: 3, seed });
      expect(drawn.encore).toBe(true);
      expect(drawn.match.id).toBe(races[0]!.id);
    }
  });

  it("plays the finalists alone at the Cellar game length, and pays no favours", () => {
    let s = playGame(started(8, 11), mixedPlayer);
    const before = Object.fromEntries(s.guests.map((g) => [g.id, g.favours]));
    s = tickToDeadline(s);
    expect(s.lastDance!.stage).toBe("match");
    expect(Object.keys(s.lastDance!.race!.points).sort()).toEqual(remaining(s).sort());
    expect(s.lastDance!.race!.problems).toHaveLength(s.lastDance!.def.steps.cellar!);
    s = playLastDanceMatch(s, mixedPlayer);
    for (const g of s.guests) expect(g.favours).toBe(before[g.id]);
  });

  it("lets finalists buy points, and spent favours vanish", () => {
    let s = tickToDeadline(playGame(started(8, 11), mixedPlayer));
    const [a] = remaining(s) as [GuestId];
    const had = s.guests.find((g) => g.id === a)!.favours;
    s = must(s, { type: "buyPoints", guest: a, favours: 1 });
    expect(s.guests.find((g) => g.id === a)!.favours).toBe(had - 1);
    expect(s.lastDance!.race!.points[a]).toBe(s.lastDance!.def.buyRate);
  });

  it("has the jurors play along on the Balcony", () => {
    const s = tickToDeadline(playGame(started(8, 11), mixedPlayer));
    expect(view(s, jurors(s)[0]!).along).not.toBeNull();
    expect(view(s, remaining(s)[0]!).along).toBeNull();
  });
});

describe("the bar and the addresses", () => {
  const TABLE: Record<number, number> = { 2: 2, 3: 2, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6 };
  for (let n = 4; n <= 10; n++) {
    const j = n - 2;
    it(`shows the loser needing ${TABLE[j]} of ${j} jurors when the match ends`, () => {
      const s = atMatchEnd(n, 3);
      const r = view(s, remaining(s)[0]!).result!;
      expect(r.jurors).toBe(j);
      expect(r.needs).toBe(TABLE[j]);
      expect(r.winner).toBe(remaining(s)[0]);
    });
  }

  it("gives the Table to the match winner alone for 60s, then the loser alone for 60s, then everyone for 90s", () => {
    let s = atMatchEnd();
    const [w, l] = [s.lastDance!.matchWinner!, s.lastDance!.matchLoser!];
    const j = jurors(s)[0]!;
    expect(s.lastDance!.stage).toBe("winnerFloor");
    expect([table(s, w), table(s, l), table(s, j)]).toEqual([true, false, false]);
    const t0 = nextDeadline(s)!;
    s = tickToDeadline(s);
    expect(s.lastDance!.stage).toBe("loserFloor");
    expect(nextDeadline(s)).toBe(t0 + ADDRESS_MS);
    expect([table(s, w), table(s, l), table(s, j)]).toEqual([false, true, false]);
    expect(view(s, j).floor).toBe(l);
    s = tickToDeadline(s);
    expect(s.lastDance!.stage).toBe("questions");
    expect(nextDeadline(s)).toBe(t0 + 2 * ADDRESS_MS + QUESTIONS_MS - ADDRESS_MS);
    expect(s.guests.every((g) => table(s, g.id))).toBe(true);
  });

  it("keeps the Balcony the Jury's", () => {
    const s = toStage(atMatchEnd(), "questions");
    for (const g of s.guests) expect(chatAccess(s, g.id).some((c) => c.chat === "balcony")).toBe(g.unmaskedIn !== undefined);
  });
});

describe("the Jury vote", () => {
  /** Every juror votes as `pick` says; returns the game just after the vote closes. */
  function voted(n: number, seed: number, pick: (juror: GuestId, i: number, w: GuestId, l: GuestId) => GuestId | null, present?: GuestId[]) {
    let s = toStage(atMatchEnd(n, seed), "vote");
    const { matchWinner: w, matchLoser: l } = s.lastDance!;
    for (const [i, j] of jurors(s).entries()) {
      const f = pick(j, i, w!, l!);
      if (f) s = must(s, { type: "vote", guest: j, finalist: f }, s.deadline! - 1000);
    }
    return { s, w: w!, l: l! };
  }
  const finish = (s: GameState) => {
    while (s.lastDance!.stage !== "ended") s = tickToDeadline(s);
    return s;
  };

  it("lasts 45s and lets a juror name a finalist once, with no abstain", () => {
    let s = toStage(atMatchEnd(), "vote");
    const j = jurors(s)[0]!;
    const opened = s.deadline! - JURY_VOTE_MS;
    expect(tickToDeadline(toStage(atMatchEnd(), "questions")).deadline).toBeGreaterThanOrEqual(opened + JURY_VOTE_MS);
    expect(apply(s, { type: "vote", guest: j, finalist: j }, 0)).toEqual({ ok: false, reason: "name a finalist" });
    expect(apply(s, { type: "vote", guest: remaining(s)[0]!, finalist: s.lastDance!.matchLoser! }, 0)).toEqual({ ok: false, reason: "only the Jury votes" });
    s = must(s, { type: "vote", guest: j, finalist: s.lastDance!.matchLoser! }, s.deadline! - 5);
    expect(apply(s, { type: "vote", guest: j, finalist: s.lastDance!.matchWinner! }, s.deadline! - 4)).toEqual({ ok: false, reason: "already voted" });
    expect(apply(s, { type: "vote", guest: jurors(s)[1]!, finalist: s.lastDance!.matchWinner! }, s.deadline!)).toEqual({ ok: false, reason: "too late" });
  });

  it("keeps ballots hidden until the reveal", () => {
    const s = toStage(atMatchEnd(8, 3), "vote");
    const t = must(s, { type: "vote", guest: jurors(s)[0]!, finalist: s.lastDance!.matchLoser! }, s.deadline! - 100);
    for (const g of s.guests) {
      const v = view(t, g.id);
      expect(JSON.stringify(v.ballots)).toBe("[]");
      if (g.id !== jurors(s)[0]) expect(v.vote?.yourVote ?? null).toBeNull();
    }
    expect(view(t, jurors(s)[0]!).vote!.yourVote).toBe(s.lastDance!.matchLoser);
    expect(view(t, remaining(s)[0]!).lastMask).toBeNull();
  });

  it("crowns the loser only with two-thirds of the jurors present, rounded up", () => {
    // 6 jurors: bar 4.
    for (const [backing, loserWins] of [[3, false], [4, true]] as const) {
      const { s, w, l } = voted(8, 3, (_j, i, w2, l2) => (i < backing ? l2 : w2));
      const end = finish(tickToDeadline(s));
      expect(end.lastDance!.lastMask).toBe(loserWins ? l : w);
      expect(view(end, "g0").lastMask).toBe(loserWins ? l : w);
    }
  });

  it("counts a present juror who doesn't vote as not backing the loser", () => {
    const { s, w } = voted(8, 3, (_j, i, _w, l) => (i < 3 ? l : null));
    expect(finish(tickToDeadline(s)).lastDance!.lastMask).toBe(w);
  });

  it("counts only jurors present when the vote opens", () => {
    // 6 jurors, all but 2 absent as the vote opens: 2 present, bar 2.
    let s = toStage(atMatchEnd(8, 3), "questions");
    const js = jurors(s);
    const present = [...remaining(s), js[0]!, js[1]!];
    const { matchLoser: l, matchWinner: w } = s.lastDance!;
    s = must(s, { type: "tick", present }, nextDeadline(s)!);
    expect(s.lastDance!.stage).toBe("vote");
    expect(s.lastDance!.jurors).toEqual([js[0], js[1]]);
    expect(view(s, js[2]!).vote).toBeNull();
    expect(apply(s, { type: "vote", guest: js[2]!, finalist: l! }, s.deadline! - 5)).toEqual({ ok: false, reason: "the Jury was counted when the vote opened" });
    s = must(s, { type: "vote", guest: js[0]!, finalist: l! }, s.deadline! - 5);
    s = must(s, { type: "vote", guest: js[1]!, finalist: l! }, s.deadline! - 4);
    expect(finish(tickToDeadline(s)).lastDance!.lastMask).toBe(l);
    void w;
  });

  it("lets the match decide when no juror is present", () => {
    let s = toStage(atMatchEnd(8, 3), "questions");
    const w = s.lastDance!.matchWinner!;
    s = must(s, { type: "tick", present: remaining(s) }, nextDeadline(s)!);
    expect(s.lastDance!.stage).not.toBe("vote");
    expect(finish(s).lastDance!.lastMask).toBe(w);
  });

  it("reveals ballots one at a time with names, in an order from the seed, then crowns the last mask", () => {
    const { s } = voted(8, 3, (_j, i, w, l) => (i % 2 ? l : w));
    const orders = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let t = tickToDeadline({ ...s, seed });
      expect(t.lastDance!.stage).toBe("reveal");
      const again = tickToDeadline({ ...s, seed });
      expect(again.lastDance!.order).toEqual(t.lastDance!.order);
      const seen: number[] = [];
      while (t.lastDance!.stage === "reveal") {
        const v = view(t, "g0");
        seen.push(v.ballots.length);
        expect(v.lastMask).toBeNull();
        t = tickToDeadline(t);
      }
      expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
      const v = view(t, "g0");
      expect(v.ballots).toHaveLength(6);
      expect(v.ballots.map((b) => b.juror).sort()).toEqual(jurors(t).sort());
      orders.add(v.ballots.map((b) => b.juror).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("the end screen", () => {
  it("crowns the last mask, shows final favours, and reveals every prediction including the match winner's, naming the Oracle", () => {
    let s = playGame(started(8, 11), mixedPlayer);
    const [a, b] = remaining(s) as [GuestId, GuestId];
    const [j0, j1] = jurors(s) as [GuestId, GuestId];
    s = must(s, { type: "predict", guest: j0, picks: [a] });
    s = must(s, { type: "predict", guest: j1, picks: [b] });
    expect(view(s, a).reveal).toBeNull();
    expect(JSON.stringify(view(s, a))).not.toContain(`"${j0}":"${a}"`);
    s = tickToDeadline(s);
    expect(apply(s, { type: "predict", guest: j0, picks: [b] }, 0)).toEqual({ ok: false, reason: "predictions are closed" });
    s = playLastDanceMatch(s, (g, _st, right) => (g === a ? { position: right, ms: 1000 } : null));
    expect(JSON.stringify(view(s, a).reveal)).toBe("null");
    while (s.lastDance!.stage !== "ended") s = tickToDeadline(s);
    const v = view(s, a);
    expect(v.lastMask).not.toBeNull();
    expect(v.reveal!.lastDance).toMatchObject({ winner: a, picks: { [j0]: a, [j1]: b } });
    expect(v.reveal!.scores[j0]).toBe(3);
    expect(v.reveal!.oracle).toEqual([j0]);
    expect(v.favours).toEqual(Object.fromEntries(remaining(s).map((g) => [g, s.guests.find((x) => x.id === g)!.favours])));
  });

  it("deletes the game 30 days after the end, by the clock", () => {
    let s = playGame(started(8, 11), mixedPlayer, () => {});
    while (s.lastDance!.stage !== "ended") s = tickToDeadline(s);
    expect(nextDeadline(s)).toBe(s.lastDance!.endedAt! + DELETE_AFTER_MS);
    s = tickToDeadline(s);
    expect(s.lastDance!.stage).toBe("deleted");
    expect(nextDeadline(s)).toBeNull();
  });
});
