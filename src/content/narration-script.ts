import { LIBRARY } from "./library";
import { NARRATOR, OVERTURE } from "./narrator";

/**
 * The Narrator's script as the content build sees it: every line to be spoken, a manifest per generated file,
 * and the plan that decides what the API must (re)generate. Pure; `scripts/build-narration.mjs` does the I/O.
 */

export interface ScriptLine {
  /** The file's name, without extension; also the audio the client asks for. */
  id: string;
  text: string;
}

/** The voice and settings every file is generated with, kept in each file's manifest. */
export const NARRATION_SETTINGS = {
  provider: "Fish Audio",
  model: "s1",
  voice: "Master Computer",
  style: "Drama 3",
  format: "wav",
  aiGenerated: true,
} as const;

/** What is kept beside each WAV master: how it was made, so a take can be told from a stale one. */
export interface Manifest {
  id: string;
  script: string;
  model: string;
  voice: string;
  /** The voice's id at the provider; the key is never kept. */
  voiceId: string;
  settings: Record<string, unknown>;
  scriptHash: string;
}

/** Every line to speak: the Overture, each Narrator line in full and short, and every beat of every Prelude. */
export function narrationScript(): ScriptLine[] {
  const lines: ScriptLine[] = [{ id: "overture", text: OVERTURE.text }];
  for (const [id, line] of Object.entries(NARRATOR)) {
    lines.push({ id: `line-${id}-first`, text: line.first }, { id: `line-${id}-short`, text: line.short });
  }
  for (const def of LIBRARY) def.prelude.forEach((beat, i) => lines.push({ id: `prelude-${def.id}-${i + 1}`, text: beat.caption }));
  return lines;
}

/** A small stable hash (FNV-1a) of what a take was made from. */
export function hashOf(...parts: string[]): string {
  let h = 0x811c9dc5;
  for (const c of parts.join("\u0000")) h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export const manifestFor = (line: ScriptLine, voiceId: string): Manifest => ({
  id: line.id,
  script: line.text,
  model: NARRATION_SETTINGS.model,
  voice: NARRATION_SETTINGS.voice,
  voiceId,
  settings: { style: NARRATION_SETTINGS.style, format: NARRATION_SETTINGS.format, provider: NARRATION_SETTINGS.provider },
  scriptHash: hashOf(line.text, NARRATION_SETTINGS.model, NARRATION_SETTINGS.voice, NARRATION_SETTINGS.style, voiceId),
});

/** What is on disk for one line. */
export interface Existing {
  manifest: Manifest | null;
  wav: boolean;
  opus: boolean;
  aac: boolean;
}

export interface BuildPlan {
  /** Lines the API must speak: no master, or its manifest is not this script's. */
  generate: ScriptLine[];
  /** Lines whose master is current but whose Opus or AAC is missing: encoded again, no API. */
  encode: ScriptLine[];
  current: ScriptLine[];
}

export function planBuild(lines: ScriptLine[], voiceId: string, onDisk: (id: string) => Existing): BuildPlan {
  const plan: BuildPlan = { generate: [], encode: [], current: [] };
  for (const line of lines) {
    const have = onDisk(line.id);
    const fresh = have.wav && have.manifest?.scriptHash === manifestFor(line, voiceId).scriptHash;
    if (!fresh) plan.generate.push(line);
    else if (!have.opus || !have.aac) plan.encode.push(line);
    else plan.current.push(line);
  }
  return plan;
}
