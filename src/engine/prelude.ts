import { NARRATOR } from "../content/narrator";
import { ANNOUNCEMENT_MS, type GameState, type GuestId, type LineId, type MatchDef, type NarratorLine, type PreludeState, type PreludeView } from "../shared/types";

/** The Narrator's lines and the Preludes: what plays before a phase or a match, and when. Pure; `game.ts` calls in. */

/** How long a match's Prelude plays: its script, which may come in shorter than its target but never longer. */
export const preludeMs = (def: MatchDef): number => def.prelude.reduce((t, b) => t + b.seconds, 0) * 1000;

/**
 * The Narrator speaks the line for the phase that opened at `at`: in full the first time this game, a short
 * announcement after. `audience` limits who hears it (null: every guest). Returns the time the full line takes
 * out of the phase, 0 for an announcement.
 */
export function narrate(s: GameState, id: LineId, at: number, audience: GuestId[] | null = null): number {
  const first = !s.told.includes(id);
  if (first) s.told = [...s.told, id];
  const seconds = first ? NARRATOR[id].seconds * 1000 : ANNOUNCEMENT_MS;
  s.narration = { id, first, startedAt: at, seconds, audience };
  return first ? seconds : 0;
}

/** The line this guest hears, if it was meant for them. */
export function narratorView(s: GameState, guest: GuestId): NarratorLine | null {
  const n = s.narration;
  if (!n || (n.audience && !n.audience.includes(guest))) return null;
  return { id: n.id, first: n.first, text: n.first ? NARRATOR[n.id].first : NARRATOR[n.id].short, startedAt: n.startedAt, seconds: n.seconds, everyone: n.audience === null };
}

/** A Prelude that plays from `startsAt` for the script's length; null for an Encore, which starts as if everyone had skipped. */
export function openPrelude(kind: PreludeState["kind"], def: MatchDef, encore: boolean, startsAt: number): PreludeState | null {
  return encore ? null : { kind, startsAt, endsAt: startsAt + preludeMs(def), skipped: [] };
}

/** What this guest sees of the Prelude: when it plays, and whether they have skipped to the Rules card. */
export function preludeView(s: GameState, guest: GuestId): PreludeView | null {
  const p = s.prelude;
  return p && { startsAt: p.startsAt, endsAt: p.endsAt, skipped: p.skipped.includes(guest) };
}

/** A guest skips to the Rules card; null when accepted. Only while the Prelude is playing, and once each. */
export function skip(s: GameState, guest: GuestId, now: number): "no Prelude is playing" | "already skipped" | null {
  const p = s.prelude;
  if (!p || now < p.startsAt || now >= p.endsAt) return "no Prelude is playing";
  if (p.skipped.includes(guest)) return "already skipped";
  p.skipped.push(guest);
  return null;
}

/** Whether every guest playing the match the Prelude comes before has skipped. */
export function everyoneSkipped(s: GameState, players: GuestId[]): boolean {
  const p = s.prelude;
  const present = players.filter((id) => !s.guests.find((g) => g.id === id)?.left);
  return !!p && present.every((id) => p.skipped.includes(id));
}
