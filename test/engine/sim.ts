import { apply, newGame, nextDeadline, viewFor } from "../../src/engine/game";
import type { Action, GameState, GuestId, StepView } from "../../src/shared/types";

export function must(state: GameState, action: Action, now = 0): GameState {
  const r = apply(state, action, now);
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  return r.state;
}

export function foyerWith(n: number, seed = 42): GameState {
  let s = newGame(seed);
  for (let i = 0; i < n; i++) s = must(s, { type: "join", guest: `g${i}`, name: `Guest ${i}` }, i);
  return s;
}

export const started = (n: number, seed = 42, at = 0): GameState => must(foyerWith(n, seed), { type: "start", guest: "g0" }, at);

/** Ticks to the next deadline, as the Durable Object's alarm does. */
export function tickToDeadline(s: GameState): GameState {
  const d = nextDeadline(s);
  if (d === null) throw new Error("no deadline");
  return must(s, { type: "tick" }, d);
}

/** Moves to the start of the Dance. */
export const intoDance = (s: GameState): GameState => tickToDeadline(s);

/** What a guest does at a step: the position to tap and how long they take, or null for no answer. */
export type Player = (guest: GuestId, step: StepView, rightPosition: number) => { position: number; ms: number } | null;

/** Plays the Dance to the standings with scripted guests. */
export function playDance(s: GameState, play: Player): GameState {
  s = intoDance(s);
  while (s.phase === "dance") {
    const race = s.match!;
    if (race.stage === "answer") {
      for (const g of s.guests) {
        const step = (viewFor(s, g.id) as { step: StepView }).step;
        // The right position is read from the state, as a skilled guest would work it out.
        const right = race.layouts[g.id]![race.step]!.indexOf(0);
        const move = play(g.id, step, right);
        if (move && s.phase === "dance" && s.match!.stage === "answer")
          s = must(s, { type: "answer", guest: g.id, position: move.position }, race.stepStartedAt + move.ms);
      }
    }
    s = tickToDeadline(s);
  }
  return s;
}

/** Guest i is right on the first (1 + i) steps' worth: right when step index % (i + 1) === 0; 4s each. */
export const mixedPlayer: Player = (guest, step, right) => {
  const i = Number(guest.slice(1));
  return step.index % (i + 1) === 0 ? { position: right, ms: 4000 } : { position: (right + 1) % 4, ms: 4000 };
};
