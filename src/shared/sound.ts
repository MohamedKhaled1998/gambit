import type { GuestView } from "./types";

/**
 * Where sound plays: the rules for the Host's phone (the Speaker), an In-person guest's phone and a remote
 * guest's. Pure, so the client holds no sound rules of its own beyond playing what this says.
 */

/** A phone's part in the sound: the Host's plays aloud for the guests with them in person. */
export type SoundRole = "speaker" | "inPerson" | "remote";

/** The guest with the Host in person hears cues at about this fraction of full volume. */
export const IN_PERSON_CUE_VOLUME = 0.4;

export type CueId = "danceStart" | "lightsOut" | "sentDown" | "vote" | "unmasking" | "rightAnswer" | "favoursReceived" | "gift" | "musicStop";

/**
 * A public cue is for the whole party, so the Speaker plays it aloud. A private cue plays only on its own
 * guest's phone, never where a group can hear. A visual cue makes no sound at all.
 */
export const CUES: Record<CueId, { kind: "public" | "private" | "visual"; onScreen: boolean }> = {
  danceStart: { kind: "public", onScreen: false },
  lightsOut: { kind: "public", onScreen: false },
  sentDown: { kind: "public", onScreen: false },
  vote: { kind: "public", onScreen: false },
  unmasking: { kind: "public", onScreen: false },
  rightAnswer: { kind: "private", onScreen: false },
  favoursReceived: { kind: "private", onScreen: false },
  gift: { kind: "visual", onScreen: true },
  musicStop: { kind: "public", onScreen: true },
};

/** The Host's phone is always the Speaker; another guest with the switch on is In person; the rest are remote. */
export function soundRole(view: Pick<GuestView, "you" | "host" | "inPerson">): SoundRole {
  if (view.you === view.host) return "speaker";
  return view.inPerson ? "inPerson" : "remote";
}

/** How loud this phone plays a cue, 0 to 1. */
export function cueVolume(role: SoundRole, cue: CueId): number {
  const kind = CUES[cue].kind;
  if (kind === "visual") return 0;
  if (role === "inPerson") return IN_PERSON_CUE_VOLUME;
  if (kind === "private" && role === "speaker") return 0;
  return 1;
}

/** Whether this phone plays the music: an In-person guest's does not, the Speaker's does for them. */
export const musicAudible = (role: SoundRole): boolean => role !== "inPerson";

/**
 * Whether this phone speaks the Narrator's current line aloud. Captions are always on, whatever this says.
 * A Speaker speaks only the lines every guest hears; nothing is spoken over an unmasking or the Jury vote's reveal.
 */
export function narrationAudible(role: SoundRole, view: Pick<GuestView, "narrator" | "phase"> & { stage?: string }): boolean {
  if (!view.narrator || role === "inPerson") return false;
  if (view.phase === "unmasking" || (view.phase === "lastDance" && view.stage === "reveal")) return false;
  return role === "remote" || view.narrator.everyone;
}

/** The cues this guest's phone may play for the move from one view to the next, before routing by role. */
export function cuesBetween(prev: GuestView | null, next: GuestView): CueId[] {
  if (!prev) return [];
  const cues: CueId[] = [];
  const stage = (v: GuestView) => (v.phase === "lastDance" ? v.stage : null);
  if (prev.phase !== next.phase) {
    if (next.phase === "dance") cues.push("danceStart");
    if (next.phase === "sentDown") cues.push("sentDown");
    if (next.phase === "unmasking") cues.push("unmasking");
    if (next.phase === "sentDown" && (next.payout[next.you] ?? 0) > 0) cues.push("favoursReceived");
  }
  if (next.phase === "lastDance" && stage(prev) !== stage(next)) {
    if (stage(next) === "vote") cues.push("vote");
    if (stage(next) === "reveal") cues.push("unmasking");
  }
  const was = "step" in prev ? prev.step : null;
  const now = "step" in next ? next.step : null;
  if (now && was && !was.lightsOut && now.lightsOut && now.stage === "answer") cues.push("lightsOut");
  if (now?.reveal?.yourResult === "right" && !was?.reveal) cues.push("rightAnswer");
  if (prev.phase === "mingle" && next.phase === "mingle" && "favours" in prev && "favours" in next && next.favours > prev.favours) cues.push("gift");
  return cues;
}
