import { describe, expect, it } from "vitest";
import { apply, newGame, viewFor } from "../../src/engine/game";
import { NARRATOR, OVERTURE } from "../../src/content/narrator";
import { LIBRARY } from "../../src/content/library";
import { CUES, IN_PERSON_CUE_VOLUME, cueVolume, cuesBetween, musicAudible, narrationAudible, soundRole, type CueId } from "../../src/shared/sound";
import type { Action, GameState, GuestView } from "../../src/shared/types";

function must(state: GameState, action: Action, now = 0): GameState {
  const r = apply(state, action, now);
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  return r.state;
}
function started(): GameState {
  let s = newGame(11);
  for (let i = 0; i < 4; i++) s = must(s, { type: "join", guest: `g${i}`, name: `Guest ${i}` }, i);
  s = must(s, { type: "setInPerson", guest: "g2", inPerson: true });
  return must(s, { type: "start", guest: "g0" }, 10);
}
const ids = Object.keys(CUES) as CueId[];

describe("sound routing", () => {
  it("makes the Host's phone the Speaker, in-person guests silent, and every other guest remote", () => {
    const s = started();
    expect(soundRole(viewFor(s, "g0")!)).toBe("speaker");
    expect(soundRole(viewFor(s, "g2")!)).toBe("inPerson");
    expect(soundRole(viewFor(s, "g1")!)).toBe("remote");
  });

  it("keeps the Host a Speaker even with the switch on", () => {
    const s = must(started(), { type: "setInPerson", guest: "g0", inPerson: true }, 11);
    expect(soundRole(viewFor(s, "g0")!)).toBe("speaker");
  });

  it("plays public cues aloud on the Speaker and remote phones and at 40% on an in-person guest's", () => {
    for (const id of ids.filter((c) => CUES[c].kind === "public")) {
      expect(cueVolume("speaker", id)).toBe(1);
      expect(cueVolume("remote", id)).toBe(1);
      expect(cueVolume("inPerson", id)).toBe(IN_PERSON_CUE_VOLUME);
    }
    expect(IN_PERSON_CUE_VOLUME).toBeCloseTo(0.4);
  });

  it("never plays a private cue on the Speaker's phone, and plays it at 40% in person", () => {
    for (const id of ids.filter((c) => CUES[c].kind === "private")) {
      expect(cueVolume("speaker", id)).toBe(0);
      expect(cueVolume("remote", id)).toBe(1);
      expect(cueVolume("inPerson", id)).toBe(IN_PERSON_CUE_VOLUME);
    }
  });

  it("keeps the gift cue visual only, for everyone", () => {
    expect(CUES.gift.kind).toBe("visual");
    for (const role of ["speaker", "inPerson", "remote"] as const) expect(cueVolume(role, "gift")).toBe(0);
  });

  it("has public cues for Dance start, lights out, sent down, the vote and unmasking, and private ones for a right answer and favours received", () => {
    for (const c of ["danceStart", "lightsOut", "sentDown", "vote", "unmasking"] as const) expect(CUES[c].kind).toBe("public");
    for (const c of ["rightAnswer", "favoursReceived"] as const) expect(CUES[c].kind).toBe("private");
  });

  it("shows the moment the music stops on screen too", () => {
    expect(CUES.musicStop.onScreen).toBe(true);
  });

  it("plays music and narration only on the Speaker and remote phones", () => {
    expect(musicAudible("speaker")).toBe(true);
    expect(musicAudible("remote")).toBe(true);
    expect(musicAudible("inPerson")).toBe(false);
    const s = started();
    const mingle = viewFor(s, "g0")!;
    expect(mingle.narrator).not.toBeNull();
    expect(narrationAudible("speaker", mingle)).toBe(true);
    expect(narrationAudible("remote", mingle)).toBe(true);
    expect(narrationAudible("inPerson", mingle)).toBe(false);
  });

  it("has the Speaker skip a line meant for some guests only, which the guests it is for play on their own phones", () => {
    const view = { ...viewFor(started(), "g1")!, narrator: { id: "sentDown", first: true, text: "x", startedAt: 0, seconds: 1, everyone: false } } as GuestView;
    expect(narrationAudible("speaker", view)).toBe(false);
    expect(narrationAudible("remote", view)).toBe(true);
  });

  it("stays quiet over an unmasking and the Jury vote's reveal", () => {
    const base = viewFor(started(), "g1")!;
    const line = { id: "unmasking", first: true, text: "x", startedAt: 0, seconds: 1, everyone: true } as const;
    expect(narrationAudible("remote", { ...base, phase: "unmasking", narrator: line } as unknown as GuestView)).toBe(false);
    expect(narrationAudible("remote", { ...base, phase: "lastDance", stage: "reveal", narrator: line } as unknown as GuestView)).toBe(false);
    expect(narrationAudible("remote", { ...base, phase: "lastDance", stage: "intro", narrator: line } as unknown as GuestView)).toBe(true);
  });

  it("derives cues from the change between two views", () => {
    const mingle = viewFor(started(), "g1")!;
    const cue = (patch: object, from: object = mingle) => cuesBetween(from as GuestView, { ...mingle, ...patch } as GuestView);
    expect(cue({ phase: "dance" })).toContain("danceStart");
    expect(cue({ phase: "sentDown", payout: { g1: 3 } })).toEqual(["sentDown", "favoursReceived"]);
    expect(cue({ phase: "sentDown", payout: { g1: -2 } })).toEqual(["sentDown"]);
    expect(cue({ phase: "unmasking" })).toContain("unmasking");
    expect(cue({ phase: "lastDance", stage: "vote" })).toContain("vote");
    expect(cue({ phase: "lastDance", stage: "reveal" })).toContain("unmasking");
    expect(cue({ phase: "dance", step: { stage: "answer", lightsOut: true, reveal: null } }, { ...mingle, phase: "dance", step: { stage: "study", lightsOut: false, reveal: null } })).toContain("lightsOut");
    expect(cue({ phase: "dance", step: { stage: "reveal", lightsOut: false, reveal: { yourResult: "right" } } }, { ...mingle, phase: "dance", step: { stage: "answer", lightsOut: false, reveal: null } })).toContain("rightAnswer");
    expect(cue({ phase: "mingle", favours: 12 }, { ...mingle, phase: "mingle", favours: 10 })).toEqual(["gift"]);
    expect(cue({ phase: "mingle" })).toEqual([]);
  });
});

describe("what the Narrator says", () => {
  // Ana, Ben and Cy are the made-up guests of a Prelude's worked example, not guests of the game.
  const made = /\b(Ana|Ben|Cy)\b/g;
  const lines = [OVERTURE.text, ...Object.values(NARRATOR).flatMap((l) => [l.first, l.short])];
  const names = ["Guest 0", "Guest 1", "Guest 2", "Guest 3"];

  it("never names a guest in a scene-setting line", () => {
    for (const l of lines) {
      expect(l).not.toMatch(made);
      for (const n of names) expect(l).not.toContain(n);
    }
  });

  it("names only the made-up guests in a Prelude", () => {
    const allowed = new Set(["Ana", "Ben", "Cy"]);
    for (const m of LIBRARY) for (const beat of m.prelude) {
      expect(beat.caption.replace(made, "")).not.toMatch(/\b(Guest|Dana|Eli)\b/);
      for (const n of beat.caption.match(made) ?? []) expect(allowed.has(n)).toBe(true);
    }
  });
});
