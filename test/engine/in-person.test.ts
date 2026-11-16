import { describe, expect, it } from "vitest";
import { apply, newGame, viewFor } from "../../src/engine/game";
import type { Action, GameState } from "../../src/shared/types";

function must(state: GameState, action: Action, now = 0): GameState {
  const r = apply(state, action, now);
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  return r.state;
}
function foyerWith(n: number): GameState {
  let s = newGame(7);
  for (let i = 0; i < n; i++) s = must(s, { type: "join", guest: `g${i}`, name: `Guest ${i}` }, i);
  return s;
}

describe("the in-person switch", () => {
  it("starts off for every guest", () => {
    const s = foyerWith(4);
    expect(viewFor(s, "g1")!.inPerson).toBe(false);
  });

  it("is set in the Foyer and shown only to the guest who set it", () => {
    let s = foyerWith(4);
    s = must(s, { type: "setInPerson", guest: "g1", inPerson: true });
    expect(viewFor(s, "g1")!.inPerson).toBe(true);
    expect(viewFor(s, "g2")!.inPerson).toBe(false);
    expect(JSON.stringify(viewFor(s, "g2"))).not.toContain("inPerson\":true");
  });

  it("can be changed any time in the game, and back", () => {
    let s = foyerWith(4);
    s = must(s, { type: "setInPerson", guest: "g2", inPerson: true });
    s = must(s, { type: "start", guest: "g0" }, 10);
    expect(viewFor(s, "g2")!.inPerson).toBe(true);
    s = must(s, { type: "setInPerson", guest: "g2", inPerson: false }, 20);
    expect(viewFor(s, "g2")!.inPerson).toBe(false);
    s = must(s, { type: "setInPerson", guest: "g2", inPerson: true }, 30);
    expect(viewFor(s, "g2")!.inPerson).toBe(true);
  });

  it("is rejected for a guest who isn't seated", () => {
    const r = apply(foyerWith(4), { type: "setInPerson", guest: "nobody", inPerson: true }, 0);
    expect(r).toEqual({ ok: false, reason: "no such guest" });
  });
});
