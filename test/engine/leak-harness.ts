import fc from "fast-check";
import { expect } from "vitest";
import { apply, newGame, viewFor } from "../../src/engine/game";
import type { GameState, GuestRecord } from "../../src/shared/types";

/**
 * Leak-test harness. Each case names one piece of a guest's private data and
 * how to overwrite it. The property: changing only guest B's private data
 * never changes guest A's view. Later tickets add their cases to `CASES`.
 */
export interface LeakCase {
  name: string;
  /** Returns the guest record with the private datum replaced by `value`. */
  set: (guest: GuestRecord, value: number) => GuestRecord;
}

export const CASES: LeakCase[] = [{ name: "joinedAt", set: (g, v) => ({ ...g, joinedAt: v }) }];

function arbState(): fc.Arbitrary<GameState> {
  return fc.record({ seed: fc.integer(), n: fc.integer({ min: 2, max: 10 }), started: fc.boolean() }).map(({ seed, n, started }) => {
    let s = newGame(seed);
    for (let i = 0; i < n; i++) {
      const r = apply(s, { type: "join", guest: `g${i}`, name: `G${i}` }, i);
      if (r.ok) s = r.state;
    }
    if (started && n >= 4) {
      const r = apply(s, { type: "start", guest: "g0" }, 0);
      if (r.ok) s = r.state;
    }
    return s;
  });
}

export function expectNoLeak(opts: { extra?: LeakCase[] } = {}): void {
  for (const c of [...CASES, ...(opts.extra ?? [])]) {
    fc.assert(
      fc.property(arbState(), fc.integer(), fc.nat(), fc.nat(), (state, value, ai, bi) => {
        const a = state.guests[ai % state.guests.length]!;
        const b = state.guests[(ai + 1 + (bi % (state.guests.length - 1))) % state.guests.length]!;
        const changed: GameState = { ...state, guests: state.guests.map((g) => (g.id === b.id ? c.set(g, value) : g)) };
        expect(viewFor(changed, a.id), c.name).toEqual(viewFor(state, a.id));
      }),
    );
  }
}
