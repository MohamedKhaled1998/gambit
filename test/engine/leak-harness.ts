import fc from "fast-check";
import { expect } from "vitest";
import { apply, newGame, nextDeadline, viewFor } from "../../src/engine/game";
import type { GameState, GuestId, GuestRecord, RaceState } from "../../src/shared/types";

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
    name: "a card before it is called",
    phases: ["dance"],
    setState: (s, id, v) => {
      const b = s.bluff;
      if (!b || !(id in b.points)) return s;
      const cards = b.cards.map((row, i) => (i === b.step ? { ...row, [id]: (Math.abs(v) % 9) + 1 } : row));
      // A card is public only when the guest was called at the reveal.
      const calledNow = b.stage === "reveal" && Object.values(b.calls).includes(id);
      return calledNow ? s : { ...s, bluff: { ...b, cards } };
    },
  },
  {
    name: "a call before the reveal",
    phases: ["dance"],
    setState: (s, id, v) => {
      const b = s.bluff;
      if (!b || b.stage === "reveal" || !(id in b.points)) return s;
      const ids = Object.keys(b.points).filter((g) => g !== id);
      return { ...s, bluff: { ...b, calls: { ...b.calls, [id]: v % 3 === 0 ? null : ids[Math.abs(v) % ids.length]! } } };
    },
  },
  {
    name: "an unmasked guest's play-along answer or bid",
    phases: ["dance", "cellar", "lastDance"],
    // The Balcony shares its ranking among the unmasked guests, so only a remaining guest must not see it.
    setState: (s, id, v, observer) => {
      const a = s.along;
      if (!a || !(id in a.match.points) || s.guests.find((g) => g.id === observer)!.unmaskedIn !== undefined) return s;
      const m = a.match;
      const points = { ...m.points, [id]: Math.abs(v) % 90 };
      if ("answers" in m) return { ...s, along: { ...a, match: { ...m, points, answers: { ...m.answers, [id]: { position: Math.abs(v) % 4, at: m.stepStartedAt + 1 } } } } };
      return { ...s, along: { ...a, match: { ...m, points } } };
    },
  },
  {
    name: "an unmasked guest's Cellar game picks",
    // Picks are live on the Balcony; only a remaining guest must not see them, until the end screen.
    setState: (s, id, v, observer) => {
      const last = s.predictions.at(-1);
      if (!last || over(s) || s.guests.find((g) => g.id === observer)!.unmaskedIn !== undefined) return s;
      const picks = { ...last.picks, [id]: last.cellar.slice(0, 1 + (Math.abs(v) % last.unmaskings)) };
      return { ...s, predictions: [...s.predictions.slice(0, -1), { ...last, picks }] };
    },
  },
  {
    name: "a juror's Last Dance prediction",
    // Picks are live on the Balcony; a remaining guest sees them only on the end screen.
    phases: ["lastDance"],
    setState: (s, id, v, observer) => {
      const ld = s.lastDance!;
      if (over(s) || s.guests.find((g) => g.id === observer)!.unmaskedIn !== undefined || s.guests.find((g) => g.id === id)!.unmaskedIn === undefined) return s;
      return { ...s, lastDance: { ...ld, picks: { ...ld.picks, [id]: ld.finalists[Math.abs(v) % 2]! } } };
    },
  },
  {
    name: "a juror's ballot before the reveal",
    phases: ["lastDance"],
    setState: (s, id, v) => {
      const ld = s.lastDance!;
      if (ld.stage !== "vote" || !ld.jurors.includes(id)) return s;
      return { ...s, lastDance: { ...ld, ballots: { ...ld.ballots, [id]: ld.finalists[Math.abs(v) % 2]! } } };
    },
  },
  { name: "joinedAt", set: (g, v) => ({ ...g, joinedAt: v }) },
  // Favours are private until guests are sent down.
  { name: "favours", phases: ["mingle", "dance", "cellar"], set: (g, v) => ({ ...g, favours: Math.abs(v) % 40 }) },
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
    phases: ["dance", "cellar", "lastDance"],
    setState: (s, id, v) =>
      onRace(s, id, (m) =>
        m.stage !== "answer" ? m : { ...m, answers: { ...m.answers, [id]: { position: Math.abs(v) % 4, at: m.stepStartedAt + (Math.abs(v) % 10_000) } } },
      ),
  },
  {
    name: "choice layout",
    phases: ["dance", "cellar", "lastDance"],
    setState: (s, id, v) =>
      onRace(s, id, (m) => ({ ...m, layouts: { ...m.layouts, [id]: m.layouts[id]!.map((l) => (Math.abs(v) % 2 ? [...l].reverse() : l)) } })),
  },
];

/** The game is over: predictions and ballots are public. */
const over = (s: GameState) => s.phase === "lastDance" && (s.lastDance!.stage === "ended" || s.lastDance!.stage === "deleted");

