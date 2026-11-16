import { LIBRARY } from "../content/library";
import {
  DANCE_PAYOUTS,
  DELETE_AFTER_MS,
  MINGLE_MS,
  OVERTURE_MS,
  SENT_DOWN_LINES_MS,
  QUICK_ROUNDS,
  SENT_DOWN_MS,
  UNMASKING_MS,
  type AlongMatch,
  type CellarState,
  type GuestRecord,
  type RaceState,
  START_FAVOURS,
  type MatchDef,
  MAX_GUESTS,
  MAX_NAME_LENGTH,
  MIN_GUESTS,
  type Action,
  type ApplyResult,
  type ChatAccess,
  type GameState,
  type GuestId,
  type GuestView,
  type Mask,
  type RankingEntry,
  type Rejection,
} from "../shared/types";
import { advanceAlong, alongDeadline, alongView, startAlong } from "./along";
import { drawMatch } from "./draw-match";
import { advanceLastDance, castVote, floorOf, lastDanceView, lastDancePlayers, openLastDance, startLastDanceMatch } from "./last-dance";
import { everyoneSkipped, narrate, narratorView, openPrelude, preludeMs, preludeView, skip } from "./prelude";
import { predict, predictionsReveal, predictionsView } from "./predictions";
import { drawMask } from "./masks";
import { cellarSize, unmaskingsFor } from "./schedule";
import { advanceAuction, auctionView, bidAuction, buyAuctionPoints, rankAuction, startAuction } from "./auction";
import { advanceBluff, bluffView, buyBluffPoints, callBluff, claimBluff, rankBluff, startBluff } from "./bluff";
import { advanceRace, answerRace, buyPoints, rankRace, startRace, stepView } from "./race";

/** The rules engine: pure, with no clock, no Math.random and no platform imports. */

export function newGame(seed: number): GameState {
  return {
    phase: "foyer",
    format: "quick",
    seed: seed >>> 0,
    host: null,
    guests: [],
    round: 1,
    rounds: QUICK_ROUNDS,
    drawn: [],
    deadline: null,
    danceDef: null,
    danceEncore: false,
    match: null,
    auction: null,
    bluff: null,
    danceResult: null,
    cellar: null,
    gifts: [],
    mingleStandings: {},
    rooms: [],
    cellarTalks: [],
    along: null,
    predictions: [],
    lastDance: null,
    planned: 0,
    absent: [],
    told: [],
    narration: null,
    prelude: null,
    overtureUntil: null,
  };
}

const reject = (reason: Extract<ApplyResult, { ok: false }>["reason"]): ApplyResult => ({ ok: false, reason });

