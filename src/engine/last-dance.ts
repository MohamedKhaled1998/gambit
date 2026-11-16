import { LIBRARY } from "../content/library";
import {
  ADDRESS_MS,
  BALLOT_REVEAL_MS,
  DELETE_AFTER_MS,
  JURY_VOTE_MS,
  LAST_DANCE_PREDICTION_POINTS,
  QUESTIONS_MS,
  type DrawnRecord,
  type GameState,
  type GuestId,
  type GuestView,
  type LastDanceState,
  type RaceMatchDef,
  type Rejection,
} from "../shared/types";
import { startAlong } from "./along";
import { drawInt, shuffle } from "./random";
import { narrate, openPrelude } from "./prelude";
import { advanceRace, rankRace, startRace, stepView } from "./race";

/** The Last Dance: the finalists' Race match, the addresses, the Jury vote and its reveal. Pure; `game.ts` calls in. */

const unmasked = (s: GameState) => s.guests.filter((g) => g.unmaskedIn !== undefined).map((g) => g.id);
const finalistsOf = (s: GameState) => s.guests.filter((g) => g.unmaskedIn === undefined).map((g) => g.id);

/** Votes the match loser needs: two-thirds of the jurors present, rounded up. */
export const votesNeeded = (jurors: number): number => Math.ceil((2 * jurors) / 3);

/**
 * The Last Dance's match: an unused Race match if one is left, otherwise the Race encore drawn longest ago,
 * never one drawn in the last round. If that leaves nothing, the last-round limit is lifted.
 */
export function drawFinalMatch(input: { drawn: readonly DrawnRecord[]; rounds: number; seed: number }): { match: RaceMatchDef; encore: boolean; seed: number } {
  const { drawn, rounds } = input;
  const races = LIBRARY.filter((m): m is RaceMatchDef => m.type === "race" && !!m.guestRange.cellar && m.guestRange.cellar[0] <= 2 && m.steps.cellar !== null);
  const used = (m: RaceMatchDef) => drawn.some((d) => d.id === m.id);
  let level = races.filter((m) => !used(m));
  if (level.length === 0) {
    const last = (m: RaceMatchDef) => drawn.map((d) => d.id).lastIndexOf(m.id);
    for (const pool of [races.filter((m) => !drawn.some((d) => d.id === m.id && d.round >= rounds)), races]) {
      if (pool.length === 0) continue;
      const oldest = Math.min(...pool.map(last));
      level = pool.filter((m) => last(m) === oldest);
      break;
    }
  }
  if (level.length === 0) throw new Error("the library has no Race match for the Last Dance");
  const [i, seed] = drawInt(input.seed, 0, level.length - 1);
  const match = level[i]!;
  return { match, encore: used(match), seed };
}

/** Enters the Last Dance after the last unmasking: its match is drawn and announced; unmasked guests may pick its winner. */
export function openLastDance(s: GameState, at: number): GameState {
  const drawn = drawFinalMatch({ drawn: s.drawn, rounds: s.rounds, seed: s.seed });
  const lastDance: LastDanceState = {
    stage: "intro",
    def: structuredClone(drawn.match),
    encore: drawn.encore,
    finalists: finalistsOf(s),
    race: null,
    picks: {},
    matchWinner: null,
    matchLoser: null,
    jurors: [],
    ballots: {},
    order: [],
    shown: 0,
    lastMask: null,
    endedAt: null,
  };
  const next: GameState = { ...s, seed: drawn.seed, drawn: [...s.drawn, { round: s.rounds + 1, role: "cellar", id: drawn.match.id }], phase: "lastDance", along: null, lastDance, deadline: at };
  // The Narrator's line, then the match's Prelude (an Encore has none); the match starts when it is over.
  const line = narrate(next, "lastDance", at);
  next.prelude = openPrelude("lastDance", lastDance.def, lastDance.encore, at + line);
  next.deadline = next.prelude?.endsAt ?? at + line;
  return next;
}

/** The guests playing the Last Dance's match: its finalists. */
export const lastDancePlayers = (s: GameState): GuestId[] => [...s.lastDance!.finalists];

/** The Last Dance's match starts at `at`: when the Prelude is over, or the finalists have both skipped. */
export function startLastDanceMatch(s: GameState, at: number): void {
  const ld = s.lastDance!;
  const before = s.seed;
  const [race, seed] = startRace(s.seed, ld.def, ld.finalists, at, ld.def.steps.cellar!);
  s.seed = seed;
  ld.race = race;
  s.along = startAlong(ld.def, "cellar", unmasked(s), before, at);
  ld.stage = "match";
  s.prelude = null;
  s.deadline = race.deadline;
}

