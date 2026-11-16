import { apply, newGame, nextDeadline, viewFor } from "../../src/engine/game";
import { MINGLE_MS, VOTE_BALLOT_MS, type Action, type GameState, type GuestId, type StepView } from "../../src/shared/types";

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

/** A game in round 1's Mingle, without an Unmasking vote at its start (see `withoutVote`); `startedRaw` keeps whatever the seed drew. */
export const startedRaw = (n: number, seed = 42, at = 0): GameState => must(foyerWith(n, seed), { type: "start", guest: "g0" }, at);
export const started = (n: number, seed = 42, at = 0): GameState => {
  const s = startedRaw(n, seed, at);
  return s.phase === "vote" ? withoutVote(s) : s;
};

/** Ticks to the next deadline, as the Durable Object's alarm does. */
export function tickOnce(s: GameState): GameState {
  const d = nextDeadline(s);
  if (d === null) throw new Error("no deadline");
  return must(s, { type: "tick" }, d);
}

/**
 * Takes back an Unmasking vote that just opened, as if the round had held none: the Mingle or the Dance goes on
 * from where the vote found it. For the tests that aren't about the vote, whose round counts and favours it would change.
 */
export function withoutVote(s: GameState): GameState {
  const v = s.vote!;
  const next = { ...s, vote: null, votePlan: null, voteCount: null };
  if (v.during === "dance") return { ...next, phase: "dance", deadline: (s.pledge ?? s.auction ?? s.pick ?? s.match!).deadline };
  const opened = v.deadline - VOTE_BALLOT_MS;
  const mingleStandings = Object.fromEntries(s.guests.filter((g) => g.unmaskedIn === undefined).map((g) => [g.id, g.favours]));
  return { ...next, phase: "mingle", deadline: opened + MINGLE_MS, mingleStandings };
}

/** Ticks to the next deadline; an Unmasking vote that opens is taken back (see `withoutVote`). */
export function tickToDeadline(s: GameState): GameState {
  s = tickOnce(s);
  return s.phase === "vote" ? withoutVote(s) : s;
}

/** Moves to the start of the Dance. */
export const intoDance = (s: GameState): GameState => tickToDeadline(s);

/** What a guest does at a step: the position to tap and how long they take, or null for no answer. */
export type Player = (guest: GuestId, step: StepView, rightPosition: number) => { position: number; ms: number } | null;

/** A scripted bidder: a guest-dependent share of their points, different on every step. */
const bidFor = (guest: GuestId, step: number, points: number) => Math.min(points, (Number(guest.slice(1)) * 7 + step * 3) % (points + 1));

/** Plays a Sealed bid Dance to its end, every guest bidding by `bidFor`. */
function playAuction(s: GameState): GameState {
  while (s.phase === "dance") {
    const a = s.auction!;
    if (a.stage === "bid") for (const id of Object.keys(a.points)) if (s.phase === "dance" && s.auction!.stage === "bid") s = must(s, { type: "bid", guest: id, amount: bidFor(id, a.step, s.auction!.points[id]!) }, a.stepStartedAt + 1000);
    s = tickToDeadline(s);
  }
  return s;
}

/** Plays a Group target Dance to its end: a guest-dependent pledge each step, and every third guest pockets. */
function playPledge(s: GameState): GameState {
  while (s.phase === "dance") {
    const p = s.pledge!;
    const act = (id: string): Action => (p.stage === "pledge" ? { type: "pledge", guest: id, amount: (Number(id.slice(1)) * 3 + p.step) % 11 } : { type: "reckon", guest: id, choice: Number(id.slice(1)) % 3 === 0 ? "pocket" : "share" });
    if (p.stage === "pledge" || p.stage === "reckon") for (const id of Object.keys(p.points)) if (s.phase === "dance" && s.pledge!.stage === p.stage) s = must(s, act(id), p.stepStartedAt + 1000);
    s = tickToDeadline(s);
  }
  return s;
}

/** Plays a Unique pick match (Dance or Cellar game) to its end: a guest-dependent pick each step. */
function playPick(s: GameState): GameState {
  const phase = s.phase;
  const live = (x: GameState) => (phase === "dance" ? x.pick : x.cellar?.pick) ?? null;
  while (s.phase === phase) {
    const p = live(s)!;
    if (p.stage === "pick") for (const id of Object.keys(p.points)) if (s.phase === phase && live(s)!.stage === "pick") s = must(s, { type: "pick", guest: id, number: 1 + ((Number(id.slice(1)) * 5 + p.step * 2) % p.range) }, p.stepStartedAt + 1000);
    s = tickToDeadline(s);
  }
  return s;
}

/** The guests playing the running match: everyone in a Dance, the Cellar in a Cellar game. */
const players = (s: GameState) => Object.keys((s.phase === "dance" ? s.match! : s.cellar!.race!).points);

/** Plays the running match (Dance or Cellar game) to its end with scripted guests. */
export function playMatch(s: GameState, play: Player): GameState {
  const phase = s.phase;
  if (phase === "dance" && s.auction) return playAuction(s);
  if (phase === "dance" && s.pledge) return playPledge(s);
  if ((phase === "dance" && s.pick) || (phase === "cellar" && s.cellar!.pick)) return playPick(s);
  while (s.phase === phase) {
    const race = phase === "dance" ? s.match! : s.cellar!.race!;
    if (race.stage === "answer") {
      for (const id of players(s)) {
        const step = (viewFor(s, id) as { step: StepView }).step;
        // The right position is read from the state, as a skilled guest would work it out.
        const right = race.layouts[id]![race.step]!.indexOf(0);
        const move = play(id, step, right);
        const live = phase === "dance" ? s.match! : s.cellar!.race!;
        if (move && s.phase === phase && live.stage === "answer") s = must(s, { type: "answer", guest: id, position: move.position }, race.answerStartedAt + move.ms);
      }
    }
    s = tickToDeadline(s);
  }
  return s;
}

/** Plays the Dance to the Sent down screen with scripted guests. */
export const playDance = (s: GameState, play: Player): GameState => playMatch(intoDance(s), play);

/** Plays every round to the Last Dance; `onPhase` sees each phase as it begins. */
export function playGame(s: GameState, play: Player, onPhase: (s: GameState) => void = () => {}): GameState {
  while (s.phase !== "lastDance") {
    s = s.phase === "dance" || s.phase === "cellar" ? playMatch(s, play) : tickToDeadline(s);
    onPhase(s);
  }
  return s;
}

/** Guest i is right on the first (1 + i) steps' worth: right when step index % (i + 1) === 0; 4s each. */
export const mixedPlayer: Player = (guest, step, right) => {
  const i = Number(guest.slice(1));
  return step.index % (i + 1) === 0 ? { position: right, ms: 4000 } : { position: (right + 1) % 4, ms: 4000 };
};