export function apply(state: GameState, action: Action, now: number): ApplyResult {
  if (action.type !== "tick" && action.type !== "presence") {
    if (state.phase === "ended") return reject("the game has ended");
    // A guest who has left takes no more part, though they stay in the match they are in until it ends.
    const acting = "guest" in action ? state.guests.find((g) => g.id === action.guest) : undefined;
    if (acting?.left && acting.unmaskedIn === undefined) return reject("you left the party");
  }
  switch (action.type) {
    case "presence":
      return { ok: true, state: { ...state, absent: state.guests.map((g) => g.id).filter((id) => !action.present.includes(id)) } };
    case "leave":
      return leave(state, action.guest, now);
    case "endGame": {
      if (!state.guests.some((g) => g.id === action.guest)) return reject("no such guest");
      if (state.phase === "foyer") return reject("the game hasn't started");
      if (action.guest !== state.host) return reject("only the Host can do that");
      if (state.lastDance?.stage === "ended" || state.lastDance?.stage === "deleted") return reject("the game has ended");
      return { ok: true, state: { ...structuredClone(state), phase: "ended", along: null, prelude: null, narration: null, deadline: now + DELETE_AFTER_MS } };
    }
    case "skipPrelude": {
      if (!state.guests.some((g) => g.id === action.guest)) return reject("no such guest");
      const next = structuredClone(state);
      const why = skip(next, action.guest, now);
      if (why) return reject(why);
      // The match starts early once everyone in it has skipped.
      const kind = next.prelude!.kind;
      if (everyoneSkipped(next, kind === "dance" ? remaining(next).map((g) => g.id) : kind === "cellar" ? next.cellar!.guests : lastDancePlayers(next))) {
        next.narration = null;
        if (kind === "dance") startDance(next, now);
        else if (kind === "cellar") startCellarGame(next, now);
        else startLastDanceMatch(next, now);
      }
      return { ok: true, state: next };
    }
    case "rejoinLink": {
      if (!state.guests.some((g) => g.id === action.guest)) return reject("no such guest");
      if (action.guest !== state.host) return reject("only the Host can do that");
      if (!state.guests.some((g) => g.id === action.target)) return reject("no such guest");
      return { ok: true, state };
    }
    case "tick":
      return { ok: true, state: tick(state, now, action.present) };
    case "answer": {
      const found = seat(state, action.guest);
      if (typeof found === "string") return reject(found);
      const next = structuredClone(state);
      const race = found.along ? alongOf(next, "race") : activeRace(next);
      if (!race) return reject("no Dance is running");
      const why = answerRace(race, action.guest, action.position, now);
      if (why) return reject(why);
      if (!found.along) next.deadline = race.deadline;
      return { ok: true, state: next };
    }
    case "bid": {
      const found = seat(state, action.guest);
      if (typeof found === "string") return reject(found);
      const next = structuredClone(state);
      const auction = found.along ? alongOf(next, "sealedBid") : activeAuction(next);
      if (!auction) return reject("no auction is running");
      const why = bidAuction(auction, action.guest, action.amount, now);
      if (why) return reject(why);
      if (!found.along) next.deadline = auction.deadline;
      return { ok: true, state: next };
    }
    case "claim":
    case "call": {
      const found = seat(state, action.guest);
      if (typeof found === "string") return reject(found);
      const next = structuredClone(state);
      const bluff = found.along ? alongOf(next, "bluff") : activeBluff(next);
      if (!bluff) return reject("no toast is running");
      const why = action.type === "claim" ? claimBluff(bluff, action.guest, action.value, now) : callBluff(bluff, action.guest, action.target, now);
      if (why) return reject(why);
      if (!found.along) next.deadline = bluff.deadline;
      return { ok: true, state: next };
    }
    case "buyPoints": {
      const found = seat(state, action.guest);
      if (typeof found === "string") return reject(found);
      if (!Number.isInteger(action.favours) || action.favours < 1) return reject("bad amount");
      // An unmasked guest's favours have vanished: nothing to spend in a play-along.
      if (found.along || action.favours > found.me.favours) return reject("not enough favours");
      const next = structuredClone(state);
      next.guests.find((g) => g.id === action.guest)!.favours -= action.favours;
      if (activeAuction(next)) buyAuctionPoints(next.auction!, action.guest, action.favours);
      else if (activeBluff(next)) buyBluffPoints(next.bluff!, action.guest, action.favours);
      else buyPoints(activeRace(next)!, action.guest, action.favours);
      return { ok: true, state: next };
    }
    case "gift": {
      const giver = state.guests.find((g) => g.id === action.guest);
      if (!giver) return reject("no such guest");
      if (state.phase !== "mingle") return reject("gifts are given in the Mingle only");
      if (giver.unmaskedIn !== undefined) return reject("no such guest");
      if (action.to === action.guest) return reject("can't gift yourself");
      const receiver = remaining(state).find((g) => g.id === action.to);
      if (!receiver) return reject("no such guest");
      if (!Number.isInteger(action.favours) || action.favours < 1) return reject("bad amount");
      if (action.favours > giver.favours) return reject("not enough favours");
      const next = structuredClone(state);
      next.guests.find((g) => g.id === action.guest)!.favours -= action.favours;
      next.guests.find((g) => g.id === action.to)!.favours += action.favours;
      next.gifts.push({ round: state.round, from: action.guest, to: action.to, favours: action.favours });
      return { ok: true, state: next };
    }
    case "openRoom": {
      if (state.phase === "foyer") return reject("the game hasn't started");
      const host = remaining(state).find((g) => g.id === action.guest);
      if (!host) return reject("no such guest");
      const others = action.members;
      if (!Array.isArray(others) || others.some((m) => !remaining(state).some((g) => g.id === m))) return reject("no such guest");
      if (new Set(others).size !== others.length || others.includes(action.guest)) return reject("no such guest");
      if (others.length === 0) return reject("a Room needs another guest");
      if (others.length >= remaining(state).length - 1) return reject("a Room can't hold everyone");
      const next = structuredClone(state);
      next.rooms.push({ id: `r${state.rooms.length + 1}`, members: [action.guest, ...others] });
      return { ok: true, state: next };
    }
    case "leaveRoom": {
      const room = state.rooms.find((r) => r.id === action.room);
      if (!room) return reject("no such Room");
      if (!room.members.includes(action.guest)) return reject("not in that Room");
      const next = structuredClone(state);
      const r = next.rooms.find((x) => x.id === action.room)!;
      r.members = r.members.filter((m) => m !== action.guest);
      return { ok: true, state: next };
    }
    case "predict": {
      const next = structuredClone(state);
      const why = predict(next, action.guest, action.picks);
      return why ? reject(why) : { ok: true, state: next };
    }
    case "vote": {
      const next = structuredClone(state);
      const why = castVote(next, action.guest, action.finalist, now);
      return why ? reject(why) : { ok: true, state: next };
    }
    case "join": {
      if (state.phase !== "foyer") return reject("doors are closed");
      if (state.guests.some((g) => g.id === action.guest)) return reject("already joined");
      if (state.guests.length >= MAX_GUESTS) return reject("the Foyer is full");
      const name = action.name.trim();
      if (name.length === 0) return reject("name needed");
      if ([...name].length > MAX_NAME_LENGTH) return reject("name too long");
      const [mask, seed] = drawMask(state.seed, state.guests.map((g) => g.mask));
      return {
        ok: true,
        state: {
          ...state,
          seed,
          host: state.host ?? action.guest,
          guests: [...state.guests, { id: action.guest, name, mask, joinedAt: now, favours: START_FAVOURS }],
        },
      };
    }
    case "removeGuest": {
      if (state.phase !== "foyer") return reject("the game has started");
      if (!state.guests.some((g) => g.id === action.guest)) return reject("no such guest");
      if (action.guest !== state.host) return reject("only the Host can do that");
      if (action.target === state.host) return reject("the Host can't be removed");
      if (!state.guests.some((g) => g.id === action.target)) return reject("no such guest");
      return { ok: true, state: { ...state, guests: state.guests.filter((g) => g.id !== action.target) } };
    }
    case "start": {
      if (state.phase !== "foyer") return reject("the game has started");
      if (!state.guests.some((g) => g.id === action.guest)) return reject("no such guest");
      if (action.guest !== state.host) return reject("only the Host can do that");
      if (!fitsFormat(state)) return reject("need 4-10 guests to start");
      const dance = drawDance({ ...state, round: 1 });
      if (!dance) return reject("need 4-10 guests to start");
      return { ok: true, state: openMingle({ ...dance, round: 1 }, now, true) };
    }
  }
}

