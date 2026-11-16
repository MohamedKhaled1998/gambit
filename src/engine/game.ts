import { LIBRARY } from "../content/library";
import {
  DANCE_PAYOUTS,
  MINGLE_MS,
  QUICK_ROUNDS,
  SENT_DOWN_MS,
  UNMASKING_MS,
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
  type Rejection,
} from "../shared/types";
import { drawMatch } from "./draw-match";
import { drawMask } from "./masks";
import { cellarSize, unmaskingsFor } from "./schedule";
import { advanceAuction, auctionView, bidAuction, buyAuctionPoints, rankAuction, startAuction } from "./auction";
import { advancePledge, buyPledgePoints, pledgeTo, pledgeView, publicRanking, rankPledge, reckonTo, startPledge } from "./pledge";
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
    pledge: null,
    danceResult: null,
    cellar: null,
    gifts: [],
    mingleStandings: {},
    rooms: [],
    cellarTalks: [],
  };
}

const reject = (reason: Extract<ApplyResult, { ok: false }>["reason"]): ApplyResult => ({ ok: false, reason });

export function apply(state: GameState, action: Action, now: number): ApplyResult {
  switch (action.type) {
    case "tick":
      return { ok: true, state: tick(state, now) };
    case "answer": {
      const found = findPlayer(state, action.guest);
      if (typeof found === "string") return reject(found);
      const next = structuredClone(state);
      if (!activeRace(next)) return reject("no Dance is running");
      const why = answerRace(activeRace(next)!, action.guest, action.position, now);
      if (why) return reject(why);
      next.deadline = activeRace(next)!.deadline;
      return { ok: true, state: next };
    }
    case "bid": {
      const found = findPlayer(state, action.guest);
      if (typeof found === "string") return reject(found);
      if (!activeAuction(state)) return reject("no auction is running");
      const next = structuredClone(state);
      const why = bidAuction(next.auction!, action.guest, action.amount, now);
      if (why) return reject(why);
      next.deadline = next.auction!.deadline;
      return { ok: true, state: next };
    }
    case "pledge":
    case "reckon": {
      const found = findPlayer(state, action.guest);
      if (typeof found === "string") return reject(found);
      if (!activePledge(state)) return reject("no pledge is running");
      const next = structuredClone(state);
      const why = action.type === "pledge" ? pledgeTo(next.pledge!, action.guest, action.amount, now) : reckonTo(next.pledge!, action.guest, action.choice, now);
      if (why) return reject(why);
      next.deadline = next.pledge!.deadline;
      return { ok: true, state: next };
    }
    case "buyPoints": {
      const found = findPlayer(state, action.guest);
      if (typeof found === "string") return reject(found);
      if (!Number.isInteger(action.favours) || action.favours < 1) return reject("bad amount");
      if (action.favours > found.favours) return reject("not enough favours");
      const next = structuredClone(state);
      next.guests.find((g) => g.id === action.guest)!.favours -= action.favours;
      if (activeAuction(next)) buyAuctionPoints(next.auction!, action.guest, action.favours);
      else if (activePledge(next)) buyPledgePoints(next.pledge!, action.guest, action.favours);
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
      return { ok: true, state: openMingle({ ...dance, round: 1 }, now) };
    }
  }
}

/** The guests still in the game: not yet unmasked. */
export const remaining = (state: GameState): GuestRecord[] => state.guests.filter((g) => g.unmaskedIn === undefined);

/** The match running right now, if any: the Dance, or the Cellar game. */
function activeRace(state: GameState): RaceState | null {
  if (state.phase === "dance") return state.match;
  if (state.phase === "cellar") return state.cellar!.race;
  return null;
}

/** The Sealed bid Dance running right now: only while the Dance phase lasts. */
const activeAuction = (state: GameState) => (state.phase === "dance" ? state.auction : null);

/** The Group target Dance running right now: only while the Dance phase lasts. */
const activePledge = (state: GameState) => (state.phase === "dance" ? state.pledge : null);

