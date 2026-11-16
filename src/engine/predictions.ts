import type { GameState, GuestId, PredictionRound, PredictionsReveal, PredictionsView, Rejection } from "../shared/types";

/** Predictions: unmasked guests pick who each Cellar game unmasks; they change nothing in the game. */

/** The round whose picks are open: from being sent down until its Cellar game starts. */
export const openRound = (state: GameState): PredictionRound | null => {
  const last = state.predictions.at(-1);
  return state.phase === "sentDown" && last && last.round === state.round ? last : null;
};

/** Sets an unmasked guest's picks for the open round, replacing any earlier ones; null when accepted. */
export function predict(state: GameState, guest: GuestId, picks: GuestId[]): Rejection | null {
  const me = state.guests.find((g) => g.id === guest);
  if (!me) return "no such guest";
  if (me.unmaskedIn === undefined) return "only unmasked guests predict";
  const round = openRound(state);
  if (!round) return "predictions are closed";
  if (!Array.isArray(picks) || picks.length !== round.unmaskings || new Set(picks).size !== picks.length) return "pick one guest for each unmasking";
  if (!picks.every((p) => typeof p === "string" && round.cellar.includes(p))) return "no such guest";
  round.picks[guest] = [...picks];
  return null;
}

/** One point for each correct pick, by unmasked guest, over the Cellar games that have unmasked. */
export function scores(state: GameState): Record<GuestId, number> {
  const out: Record<GuestId, number> = {};
  for (const g of state.guests) if (g.unmaskedIn !== undefined) out[g.id] = 0;
  for (const r of state.predictions)
    if (r.unmasked)
      for (const [guest, picks] of Object.entries(r.picks)) if (guest in out) out[guest]! += picks.filter((p) => r.unmasked!.includes(p)).length;
  return out;
}

const clone = (r: PredictionRound): PredictionRound => ({ ...r, cellar: [...r.cellar], unmasked: r.unmasked && [...r.unmasked], picks: Object.fromEntries(Object.entries(r.picks).map(([g, p]) => [g, [...p]])) });

/** The Balcony's live view of the predictions. */
export function predictionsView(state: GameState): PredictionsView {
  const open = openRound(state);
  return { open: open && { cellar: [...open.cellar], picks: open.unmaskings }, rounds: state.predictions.map(clone), scores: scores(state) };
}

/** The end screen's reveal: every prediction, and the Oracle. Ties share the title; no correct pick, no Oracle. */
export function predictionsReveal(state: GameState): PredictionsReveal {
  const s = scores(state);
  const best = Math.max(0, ...Object.values(s));
  return { rounds: state.predictions.map(clone), scores: s, oracle: best === 0 ? [] : Object.keys(s).filter((g) => s[g] === best) };
}