/** The guests still in the game: not yet unmasked. */
export const remaining = (state: GameState): GuestRecord[] => state.guests.filter((g) => g.unmaskedIn === undefined);

/** The match running right now, if any: the Dance, or the Cellar game. */
function activeRace(state: GameState): RaceState | null {
  if (state.phase === "dance") return state.match;
  if (state.phase === "cellar") return state.cellar!.race;
  if (state.phase === "lastDance" && state.lastDance?.stage === "match") return state.lastDance.race;
  return null;
}

/** The Sealed bid Dance running right now: only while the Dance phase lasts. */
const activeAuction = (state: GameState) => (state.phase === "dance" ? state.auction : null);

/** The Bluff Dance running right now: only while the Dance phase lasts. */
const activeBluff = (state: GameState) => (state.phase === "dance" ? state.bluff : null);

/** The play-along's match when it is of this match type and still running. */
function alongOf<T extends AlongMatch["def"]["type"]>(state: GameState, type: T): Extract<AlongMatch, { def: { type: T } }> | null {
  const a = state.along;
  return a && !a.done && a.match.def.type === type ? (a.match as Extract<AlongMatch, { def: { type: T } }>) : null;
}

/** The seated guest taking part in the running match (or, unmasked, in its play-along), or why they can't. */
function seat(state: GameState, id: GuestId): { me: GuestRecord; along: boolean } | Rejection {
  const me = state.guests.find((g) => g.id === id);
  if (!me) return "no such guest";
  const running = activeAuction(state) ?? activeBluff(state) ?? activeRace(state);
  if (!running) return "no Dance is running";
  if (id in running.points) return { me, along: false };
  if (state.along && !state.along.done && Object.hasOwn(state.along.match.points, id)) return { me, along: true };
  return "not playing in this match";
}

