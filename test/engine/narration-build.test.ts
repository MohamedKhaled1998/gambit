import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../src/content/library";
import { NARRATOR } from "../../src/content/narrator";
import { manifestFor, narrationScript, planBuild, type Existing } from "../../src/content/narration-script";

const done = (script = narrationScript()): Map<string, Existing> =>
  new Map(script.map((l) => [l.id, { manifest: manifestFor(l, "voice-1"), wav: true, opus: true, aac: true }]));
const lookup = (m: Map<string, Existing>) => (id: string): Existing => m.get(id) ?? { manifest: null, wav: false, opus: false, aac: false };

describe("the narration content build", () => {
  it("scripts the Overture, every Narrator line and every Prelude beat, each with its own file", () => {
    const script = narrationScript();
    const ids = script.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("overture");
    for (const id of Object.keys(NARRATOR)) expect(ids).toEqual(expect.arrayContaining([`line-${id}-first`, `line-${id}-short`]));
    for (const def of LIBRARY) for (let i = 1; i <= def.prelude.length; i++) expect(ids).toContain(`prelude-${def.id}-${i}`);
  });

  it("generates every line when nothing is built yet", () => {
    const plan = planBuild(narrationScript(), "voice-1", lookup(new Map()));
    expect(plan.generate).toHaveLength(narrationScript().length);
  });

  it("does nothing, and so needs no API, when every file is up to date", () => {
    const plan = planBuild(narrationScript(), "voice-1", lookup(done()));
    expect(plan.generate).toEqual([]);
    expect(plan.encode).toEqual([]);
  });

  it("regenerates only a line whose script changed", () => {
    const script = narrationScript();
    const files = done(script);
    const changed = script.map((l, i) => (i === 3 ? { ...l, text: l.text + " Do." } : l));
    const plan = planBuild(changed, "voice-1", lookup(files));
    expect(plan.generate.map((l) => l.id)).toEqual([script[3]!.id]);
  });

  it("regenerates everything when the voice changes", () => {
    expect(planBuild(narrationScript(), "voice-2", lookup(done())).generate).toHaveLength(narrationScript().length);
  });

  it("re-encodes from the WAV master, without the API, when an Opus or AAC file is missing", () => {
    const script = narrationScript();
    const files = done(script);
    files.set(script[0]!.id, { ...files.get(script[0]!.id)!, aac: false });
    const plan = planBuild(script, "voice-1", lookup(files));
    expect(plan.generate).toEqual([]);
    expect(plan.encode.map((l) => l.id)).toEqual([script[0]!.id]);
  });

  it("keeps the script, model, voice and settings in each file's manifest, and never the API key", () => {
    const m = manifestFor(narrationScript()[0]!, "voice-1");
    expect(m).toMatchObject({ model: "s1", voice: "Master Computer", voiceId: "voice-1", settings: { style: "Drama 3" } });
    expect(JSON.stringify(m)).not.toMatch(/key|token|secret/i);
  });
});
