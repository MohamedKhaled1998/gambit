import fc from "fast-check";
import { expect } from "vitest";
import { apply, newGame, viewFor } from "../../src/engine/game";
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
  setState?: (state: GameState, guest: GuestId, value: number) => GameState;
  /** Only the states in these phases are tried; all by default. */
  phases?: GameState["phase"][];
}

export const CASES: LeakCase[] = [
  { name: "joinedAt", set: (g, v) => ({ ...g, joinedAt: v }) },
  // Favours are private until guests are sent down.
  { name: "favours", phases: ["mingle", "dance", "cellar"], set: (g, v) => ({ ...g, favours: Math.abs(v) % 40 }) },
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
  const race = s.phase === "cellar" ? s.cellar!.race! : s.match!;
  if (!(id in race.points)) return s;
  const next = change(race);
  return s.phase === "cellar" ? { ...s, cellar: { ...s.cellar!, race: next } } : { ...s, match: next };
}

function arbState(): fc.Arbitrary<GameState> {
  return fc
    .record({ seed: fc.integer(), n: fc.integer({ min: 2, max: 10 }), stage: fc.constantFrom("foyer", "mingle", "dance", "cellar"), steps: fc.integer({ min: 0, max: 6 }) })
    .map(({ seed, n, stage, steps }) => {
      let s = newGame(seed);
      for (let i = 0; i < n; i++) {
        const r = apply(s, { type: "join", guest: `g${i}`, name: `G${i}` }, i);
        if (r.ok) s = r.state;
      }
      if (stage !== "foyer" && n >= 4) {
        const r = apply(s, { type: "start", guest: "g0" }, 0);
        if (r.ok) s = r.state;
        if (stage === "dance" || stage === "cellar") {
          s = (apply(s, { type: "tick" }, s.deadline!) as { state: GameState }).state;
          // Some guests answer, and the clock runs on a few steps.
          for (let k = 0; k < steps; k++) {
            const m = s.match!;
            const a = apply(s, { type: "answer", guest: `g${k % n}`, position: k % 4 }, m.stepStartedAt + 1000);
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
          ? c.setState(state, b.id, value)
          : { ...state, guests: state.guests.map((g) => (g.id === b.id ? c.set!(g, value) : g)) };
        expect(viewFor(changed, a.id), c.name).toEqual(viewFor(state, a.id));
      }),
    );
  }
}