/** Draws the round's Dance and announces it in the state. */
function drawDance(state: GameState): GameState | null {
  const drawn = drawMatch({ library: LIBRARY, role: "dance", count: remaining(state).length, round: state.round, history: state.drawn, seed: state.seed });
  if (!drawn) return null;
  return {
    ...state,
    seed: drawn.seed,
    danceDef: structuredClone(drawn.match),
    danceEncore: drawn.encore,
    match: null,
    auction: null,
    bluff: null,
    danceResult: null,
    cellar: null,
    along: null,
    drawn: [...state.drawn, { round: state.round, role: "dance", id: drawn.match.id }],
  };
}

/** Whether a new guest may still ask to join: only while the Foyer is open. */
export function doorsOpen(state: GameState): boolean {
  return state.phase === "foyer";
}

function fitsFormat(state: GameState): boolean {
  return state.guests.length >= MIN_GUESTS && state.guests.length <= MAX_GUESTS;
}

/** The clock: runs every phase whose deadline has passed, each at its own deadline, not at `now`. */
function tick(state: GameState, now: number, present?: GuestId[]): GameState {
  const first = nextDeadline(state);
  if (first === null || now < first) return state;
  let s = structuredClone(state);
  for (;;) {
    // The play-along keeps its own clock; it moves alone and never touches the real deadline.
    const own = alongDeadline(s.along);
    const at = own !== null && (s.deadline === null || own <= s.deadline) ? own : s.deadline;
    if (at === null || now < at) break;
    if (at === own) {
      advanceAlong(s.along!, at);
      continue;
    }
    s.narration = null;
    if (s.phase === "mingle") {
      s.phase = "dance";
      openDance(s, at);
    } else if (s.phase === "dance") {
      const running = s.bluff ?? s.auction ?? s.match;
      if (!running) {
        // The Prelude is over: the match starts.
        startDance(s, at);
        continue;
      }
      const more = s.bluff ? advanceBluff(s.bluff, at) : s.auction ? advanceAuction(s.auction, at) : advanceRace(s.match!, at);
      if (more) s.deadline = running.deadline;
      else s = sendDown(s, at);
    } else if (s.phase === "sentDown") {
      startCellarGame(s, at);
    } else if (s.phase === "cellar") {
      const race = s.cellar!.race!;
      if (advanceRace(race, at)) s.deadline = race.deadline;
      else unmask(s, at);
    } else if (s.phase === "unmasking") {
      s = nextRound(s, at);
    } else if (s.phase === "lastDance") advanceLastDance(s, at, present);
    else s.deadline = null;
  }
  return s;
}

/** The Dance slot opens: the Narrator's line, then the Prelude (not for an Encore), then the match. */
function openDance(s: GameState, at: number): void {
  const def = s.danceDef!;
  const line = narrate(s, "dance", at);
  s.prelude = openPrelude("dance", def, s.danceEncore, at + line);
  const start = s.prelude?.endsAt ?? at + line;
  if (start === at) startDance(s, at);
  else s.deadline = start;
}

/** The Dance's match starts at `at`, from the Prelude's end or the last guest's skip. */
function startDance(s: GameState, at: number): void {
  const def = s.danceDef as MatchDef;
  const guests = remaining(s).map((g) => g.id);
  const before = s.seed;
  if (def.type === "bluff") {
    const [bluff, seed] = startBluff(s.seed, def, guests, at);
    s.seed = seed;
    s.bluff = bluff;
    s.deadline = bluff.deadline;
  } else if (def.type === "sealedBid") {
    const [auction, seed] = startAuction(s.seed, def, guests, at);
    s.seed = seed;
    s.auction = auction;
    s.deadline = auction.deadline;
  } else {
    const [race, seed] = startRace(s.seed, def, guests, at, def.steps.dance!);
    s.seed = seed;
    s.match = race;
    s.deadline = race.deadline;
  }
  s.along = startAlong(def, "dance", unmaskedGuests(s), before, at);
  s.prelude = null;
}

