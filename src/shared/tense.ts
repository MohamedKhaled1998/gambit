import type { GuestView } from "./types";

/**
 * Whether the stage dims to a spotlight: being sent down, an unmasking, and a memory match's lights-out
 * (in a Dance or a Cellar game).
 *
 * The Unmasking vote is the fourth tense moment, but the views carry no Unmasking-vote phase yet, so
 * nothing stands in for it. The Last Dance's `vote` is the Jury vote, a different thing, and does not dim.
 * When the Unmasking vote gets a view, add it here.
 */
export function isTense(view: Exclude<GuestView, { phase: "foyer" }>): boolean {
  if (view.phase === "sentDown" || view.phase === "unmasking") return true;
  return (view.phase === "dance" || view.phase === "cellar") && !!view.step?.lightsOut;
}
