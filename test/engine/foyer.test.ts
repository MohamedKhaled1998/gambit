import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CODE_LENGTH, CODE_LETTERS, makeInvitationCode, normaliseInvitationCode } from "../../src/engine/codes";
import { apply, chatAccess, doorsOpen, newGame, nextDeadline, viewFor } from "../../src/engine/game";
import type { Action, GameState } from "../../src/shared/types";
import { expectNoLeak } from "./leak-harness";

function must(state: GameState, action: Action, now = 0): GameState {
  const r = apply(state, action, now);
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  return r.state;
}
function foyerWith(n: number): GameState {
  let s = newGame(42);
  for (let i = 0; i < n; i++) s = must(s, { type: "join", guest: `g${i}`, name: `Guest ${i}` }, i);
  return s;
}

describe("Invitation codes", () => {
  it("are five letters without look-alikes", () => {
    for (const bad of "ILOB01S58Z2") expect(CODE_LETTERS).not.toContain(bad);
    fc.assert(
      fc.property(fc.integer(), (n) => {
        let x = n;
        const code = makeInvitationCode(() => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32));
        expect(code).toHaveLength(CODE_LENGTH);
        expect(normaliseInvitationCode(code)).toBe(code);
      }),
    );
  });
  it("are read case-insensitively and rejected when malformed", () => {
    expect(normaliseInvitationCode(" acdef ")).toBe("ACDEF");
    expect(normaliseInvitationCode("ACDE")).toBeNull();
    expect(normaliseInvitationCode("ACDEO")).toBeNull();
  });
});

describe("the Foyer", () => {
  it("makes the first guest to arrive the Host", () => {
    const s = foyerWith(2);
    expect(s.host).toBe("g0");
    expect(viewFor(s, "g1")?.host).toBe("g0");
  });

  it("shows every guest, as masks and names, in every guest's view", () => {
    const s = foyerWith(3);
    for (const g of ["g0", "g1", "g2"]) {
      const v = viewFor(s, g)!;
      expect(v.guests.map((x) => x.name)).toEqual(["Guest 0", "Guest 1", "Guest 2"]);
      expect(v.guests.every((x) => x.mask.colour && x.mask.shape)).toBe(true);
      expect(v.you).toBe(g);
    }
  });

  it("gives each guest a different mask", () => {
    const masks = foyerWith(10).guests.map((g) => `${g.mask.colour}/${g.mask.shape}`);
    expect(new Set(masks).size).toBe(10);
  });

  it("gives the same masks to the same seed", () => {
    expect(foyerWith(5).guests.map((g) => g.mask)).toEqual(foyerWith(5).guests.map((g) => g.mask));
  });

  it("needs a name of 1-20 characters", () => {
    const s = newGame(1);
    expect(apply(s, { type: "join", guest: "a", name: "   " }, 0)).toEqual({ ok: false, reason: "name needed" });
    expect(apply(s, { type: "join", guest: "a", name: "x".repeat(21) }, 0)).toEqual({ ok: false, reason: "name too long" });
    expect(must(s, { type: "join", guest: "a", name: "  Ana " }).guests[0]?.name).toBe("Ana");
  });

  it("holds at most 10 guests", () => {
    expect(apply(foyerWith(10), { type: "join", guest: "x", name: "X" }, 0)).toEqual({ ok: false, reason: "the Foyer is full" });
  });

  it("lets only the Host remove a guest", () => {
    const s = foyerWith(3);
    expect(apply(s, { type: "removeGuest", guest: "g1", target: "g2" }, 0)).toEqual({ ok: false, reason: "only the Host can do that" });
    const after = must(s, { type: "removeGuest", guest: "g0", target: "g2" });
    expect(viewFor(after, "g1")!.guests.map((g) => g.id)).toEqual(["g0", "g1"]);
    expect(viewFor(after, "g2")).toBeNull();
  });

  it("won't remove the Host or a stranger", () => {
    const s = foyerWith(3);
    expect(apply(s, { type: "removeGuest", guest: "g0", target: "g0" }, 0)).toEqual({ ok: false, reason: "the Host can't be removed" });
    expect(apply(s, { type: "removeGuest", guest: "g0", target: "zz" }, 0)).toEqual({ ok: false, reason: "no such guest" });
  });

  it("starts only with 4-10 guests and only from the Host", () => {
    expect(apply(foyerWith(3), { type: "start", guest: "g0" }, 0)).toEqual({ ok: false, reason: "need 4-10 guests to start" });
    expect(apply(foyerWith(4), { type: "start", guest: "g1" }, 0)).toEqual({ ok: false, reason: "only the Host can do that" });
    for (const n of [4, 7, 10]) expect(must(foyerWith(n), { type: "start", guest: "g0" }).phase).toBe("mingle");
  });

  it("tells the Host whether the start button is enabled", () => {
    expect(viewFor(foyerWith(3), "g0")).toMatchObject({ phase: "foyer", canStart: false });
    expect(viewFor(foyerWith(4), "g0")).toMatchObject({ phase: "foyer", canStart: true });
    expect(viewFor(foyerWith(4), "g1")).toMatchObject({ canStart: false });
  });

  it("tells only the Host that guests can be removed", () => {
    expect(viewFor(foyerWith(2), "g0")).toMatchObject({ canRemove: true });
    expect(viewFor(foyerWith(2), "g1")).toMatchObject({ canRemove: false });
  });

  it("keeps the doors open until the game starts", () => {
    expect(doorsOpen(foyerWith(4))).toBe(true);
    expect(doorsOpen(must(foyerWith(4), { type: "start", guest: "g0" }))).toBe(false);
  });

  it("closes the doors and fixes the seats when the game starts", () => {
    const started = must(foyerWith(4), { type: "start", guest: "g0" });
    expect(apply(started, { type: "join", guest: "late", name: "Late" }, 0)).toEqual({ ok: false, reason: "doors are closed" });
    expect(apply(started, { type: "removeGuest", guest: "g0", target: "g1" }, 0)).toEqual({ ok: false, reason: "the game has started" });
    expect(apply(started, { type: "start", guest: "g0" }, 0)).toEqual({ ok: false, reason: "the game has started" });
    expect(viewFor(started, "g2")).toMatchObject({ phase: "mingle", you: "g2" });
    expect(viewFor(started, "g2")!.guests).toHaveLength(4);
  });

  it("won't seat the same guest twice", () => {
    expect(apply(foyerWith(2), { type: "join", guest: "g0", name: "Again" }, 0)).toEqual({ ok: false, reason: "already joined" });
  });

  it("has no deadline and no chats in the Foyer, and a tick changes nothing", () => {
    const s = foyerWith(4);
    expect(nextDeadline(s)).toBeNull();
    expect(chatAccess(s, "g0")).toEqual([]);
    expect(must(s, { type: "tick" }, 5)).toEqual(s);
  });

  it("does not mutate the state it is given", () => {
    const s = foyerWith(4);
    const copy = structuredClone(s);
    apply(s, { type: "start", guest: "g0" }, 0);
    apply(s, { type: "join", guest: "n", name: "N" }, 0);
    expect(s).toEqual(copy);
  });
});

describe("leaks", () => {
  it("never show guest A anything that changes only with guest B's private data", () => {
    expectNoLeak();
  });
  it("the harness notices when public data changes", () => {
    expect(() => expectNoLeak({ extra: [{ name: "name", set: (g, v) => ({ ...g, name: String(v) || "x" }) }] })).toThrow();
  });
});