/** The Cellar game starts at `at`, from the end of the sent-down reveal or the last skip. */
function startCellarGame(s: GameState, at: number): void {
  const c = s.cellar!;
  if (c.def.type !== "race") throw new Error(`${c.def.name} can't be a Cellar game`);
  const before = s.seed;
  const [race, seed] = startRace(s.seed, c.def, c.guests, at, c.def.steps.cellar!);
  s.seed = seed;
  s.along = startAlong(c.def, "cellar", unmaskedGuests(s), before, at);
  c.race = race;
  s.cellarTalks.push({ id: `cellar-${s.round}`, members: [...c.guests] });
  s.match = null;
  s.prelude = null;
  s.phase = "cellar";
  s.deadline = race.deadline;
}

/** The guests already unmasked: they play along with a match that starts now. */
const unmaskedGuests = (state: GameState): GuestId[] => state.guests.filter((g) => g.unmaskedIn !== undefined).map((g) => g.id);

/** A guest who left but is still in the running match ranks last in it. */
function leaversLast(s: GameState, ranking: RankingEntry[]): RankingEntry[] {
  const left = (r: RankingEntry) => s.guests.find((g) => g.id === r.guest)?.left === true && s.guests.find((g) => g.id === r.guest)?.unmaskedIn === undefined;
  return [...ranking.filter((r) => !left(r)), ...ranking.filter(left)];
}

/** The guests lose their place for good: their mask floats off, their favours vanish and they leave every Room. */
function depart(s: GameState, ids: GuestId[]): void {
  for (const g of s.guests) if (ids.includes(g.id)) Object.assign(g, { unmaskedIn: s.round, favours: 0 });
  for (const room of s.rooms) {
    const going = room.members.filter((m) => ids.includes(m));
    if (going.length === 0) continue;
    room.members = room.members.filter((m) => !going.includes(m));
    room.unmasked = [...(room.unmasked ?? []), ...going];
  }
}

/** The Host role goes to the earliest-joined guest still in the game (unmasked counts) when the Host leaves. */
function passHost(s: GameState, leaver: GuestId): void {
  if (s.host !== leaver) return;
  const next = s.guests.filter((g) => !g.left && g.id !== leaver).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (next) s.host = next.id;
}

/** The Dance's strict ranking sets the payout (favours never go below 0), then the lower half is sent down. */
function sendDown(s: GameState, at: number): GameState {
  const ranking = leaversLast(s, s.bluff ? rankBluff(s.bluff) : s.auction ? rankAuction(s.auction) : rankRace(s.match!));
  const table = DANCE_PAYOUTS[ranking.length]!;
  const payout: Record<GuestId, number> = {};
  ranking.forEach((r, i) => {
    payout[r.guest] = table[i]!;
    const g = s.guests.find((x) => x.id === r.guest)!;
    g.favours = Math.max(0, g.favours + table[i]!);
  });
  s.danceResult = { ranking, payout };
  if (s.along) s.along.done = true;
  s.auction = null;
  s.bluff = null;
  // A guest who left takes the bottom payout and is gone before guests are sent down.
  depart(s, remaining(s).filter((g) => g.left).map((g) => g.id));

  const left = remaining(s);
  if (left.length <= 2) return openLastDance(s, at);
  // The round's planned unmaskings, less the ones leavers have used.
  const leavers = s.guests.filter((g) => g.left && g.unmaskedIn === s.round).length;
  const unmaskings = Math.max(0, Math.min(s.planned - leavers, left.length - 2));
  const size = cellarSize(left.length, unmaskings);
  // Fewest favours first; on equal favours the lower Dance place goes down first.
  const place = (id: GuestId) => ranking.findIndex((r) => r.guest === id);
  const down = [...left].sort((a, b) => a.favours - b.favours || place(b.id) - place(a.id)).slice(0, size).map((g) => g.id);

  const drawn =
    drawMatch({ library: LIBRARY, role: "cellar", count: size, round: s.round, history: s.drawn, seed: s.seed }) ??
    failNoCellarGame(size);
  s.seed = drawn.seed;
  s.drawn.push({ round: s.round, role: "cellar", id: drawn.match.id });
  s.cellar = { def: structuredClone(drawn.match), encore: drawn.encore, guests: down, unmaskings, race: null, ranking: null, unmasked: [] };
  // Unmasked guests may pick who the Cellar game unmasks, from now until it starts.
  if (unmaskings > 0) s.predictions.push({ round: s.round, cellar: [...down], unmaskings, picks: {}, unmasked: null });
  s.phase = "sentDown";
  // The Narrator's sent-down and Cellar line plays on the phones of the guests sent down, in the first half;
  // the Cellar game's Prelude plays in the second, and a longer script runs the reveal on.
  narrate(s, "sentDown", at, [...down]);
  s.prelude = openPrelude("cellar", s.cellar.def, s.cellar.encore, at + SENT_DOWN_LINES_MS);
  s.deadline = s.prelude ? Math.max(at + SENT_DOWN_MS, s.prelude.endsAt) : at + SENT_DOWN_MS;
  return s;
}

