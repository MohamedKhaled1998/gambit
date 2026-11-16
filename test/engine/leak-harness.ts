import fc from "fast-check";
import { expect } from "vitest";
import { apply, newGame, viewFor } from "../../src/engine/game";
import { withoutVote } from "./sim";
import type { Action, GameState, GuestId, GuestRecord, RaceState } from "../../src/shared/types";

/**
 * Leak-test harness. Each case names one piece of a guest's private data and
 * how to overwrite it. The property: changing only guest B's private data
 * never changes guest A's view. Later tickets add their cases to `CASES`.
 */
export interface LeakCase {
  name: string;
  /** Returns the guest record with the private datum replaced by `value`. */
  set?: (guest: GuestRecord, value: number) => GuestRecord;
  /** Or changes the whole state, for private data that lives in a match. */
  setState?: (state: GameState, guest: GuestId, value: number, observer: GuestId) => GameState;
  /** Only the states in these phases are tried; all by default. */
  phases?: GameState["phase"][];
}

export const CASES: LeakCase[] = [
  {
    name: "a bid before the reveal",
    phases: ["dance"],
    setState: (s, id, v) => {
      const a = s.auction;
      if (!a || a.stage !== "bid" || !(id in a.points)) return s;
      return { ...s, auction: { ...a, bids: { ...a.bids, [id]: { amount: Math.abs(v) % 51, order: Math.abs(v) % 7 } } } };
    },
  },
  {
    name: "a pick before the reveal",
    phases: ["dance", "cellar"],
    setState: (s, id, v) => {
      const p = s.phase === "cellar" ? s.cellar!.pick : s.pick;
      if (!p || p.stage !== "pick" || !(id in p.points)) return s;
      const next = { ...p, picks: { ...p.picks, [id]: 1 + (Math.abs(v) % p.range) } };
      return s.phase === "cellar" ? { ...s, cellar: { ...s.cellar!, pick: next } } : { ...s, pick: next };
    },
  },
  {
    name: "a pledge before the step's reveal",
    phases: ["dance"],
    setState: (s, id, v) => {
      const p = s.pledge;
      if (!p || p.stage !== "pledge" || !(id in p.points)) return s;
      return { ...s, pledge: { ...p, current: { ...p.current, [id]: Math.abs(v) % 11 } } };
    },
  },
  {
    name: "kept points and a choice before the final reveal",
    phases: ["dance"],
    setState: (s, id, v) => {
      const p = s.pledge;
      if (!p || p.stage === "final" || !(id in p.points)) return s;
      return {
        ...s,
        pledge: {
          ...p,
          // Past pledges feed the pot total, which is public by design: only kept points and the choice change.
          points: { ...p.points, [id]: Math.abs(v) % 90 },
          choices: p.stage === "reckon" ? { ...p.choices, [id]: Math.abs(v) % 2 ? "pocket" : "share" } : p.choices,
        },
      };
    },
  },
  {
    name: "a ballot before the reveal",
    phases: ["vote"],
    setState: (s, id, v) => {
      const vote = s.vote;
      if (!vote || vote.stage !== "ballot" || s.guests.find((g) => g.id === id)?.unmaskedIn !== undefined) return s;
      return { ...s, vote: { ...vote, ballots: { ...vote.ballots, [id]: Math.abs(v) % 2 ? "mercy" : "greed" } } };
    },
  },
  {
    // A vote comes unannounced: nothing the round has planned shows before it opens.
    name: "a vote planned for the round",
    phases: ["mingle", "dance"],
    setState: (s, _id, v) => ({
      ...s,
      votePlan: Math.abs(v) % 2 ? null : { afterStep: Math.abs(v) % 3, mercy: 1, greed: 2 },
      voteHeld: Math.abs(v) % 3 === 0,
      voteCount: Math.abs(v) % 2 ? null : 2,
    }),
  },
  { name: "joinedAt", set: (g, v) => ({ ...g, joinedAt: v }) },
  // Favours are private until guests are sent down.
  { name: "favours", phases: ["mingle", "dance", "vote", "cellar"], set: (g, v) => ({ ...g, favours: Math.abs(v) % 40 }) },
  {
    name: "a gift between two other guests",
    phases: ["mingle"],
    setState: (s, id, v, observer) => {
      const to = s.guests.find((g) => g.id !== id && g.id !== observer);
      const amount = 1 + (Math.abs(v) % 10);
      if (!to) return s;
      return {
        ...s,
        gifts: [...s.gifts, { round: s.round, from: id, to: to.id, favours: amount }],
        guests: s.guests.map((g) => (g.id === id ? { ...g, favours: g.favours - amount } : g.id === to.id ? { ...g, favours: g.favours + amount } : g)),
      };
    },
  },
  {
    name: "answer before the reveal",
    phases: ["dance", "cellar"],
    setState: (s, id, v) =>
      onRace(s, id, (m) =>
        m.stage !== "answer" ? m : { ...m, answers: { ...m.answers, [id]: { position: Math.abs(v) % 4, at: m.stepStartedAt + (Math.abs(v) % 10_000) } } },
      ),
  },
  {
    name: "choice layout",
    phases: ["dance", "cellar"],
    setState: (s, id, v) =>
      onRace(s, id, (m) => ({ ...m, layouts: { ...m.layouts, [id]: m.layouts[id]!.map((l) => (Math.abs(v) % 2 ? [...l].reverse() : l)) } })),
  },
];