/** Moves the Last Dance on at its deadline `at`; `present` is who is connected (everyone when unknown). */
export function advanceLastDance(s: GameState, at: number, present: GuestId[] | undefined): void {
  const ld = s.lastDance!;
  const presentJurors = () => unmasked(s).filter((g) => !present || present.includes(g));
  switch (ld.stage) {
    case "intro":
      startLastDanceMatch(s, at);
      return;
    case "match": {
      if (advanceRace(ld.race!, at)) {
        s.deadline = ld.race!.deadline;
        return;
      }
      const ranking = rankRace(ld.race!);
      ld.matchWinner = ranking[0]!.guest;
      ld.matchLoser = ranking[1]!.guest;
      ld.jurors = presentJurors();
      if (s.along) s.along.done = true;
      ld.stage = "winnerFloor";
      s.deadline = at + ADDRESS_MS;
      return;
    }
    case "winnerFloor":
      ld.stage = "loserFloor";
      s.deadline = at + ADDRESS_MS;
      return;
    case "loserFloor":
      ld.stage = "questions";
      s.deadline = at + QUESTIONS_MS;
      return;
    case "questions":
      // The Jury is counted as the vote opens; with no juror present the match decides alone.
      ld.jurors = presentJurors();
      if (ld.jurors.length === 0) return closeVote(s, at);
      ld.stage = "vote";
      s.deadline = at + JURY_VOTE_MS;
      return;
    case "vote":
      return closeVote(s, at);
    case "reveal":
      if (ld.shown < ld.order.length) {
        ld.shown += 1;
        s.deadline = at + BALLOT_REVEAL_MS;
        return;
      }
      ld.stage = "ended";
      ld.endedAt = at;
      s.deadline = at + DELETE_AFTER_MS;
      return;
    case "ended":
      ld.stage = "deleted";
      s.deadline = null;
      return;
    case "deleted":
      s.deadline = null;
  }
}

/** Counts the ballots: the match loser wins only with the bar's votes; otherwise the match winner. */
function closeVote(s: GameState, at: number): void {
  const ld = s.lastDance!;
  const votesForLoser = ld.jurors.filter((j) => ld.ballots[j] === ld.matchLoser).length;
  ld.lastMask = ld.jurors.length > 0 && votesForLoser >= votesNeeded(ld.jurors.length) ? ld.matchLoser : ld.matchWinner;
  let order: GuestId[];
  [order, s.seed] = shuffle(s.seed, Object.keys(ld.ballots).filter((j) => ld.jurors.includes(j)));
  ld.order = order;
  ld.shown = 0;
  ld.stage = "reveal";
  s.deadline = at + BALLOT_REVEAL_MS;
}

/** A juror's secret ballot; null when accepted. */
export function castVote(s: GameState, guest: GuestId, finalist: GuestId, now: number): Rejection | null {
  const ld = s.lastDance;
  if (!s.guests.some((g) => g.id === guest)) return "no such guest";
  if (!ld || ld.stage !== "vote") return "no Jury vote is open";
  if (s.guests.find((g) => g.id === guest)!.unmaskedIn === undefined) return "only the Jury votes";
  if (!ld.jurors.includes(guest)) return "the Jury was counted when the vote opened";
  if (!ld.finalists.includes(finalist)) return "name a finalist";
  if (guest in ld.ballots) return "already voted";
  if (now >= s.deadline!) return "too late";
  ld.ballots[guest] = finalist;
  return null;
}

/** Whether the game is finished and its storage due for deletion. */
export const isDeleted = (s: GameState): boolean => s.lastDance?.stage === "deleted" || (s.phase === "ended" && s.deadline === null);

/** Who may post on the Table during the Last Dance's addresses: a guest, everyone, or null outside them. */
export function floorOf(ld: LastDanceState | null): GuestId | "everyone" | null {
  if (!ld) return null;
  return ld.stage === "winnerFloor" ? ld.matchWinner : ld.stage === "loserFloor" ? ld.matchLoser : ld.stage === "questions" ? "everyone" : null;
}

/** Points the Last Dance's prediction scores, by unmasked guest. */
export function lastDanceScores(s: GameState): Record<GuestId, number> {
  const ld = s.lastDance;
  const out: Record<GuestId, number> = {};
  if (!ld?.matchWinner) return out;
  for (const [g, pick] of Object.entries(ld.picks)) out[g] = pick === ld.matchWinner ? LAST_DANCE_PREDICTION_POINTS : 0;
  return out;
}

type LastDanceView = Extract<GuestView, { phase: "lastDance" }>;

/** The parts of a Last Dance view that depend on its stage; `game.ts` adds the rest. */
export function lastDanceView(s: GameState, guest: GuestId): Pick<LastDanceView, "stage" | "deadline" | "finalists" | "step" | "ranking" | "result" | "floor" | "vote" | "ballots" | "lastMask"> {
  const ld = s.lastDance!;
  const over = ld.stage === "ended" || ld.stage === "deleted";
  const revealing = ld.stage === "reveal" || over;
  const shown = over ? ld.order.length : ld.shown;
  return {
    stage: ld.stage,
    deadline: s.deadline,
    finalists: [...ld.finalists],
    step: ld.stage === "match" && ld.race && guest in ld.race.points ? stepView(ld.race, guest) : null,
    ranking: ld.race ? rankRace(ld.race) : [],
    result: ld.matchWinner ? { winner: ld.matchWinner, loser: ld.matchLoser!, jurors: ld.jurors.length, needs: votesNeeded(ld.jurors.length) } : null,
    floor: floorOf(ld),
    vote: ld.stage === "vote" && ld.jurors.includes(guest) ? { yourVote: ld.ballots[guest] ?? null } : null,
    ballots: revealing ? ld.order.slice(0, shown).map((juror) => ({ juror, finalist: ld.ballots[juror]! })) : [],
    lastMask: over ? ld.lastMask : null,
  };
}