function failNoCellarGame(size: number): never {
  throw new Error(`the library has no Cellar game for ${size} guests`);
}

/** The Cellar game's lowest-ranked are unmasked: their mask floats off and their favours vanish. */
function unmask(s: GameState, at: number): void {
  const c = s.cellar!;
  c.ranking = leaversLast(s, rankRace(c.race!));
  // A leaver in the Cellar ranks last and is one of the unmaskings; the round unmasks more only when leavers outnumber them.
  const count = Math.max(c.unmaskings, c.ranking.filter((r) => s.guests.find((g) => g.id === r.guest)!.left).length);
  c.unmasked = count === 0 ? [] : c.ranking.slice(-count).map((r) => r.guest);
  const predicted = s.predictions.find((p) => p.round === s.round);
  if (predicted) predicted.unmasked = [...c.unmasked];
  depart(s, c.unmasked);
  if (s.along) s.along.done = true;
  s.phase = "unmasking";
  s.deadline = at + UNMASKING_MS;
  // The first unmasking is explained to the guests it unmasks, on their own phones.
  if (c.unmasked.length > 0) narrate(s, "unmasking", at, [...c.unmasked]);
}

/** After the unmasking: round N+1's Mingle, or the Last Dance once the rounds are done. */
function nextRound(s: GameState, at: number): GameState {
  if (s.round >= s.rounds || remaining(s).length <= 2) return openLastDance(s, at);
  const next = drawDance({ ...s, round: s.round + 1 });
  if (!next) throw new Error("the library has no Dance for the guests left");
  return openMingle(next, at);
}

/** Opens the round's Mingle; its standings are the totals as they stand now. */
function openMingle(s: GameState, at: number, overture = false): GameState {
  const mingleStandings = Object.fromEntries(remaining(s).map((g) => [g.id, g.favours]));
  const here = remaining(s).length;
  const planned = unmaskingsFor({ remaining: here, unmaskings: here - 2, rounds: s.rounds - s.round + 1 });
  // Round 1's Overture plays as the doors close; the Mingle keeps its four minutes after it.
  const opens = overture ? at + OVERTURE_MS : at;
  const next: GameState = { ...s, phase: "mingle", deadline: opens + MINGLE_MS, mingleStandings, planned, overtureUntil: overture ? opens : s.overtureUntil };
  narrate(next, "mingle", opens);
  return next;
}