/** Changes the running match (the Dance or the Cellar game) when the guest plays in it. */
function onRace(s: GameState, id: GuestId, change: (m: RaceState) => RaceState): GameState {
  if (s.phase === "lastDance") {
    const race = s.lastDance!.race;
    return race && s.lastDance!.stage === "match" && id in race.points ? { ...s, lastDance: { ...s.lastDance!, race: change(race) } } : s;
  }
  const race = s.phase === "cellar" ? s.cellar!.race : s.match;
  if (!race || !(id in race.points)) return s;
  const next = change(race);
  return s.phase === "cellar" ? { ...s, cellar: { ...s.cellar!, race: next } } : { ...s, match: next };
}

export function arbState(): fc.Arbitrary<GameState> {
  return fc
    .record({ seed: fc.integer(), n: fc.integer({ min: 2, max: 10 }), stage: fc.constantFrom("foyer", "mingle", "dance", "cellar", "later", "last"), steps: fc.integer({ min: 0, max: 6 }), ticks: fc.integer({ min: 0, max: 42 }) })
    .map(({ seed, n, stage, steps, ticks }) => {
      let s = newGame(seed);
      for (let i = 0; i < n; i++) {
        const r = apply(s, { type: "join", guest: `g${i}`, name: `G${i}` }, i);
        if (r.ok) s = r.state;
      }
      if (stage !== "foyer" && n >= 4) {
        const r = apply(s, { type: "start", guest: "g0" }, 0);
        if (r.ok) s = r.state;
        if (stage === "later") {
          // Round 1 runs out, so some guests are unmasked and play along in round 2's Dance or the sent-down screen.
          while (s.round < 2 || s.phase === "mingle") {
            const m = s.match ?? s.cellar?.race;
            if (m && (s.phase === "dance" || s.phase === "cellar")) {
              const g = s.phase === "dance" ? `g${steps % n}` : s.cellar!.guests[0]!;
              const a = apply(s, { type: "answer", guest: g, position: steps % 4 }, m.stepStartedAt + 1000);
              if (a.ok) s = a.state;
            }
            s = (apply(s, { type: "tick" }, nextDeadline(s)!) as { state: GameState }).state;
          }
          for (let k = 0; k < steps; k++) {
            const a = s.along?.match;
            const g = s.guests.filter((x) => x.unmaskedIn !== undefined)[k % Math.max(1, s.guests.filter((x) => x.unmaskedIn !== undefined).length)];
            if (a && g && "answers" in a) {
              const r = apply(s, { type: "answer", guest: g.id, position: k % 4 }, a.stepStartedAt + 500);
              if (r.ok) s = r.state;
            }
            s = (apply(s, { type: "tick" }, nextDeadline(s)!) as { state: GameState }).state;
          }
        }
        if (stage === "last") {
          // Run the game out to the Last Dance, then on through some of its stages; jurors pick and vote when they can.
          while (s.phase !== "lastDance") s = (apply(s, { type: "tick" }, nextDeadline(s)!) as { state: GameState }).state;
          const jurors = s.guests.filter((x) => x.unmaskedIn !== undefined).map((x) => x.id);
          for (const j of jurors) {
            const r = apply(s, { type: "predict", guest: j, picks: [s.lastDance!.finalists[steps % 2]!] }, 0);
            if (r.ok) s = r.state;
          }
          for (let k = 0; k < ticks; k++) {
            if (s.lastDance!.stage === "vote")
              for (const j of jurors) {
                const r = apply(s, { type: "vote", guest: j, finalist: s.lastDance!.finalists[(steps + k) % 2]! }, s.deadline! - 1000);
                if (r.ok) s = r.state;
              }
            s = (apply(s, { type: "tick" }, nextDeadline(s)!) as { state: GameState }).state;
          }
        }
        if (stage === "dance" || stage === "cellar") {
          s = (apply(s, { type: "tick" }, s.deadline!) as { state: GameState }).state;
          // Some guests answer, and the clock runs on a few steps.
          for (let k = 0; k < steps; k++) {
            const m = (s.match ?? s.auction ?? s.bluff)!;
            const guest = `g${k % n}`;
            const a = apply(s, s.bluff ? (s.bluff.stage === "claim" ? { type: "claim", guest, value: (k % 9) + 1 } : { type: "call", guest, target: k % 3 ? `g${(k + 1) % n}` : null }) : s.auction ? { type: "bid", guest: `g${k % n}`, amount: (k * 7) % 51 } : { type: "answer", guest: `g${k % n}`, position: k % 4 }, m.stepStartedAt + 1000);
            if (a.ok) s = a.state;
            if (k % 2) s = (apply(s, { type: "tick" }, s.deadline!) as { state: GameState }).state;
          }
        }
        if (stage === "cellar") {
          // Run the Dance out, through being sent down, into the Cellar game with a few answers in.
          while (s.phase !== "cellar") s = (apply(s, { type: "tick" }, s.deadline!) as { state: GameState }).state;
          for (let k = 0; k < steps; k++) {
            const race = s.cellar!.race!;
            const a = apply(s, { type: "answer", guest: s.cellar!.guests[k % s.cellar!.guests.length]!, position: k % 4 }, race.stepStartedAt + 1000);
            if (a.ok) s = a.state;
            if (k % 2) s = (apply(s, { type: "tick" }, s.deadline!) as { state: GameState }).state;
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