/** Changes the running match (the Dance or the Cellar game) when the guest plays in it. */
function onRace(s: GameState, id: GuestId, change: (m: RaceState) => RaceState): GameState {
  const race = s.phase === "cellar" ? s.cellar!.race : s.match;
  if (!race || !(id in race.points)) return s;
  const next = change(race);
  return s.phase === "cellar" ? { ...s, cellar: { ...s.cellar!, race: next } } : { ...s, match: next };
}

/** Ticks to the deadline; an Unmasking vote that opens is taken back, except where the case asks for one. */
const tick = (s: GameState): GameState => {
  const next = (apply(s, { type: "tick" }, s.deadline!) as { state: GameState }).state;
  return next.phase === "vote" ? withoutVote(next) : next;
};

function arbState(): fc.Arbitrary<GameState> {
  return fc
    .record({ seed: fc.integer(), n: fc.integer({ min: 2, max: 10 }), stage: fc.constantFrom("foyer", "mingle", "dance", "cellar", "vote"), steps: fc.integer({ min: 0, max: 6 }) })
    .map(({ seed, n, stage, steps }) => {
      let s = newGame(seed);
      for (let i = 0; i < n; i++) {
        const r = apply(s, { type: "join", guest: `g${i}`, name: `G${i}` }, i);
        if (r.ok) s = r.state;
      }
      if (stage !== "foyer" && n >= 4) {
        const r = apply(s, { type: "start", guest: "g0" }, 0);
        if (r.ok) s = r.state;
        if (s.phase === "vote" && stage !== "vote") s = withoutVote(s);
        if (stage === "vote") {
          // Run the game on, with nobody acting, until a vote opens; some guests then cast ballots.
          for (let i = 0; i < 80 && s.phase !== "vote" && s.phase !== "lastDance"; i++) s = (apply(s, { type: "tick" }, s.deadline!) as { state: GameState }).state;
          for (let k = 0; k < steps && s.phase === "vote"; k++) {
            const a = apply(s, { type: "vote", guest: `g${k % n}`, choice: k % 2 ? "mercy" : "greed" }, s.deadline! - 1000);
            if (a.ok) s = a.state;
          }
          if (steps > 3 && s.phase === "vote") s = (apply(s, { type: "tick" }, s.deadline!) as { state: GameState }).state;
        }
        if (stage === "dance" || stage === "cellar") {
          s = tick(s);
          // Some guests answer, and the clock runs on a few steps.
          for (let k = 0; k < steps; k++) {
            const m = (s.match ?? s.auction ?? s.pledge ?? s.pick)!;
            const guest = `g${k % n}`;
            const act: Action = s.pick
              ? { type: "pick", guest, number: 1 + (k % 6) }
              : s.pledge
              ? s.pledge.stage === "reckon" ? { type: "reckon", guest, choice: k % 2 ? "pocket" : "share" } : { type: "pledge", guest, amount: (k * 7) % 11 }
              : s.auction ? { type: "bid", guest, amount: (k * 7) % 51 } : { type: "answer", guest, position: k % 4 };
            const a = apply(s, act, m.stepStartedAt + 1000);
            if (a.ok) s = a.state;
            if (k % 2) s = tick(s);
          }
        }
        if (stage === "cellar") {
          // Run the Dance out, through being sent down, into the Cellar game with a few answers in.
          while (s.phase !== "cellar") s = tick(s);
          for (let k = 0; k < steps; k++) {
            const running = s.cellar!.pick ?? s.cellar!.race!;
            const who = s.cellar!.guests[k % s.cellar!.guests.length]!;
            const a = apply(s, s.cellar!.pick ? { type: "pick", guest: who, number: 1 + (k % 6) } : { type: "answer", guest: who, position: k % 4 }, running.stepStartedAt + 1000);
            if (a.ok) s = a.state;
            if (k % 2) s = tick(s);
          }
        }
      }
      return s;
    });
}

export function expectNoLeak(opts: { extra?: LeakCase[] } = {}): void {
  for (const c of [...CASES, ...(opts.extra ?? [])]) {
    fc.assert(
      fc.property(arbState(), fc.integer(), fc.nat(), fc.nat(), (state, value, ai, bi) => {
        fc.pre(state.guests.length >= 2 && (!c.phases || c.phases.includes(state.phase)));
        const a = state.guests[ai % state.guests.length]!;
        const b = state.guests[(ai + 1 + (bi % (state.guests.length - 1))) % state.guests.length]!;
        const changed: GameState = c.setState
          ? c.setState(state, b.id, value, a.id)
          : { ...state, guests: state.guests.map((g) => (g.id === b.id ? c.set!(g, value) : g)) };
        expect(viewFor(changed, a.id), c.name).toEqual(viewFor(state, a.id));
      }),
    );
  }
}