/** Everything a guest may see; null for someone who has no seat. */
export function viewFor(state: GameState, guest: GuestId): GuestView | null {
  const me = state.guests.find((g) => g.id === guest);
  if (!me || state.host === null) return null;
  const guests = state.guests.map(({ id, name, mask, unmaskedIn, left }) => ({ id, name, mask: { ...mask }, unmasked: unmaskedIn !== undefined, left: left === true, disconnected: state.absent.includes(id) }));
  const ghost = me.unmaskedIn !== undefined;
  const seated = { you: guest, host: state.host, guests, rooms: state.rooms.map((r) => ({ id: r.id, members: [...r.members] })), chats: talkSheet(state, guest),
    along: ghost && state.along ? alongView(state.along, guest) : null, predictions: ghost ? predictionsView(state) : null,
    narrator: narratorView(state, guest), prelude: preludeView(state, guest) };
  const def = state.danceDef;
  const announcement = def && { name: def.name, encore: state.danceEncore, rulesSummary: def.rulesSummary, workedExample: def.workedExample, prelude: def.prelude, masks: !!def.masks };
  const publicFavours = () => Object.fromEntries(remaining(state).map((g) => [g.id, g.favours]));
  const cellarGame = () => {
    const d = state.cellar!.def;
    return { name: d.name, encore: state.cellar!.encore, rulesSummary: d.rulesSummary, workedExample: d.workedExample, prelude: d.prelude, masks: !!d.masks };
  };
  switch (state.phase) {
    case "mingle":
      return { ...seated, phase: "mingle", round: state.round, deadline: state.deadline!, overtureUntil: state.round === 1 ? state.overtureUntil : null, favours: me.favours,
        standings: { ...state.mingleStandings },
        gifts: state.gifts.filter((x) => x.round === state.round && (x.from === guest || x.to === guest)).map(({ from, to, favours }) => ({ from, to, favours })),
        announcement: announcement!,
      };
    case "dance": {
      const race = state.match;
      const auction = state.auction;
      const bluff = state.bluff;
      // Before the match starts, the Prelude plays and there is nothing to play yet.
      const running = bluff ?? auction ?? race;
      const playing = !!running && guest in running.points;
      return {
        ...seated,
        phase: "dance",
        round: state.round,
        favours: me.favours,
        announcement: announcement!,
        buyRate: def!.buyRate,
        step: race && playing ? stepView(race, guest) : null,
        auction: auction && playing ? auctionView(auction, guest) : null,
        bluff: bluff && playing ? bluffView(bluff, guest) : null,
        ranking: !running ? [] : leaversLast(state, bluff ? rankBluff(bluff) : auction ? rankAuction(auction) : rankRace(race!)),
      };
    }
    case "sentDown":
      return {
        ...seated,
        phase: "sentDown",
        round: state.round,
        deadline: state.deadline!,
        danceRanking: state.danceResult!.ranking,
        payout: state.danceResult!.payout,
        favours: publicFavours(),
        cellar: [...state.cellar!.guests],
        unmaskings: state.cellar!.unmaskings,
        cellarGame: cellarGame(),
      };
    case "cellar": {
      const c = state.cellar!;
      return {
        ...seated,
        phase: "cellar",
        round: state.round,
        deadline: state.deadline!,
        favours: me.favours,
        cellar: [...c.guests],
        unmaskings: c.unmaskings,
        announcement: cellarGame(),
        buyRate: c.def.buyRate,
        step: guest in c.race!.points ? stepView(c.race!, guest) : null,
        ranking: leaversLast(state, rankRace(c.race!)),
      };
    }
    case "unmasking":
      return {
        ...seated,
        phase: "unmasking",
        round: state.round,
        deadline: state.deadline!,
        cellarRanking: state.cellar!.ranking!,
        unmasked: [...state.cellar!.unmasked],
        favours: publicFavours(),
      };
    case "lastDance":
    {
      const ld = state.lastDance!;
      const over = ld.stage === "ended" || ld.stage === "deleted";
      return {
        ...seated,
        phase: "lastDance",
        ...lastDanceView(state, guest),
        announcement: { name: ld.def.name, encore: ld.encore, rulesSummary: ld.def.rulesSummary, workedExample: ld.def.workedExample, prelude: ld.def.prelude, masks: !!ld.def.masks },
        buyRate: ld.def.buyRate,
        yourFavours: me.favours,
        favours: over ? publicFavours() : null,
        reveal: over ? predictionsReveal(state) : null,
      };
    }
    case "ended":
      return { ...seated, phase: "ended", lastMask: null, favours: publicFavours(), reveal: predictionsReveal(state) };
    case "foyer":
      return { ...seated, phase: "foyer", format: state.format, canStart: guest === state.host && fitsFormat(state), canRemove: guest === state.host };
  }
}

/**
 * The chats a guest can read, and whether they can post, once the game has started.
 * While a Cellar game runs, the Table and every Room mixing the Cellar with free guests are read-only;
 * Cellar talk is live for the Cellar only; an unmasked guest has read-only history and the Balcony.
 */
export function chatAccess(state: GameState, guest: GuestId): ChatAccess {
  const me = state.guests.find((g) => g.id === guest);
  if (state.phase === "foyer" || !me) return [];
  const unmasked = me.unmaskedIn !== undefined;
  const cellarGame = state.phase === "cellar";
  const down = new Set(state.cellar?.guests ?? []);
  const mixed = (members: GuestId[]) => cellarGame && members.some((m) => down.has(m)) && members.some((m) => !down.has(m));
  // In the Last Dance's addresses only the guest with the floor posts, then everyone; unmasked guests are part of the party then.
  const floor = state.phase === "lastDance" ? floorOf(state.lastDance) : null;
  const access: ChatAccess = [{ chat: "table", canPost: floor !== null ? floor === "everyone" || floor === guest : !unmasked && !cellarGame }];
  for (const r of state.rooms) {
    if (r.members.includes(guest)) access.push({ chat: r.id, canPost: !mixed(r.members) });
    else if (r.unmasked?.includes(guest)) access.push({ chat: r.id, canPost: false });
  }
  for (const t of state.cellarTalks ?? []) {
    if (!t.members.includes(guest)) continue;
    access.push({ chat: t.id, canPost: cellarGame && t.id === `cellar-${state.round}` });
  }
  if (unmasked) access.push({ chat: "balcony", canPost: true });
  return access;
}