/** The seated guest taking part in the running match, or why they can't. */
function findPlayer(state: GameState, id: GuestId): GuestRecord | Rejection {
  const me = state.guests.find((g) => g.id === id);
  if (!me) return "no such guest";
  const running = activeAuction(state) ?? activePledge(state) ?? activeRace(state);
  if (!running) return "no Dance is running";
  return id in running.points ? me : "not playing in this match";
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
    pledge: null,
    danceResult: null,
    cellar: null,
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
function tick(state: GameState, now: number): GameState {
  if (state.deadline === null || now < state.deadline) return state;
  let s = structuredClone(state);
  while (s.deadline !== null && now >= s.deadline) {
    const at = s.deadline;
    if (s.phase === "mingle") {
      const def = s.danceDef as MatchDef;
      const guests = remaining(s).map((g) => g.id);
      if (def.type === "groupTarget") {
        const [pledge, seed] = startPledge(s.seed, def, guests, at);
        s.seed = seed;
        s.pledge = pledge;
        s.deadline = pledge.deadline;
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
      s.phase = "dance";
    } else if (s.phase === "dance") {
      const running = s.pledge ?? s.auction ?? s.match!;
      const more = s.pledge ? advancePledge(s.pledge, at) : s.auction ? advanceAuction(s.auction, at) : advanceRace(s.match!, at);
      if (more) s.deadline = running.deadline;
      else sendDown(s, at);
    } else if (s.phase === "sentDown") {
      const c = s.cellar!;
      if (c.def.type !== "race") throw new Error(`${c.def.name} can't be a Cellar game`);
      const [race, seed] = startRace(s.seed, c.def, c.guests, at, c.def.steps.cellar!);
      s.seed = seed;
      c.race = race;
      s.cellarTalks.push({ id: `cellar-${s.round}`, members: [...c.guests] });
      s.match = null;
      s.phase = "cellar";
      s.deadline = race.deadline;
    } else if (s.phase === "cellar") {
      const race = s.cellar!.race!;
      if (advanceRace(race, at)) s.deadline = race.deadline;
      else unmask(s, at);
    } else if (s.phase === "unmasking") {
      s = nextRound(s, at);
    } else s.deadline = null;
  }
  return s;
}

/** The Dance's strict ranking sets the payout (favours never go below 0), then the lower half is sent down. */
function sendDown(s: GameState, at: number): void {
  const ranking = s.pledge ? rankPledge(s.pledge) : s.auction ? rankAuction(s.auction) : rankRace(s.match!);
  // The payout table sets favours, except in The Pledge, whose own award takes its place.
  const table = DANCE_PAYOUTS[ranking.length]!;
  const payout: Record<GuestId, number> = {};
  ranking.forEach((r, i) => {
    payout[r.guest] = s.pledge ? s.pledge.award![r.guest]! : table[i]!;
    const g = s.guests.find((x) => x.id === r.guest)!;
    g.favours = Math.max(0, g.favours + payout[r.guest]!);
  });
  s.danceResult = { ranking, payout };
  s.auction = null;
  s.pledge = null;

  const left = remaining(s);
  const unmaskings = unmaskingsFor({ remaining: left.length, unmaskings: left.length - 2, rounds: s.rounds - s.round + 1 });
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
  s.phase = "sentDown";
  s.deadline = at + SENT_DOWN_MS;
}

function failNoCellarGame(size: number): never {
  throw new Error(`the library has no Cellar game for ${size} guests`);
}

/** The Cellar game's lowest-ranked are unmasked: their mask floats off and their favours vanish. */
function unmask(s: GameState, at: number): void {
  const c = s.cellar!;
  c.ranking = rankRace(c.race!);
  c.unmasked = c.unmaskings === 0 ? [] : c.ranking.slice(-c.unmaskings).map((r) => r.guest);
  for (const g of s.guests) if (c.unmasked.includes(g.id)) Object.assign(g, { unmaskedIn: s.round, favours: 0 });
  for (const room of s.rooms) {
    const leaving = room.members.filter((m) => c.unmasked.includes(m));
    if (leaving.length === 0) continue;
    room.members = room.members.filter((m) => !leaving.includes(m));
    room.unmasked = [...(room.unmasked ?? []), ...leaving];
  }
  s.phase = "unmasking";
  s.deadline = at + UNMASKING_MS;
}

/** After the unmasking: round N+1's Mingle, or the Last Dance once the rounds are done. */
function nextRound(s: GameState, at: number): GameState {
  if (s.round >= s.rounds) return { ...s, phase: "lastDance", deadline: null };
  const next = drawDance({ ...s, round: s.round + 1 });
  if (!next) throw new Error("the library has no Dance for the guests left");
  return openMingle(next, at);
}

/** Opens the round's Mingle; its standings are the totals as they stand now. */
function openMingle(s: GameState, at: number): GameState {
  const mingleStandings = Object.fromEntries(remaining(s).map((g) => [g.id, g.favours]));
  return { ...s, phase: "mingle", deadline: at + MINGLE_MS, mingleStandings };
}

/** Everything a guest may see; null for someone who has no seat. */
export function viewFor(state: GameState, guest: GuestId): GuestView | null {
  const me = state.guests.find((g) => g.id === guest);
  if (!me || state.host === null) return null;
  const guests = state.guests.map(({ id, name, mask, unmaskedIn }) => ({ id, name, mask: { ...mask }, unmasked: unmaskedIn !== undefined }));
  const seated = { you: guest, host: state.host, guests, rooms: state.rooms.map((r) => ({ id: r.id, members: [...r.members] })), chats: talkSheet(state, guest) };
  const def = state.danceDef;
  const announcement = def && { name: def.name, encore: state.danceEncore, rulesSummary: def.rulesSummary, workedExample: def.workedExample, masks: !!def.masks };
  const publicFavours = () => Object.fromEntries(remaining(state).map((g) => [g.id, g.favours]));
  const cellarGame = () => {
    const d = state.cellar!.def;
    return { name: d.name, encore: state.cellar!.encore, rulesSummary: d.rulesSummary, workedExample: d.workedExample, masks: !!d.masks };
  };
  switch (state.phase) {
    case "mingle":
      return { ...seated, phase: "mingle", round: state.round, deadline: state.deadline!, favours: me.favours,
        standings: { ...state.mingleStandings },
        gifts: state.gifts.filter((x) => x.round === state.round && (x.from === guest || x.to === guest)).map(({ from, to, favours }) => ({ from, to, favours })),
        announcement: announcement!,
      };
    case "dance": {
      const race = state.match;
      const auction = state.auction;
      const pledge = state.pledge;
      const playing = guest in (pledge ?? auction ?? race!).points;
      return {
        ...seated,
        phase: "dance",
        round: state.round,
        favours: me.favours,
        announcement: announcement!,
        buyRate: def!.buyRate,
        step: race && playing ? stepView(race, guest) : null,
        auction: auction && playing ? auctionView(auction, guest) : null,
        pledge: pledge && playing ? pledgeView(pledge, guest) : null,
        // The Pledge hides ranks until its final reveal.
        ranking: pledge ? publicRanking(pledge) : auction ? rankAuction(auction) : rankRace(race!),
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
        ranking: rankRace(c.race!),
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
      return { ...seated, phase: "lastDance", finalists: remaining(state).map((g) => g.id), favours: publicFavours() };
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
  const access: ChatAccess = [{ chat: "table", canPost: !unmasked && !cellarGame }];
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
  return state.deadline;
}