/** What a guest's talk sheet lists: everything they can read, but only Cellar talk while they are in a Cellar game. */
function talkSheet(state: GameState, guest: GuestId): ChatAccess {
  const all = chatAccess(state, guest);
  if (state.phase !== "cellar" || !state.cellar!.guests.includes(guest)) return all;
  return all.filter((c) => (state.cellarTalks ?? []).some((t) => t.id === c.chat && c.canPost));
}

/** When the next `tick` is due, or null when nothing is waiting on the clock. */
export function nextDeadline(state: GameState): number | null {
  const own = alongDeadline(state.along);
  return own === null ? state.deadline : state.deadline === null ? own : Math.min(own, state.deadline);
}

/** A guest leaves the party: an unmasking, at once or when the match they are in ends. */
function leave(state: GameState, id: GuestId, now: number): ApplyResult {
  const me = state.guests.find((g) => g.id === id);
  if (!me) return reject("no such guest");
  if (state.phase === "foyer") return reject("the game hasn't started");
  if (me.unmaskedIn !== undefined) return reject("already unmasked");
  const ld = state.lastDance;
  if (state.phase === "lastDance" && ld!.stage !== "intro" && ld!.stage !== "match" && ld!.stage !== "winnerFloor" && ld!.stage !== "loserFloor" && ld!.stage !== "questions" && ld!.stage !== "vote")
    return reject("the game has ended");
  if (state.phase !== "lastDance" && remaining(state).filter((g) => !g.left).length <= 2) return reject("the last two can't leave before the Last Dance");

  const s = structuredClone(state);
  const gone = s.guests.find((g) => g.id === id)!;
  gone.left = true;
  passHost(s, id);

  if (s.phase === "lastDance") {
    // A finalist who leaves hands the other the win at once: no Jury vote, the predictions still revealed.
    const l = s.lastDance!;
    depart(s, [id]);
    l.matchWinner = l.finalists.find((f) => f !== id)!;
    l.matchLoser = id;
    l.lastMask = l.matchWinner;
    l.stage = "ended";
    l.endedAt = now;
    if (s.along) s.along.done = true;
    s.prelude = null;
    s.deadline = now + DELETE_AFTER_MS;
    return { ok: true, state: s };
  }
  // A guest in the running match ranks last in it and goes when it ends.
  const c = s.cellar;
  if (s.phase === "dance" || (s.phase === "cellar" && c!.guests.includes(id))) return { ok: true, state: s };

  depart(s, [id]);
  if (s.phase === "mingle") {
    delete s.mingleStandings[id];
    if (remaining(s).length <= 2) return { ok: true, state: openLastDance(s, now) };
    return { ok: true, state: refitDance(s) };
  }
  if (s.phase === "sentDown" || s.phase === "cellar") {
    // The leaver used one of this round's unmaskings; a Cellar still always holds more guests than it unmasks.
    c!.guests = c!.guests.filter((g) => g !== id);
    c!.unmaskings = Math.max(0, c!.unmaskings - 1);
    const round = s.predictions.find((p) => p.round === s.round);
    if (round && s.phase === "sentDown") {
      round.cellar = round.cellar.filter((g) => g !== id);
      round.unmaskings = c!.unmaskings;
      round.picks = {};
      if (round.unmaskings === 0) s.predictions = s.predictions.filter((p) => p !== round);
    }
  }
  return { ok: true, state: s };
}

/** Draws the round's Dance again when the guests left no longer fit the one announced. */
function refitDance(s: GameState): GameState {
  const range = s.danceDef!.guestRange.dance;
  const count = remaining(s).length;
  if (range && count >= range[0] && count <= range[1]) return s;
  const drawn = s.drawn.filter((d) => !(d.round === s.round && d.role === "dance"));
  return drawDance({ ...s, drawn }) ?? s;
}
