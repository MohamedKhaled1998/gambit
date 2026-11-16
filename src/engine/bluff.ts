import type { BluffMatchDef, BluffState, BluffView, GuestId, RankingEntry, Rejection } from "../shared/types";
import { draw, drawInt } from "./random";

/** The Bluff match type: a secret card, a public claim, secret calls, then a reveal of the called cards only. */

const REVEAL_MS = 5000;

/** Every step's cards: an independent card from 1 to `maxCard` for each guest at each step. */
export function dealCards(seed: number, def: BluffMatchDef, guests: GuestId[], steps: number): [Record<GuestId, number>[], number] {
  const cards: Record<GuestId, number>[] = [];
  for (let i = 0; i < steps; i++) {
    const row: Record<GuestId, number> = {};
    for (const g of guests) [row[g], seed] = drawInt(seed, 1, def.maxCard);
    cards.push(row);
  }
  return [cards, seed];
}

export function startBluff(seed: number, def: BluffMatchDef, guests: GuestId[], at: number): [BluffState, number] {
  const steps = def.steps.dance!;
  let cards;
  [cards, seed] = dealCards(seed, def, guests, steps);
  const drawKeys: BluffState["drawKeys"] = {};
  const points: BluffState["points"] = {};
  const caught: BluffState["caught"] = {};
  for (const g of guests) {
    [drawKeys[g], seed] = draw(seed);
    points[g] = 0;
    caught[g] = 0;
  }
  const bluff: BluffState = { def, steps, step: 0, stage: "claim", stepStartedAt: at, claimDeadline: at, callDeadline: at, deadline: at, drawKeys, cards, claims: {}, calls: {}, points, caught };
  openStep(bluff, at);
  return [bluff, seed];
}

function openStep(b: BluffState, at: number): void {
  b.stage = "claim";
  b.stepStartedAt = at;
  b.claimDeadline = at + b.def.answerSeconds * 1000;
  b.callDeadline = b.claimDeadline + b.def.answerSeconds * 1000;
  b.deadline = b.claimDeadline;
  b.claims = {};
  b.calls = {};
}

function openCalls(b: BluffState, at: number): void {
  b.stage = "call";
  b.claimDeadline = at;
  b.callDeadline = at + b.def.answerSeconds * 1000;
  b.deadline = b.callDeadline;
}

/** Scores the step and opens its reveal at `at`. No claim scores 0, and nobody gains from calling it. */
function reveal(b: BluffState, at: number): void {
  const cards = b.cards[b.step]!;
  for (const g of Object.keys(b.points)) {
    const claim = b.claims[g];
    if (claim === undefined) continue;
    const callers = Object.keys(b.calls).filter((c) => b.calls[c] === g);
    if (!callers.length) b.points[g]! += claim;
    else if (cards[g]! >= claim) b.points[g]! += claim + b.def.honestBonus * callers.length;
    else
      for (const c of callers) {
        b.points[c]! += claim;
        b.caught[c]! += 1;
      }
  }
  b.stage = "reveal";
  b.deadline = at + REVEAL_MS;
}

/** Moves the clock to `at` (a deadline); returns false once the last reveal is over. */
export function advanceBluff(b: BluffState, at: number): boolean {
  if (b.stage === "claim") openCalls(b, at);
  else if (b.stage === "call") reveal(b, at);
  else if (b.step + 1 >= b.steps) return false;
  else {
    b.step += 1;
    openStep(b, at);
  }
  return true;
}

export function claimBluff(b: BluffState, guest: GuestId, value: number, now: number): Rejection | null {
  if (b.stage !== "claim" || now >= b.claimDeadline) return "too late";
  if (guest in b.claims) return "already claimed";
  if (!Number.isInteger(value) || value < 1 || value > b.def.maxCard) return "claims are whole values from 1 to the top card";
  b.claims[guest] = value;
  if (Object.keys(b.claims).length === Object.keys(b.points).length) openCalls(b, now);
  return null;
}

export function callBluff(b: BluffState, guest: GuestId, target: GuestId | null, now: number): Rejection | null {
  if (b.stage === "claim") return "wait for the call phase";
  if (b.stage !== "call" || now >= b.callDeadline) return "too late";
  if (guest in b.calls) return "already called";
  if (target !== null && !(typeof target === "string" && Object.hasOwn(b.points, target))) return "no such guest";
  if (target === guest) return "you can't call yourself";
  b.calls[guest] = target;
  if (Object.keys(b.calls).length === Object.keys(b.points).length) reveal(b, now);
  return null;
}

export function buyBluffPoints(b: BluffState, guest: GuestId, favours: number): void {
  b.points[guest]! += favours * b.def.buyRate;
}

/** A strict ranking: points, then more correct calls, then the draw. */
export function rankBluff(b: BluffState): RankingEntry[] {
  const entries = Object.keys(b.points).map((guest) => ({ guest, points: b.points[guest]!, calls: b.caught[guest]! }));
  entries.sort((x, y) => y.points - x.points || y.calls - x.calls || b.drawKeys[x.guest]! - b.drawKeys[y.guest]!);
  return entries.map((e, i) => {
    const tiedWith = (o?: typeof e) => !!o && o.points === e.points && o.calls === e.calls;
    return { guest: e.guest, points: e.points, time: 0, calls: e.calls, drawn: tiedWith(entries[i - 1]) || tiedWith(entries[i + 1]) };
  });
}

/** Everything one guest may see of the step: their own card and call, claims once closed, called cards at the reveal. */
export function bluffView(b: BluffState, guest: GuestId): BluffView {
  const revealed = b.stage === "reveal";
  const calls = Object.entries(b.calls).filter((e): e is [GuestId, GuestId] => e[1] !== null);
  return {
    index: b.step,
    total: b.steps,
    stage: b.stage,
    startedAt: b.stepStartedAt,
    claimDeadline: b.claimDeadline,
    callDeadline: b.callDeadline,
    deadline: b.deadline,
    maxCard: b.def.maxCard,
    yourCard: b.cards[b.step]![guest]!,
    yourClaim: b.claims[guest] ?? null,
    claims: b.stage === "claim" ? null : { ...b.claims },
    yourCall: b.calls[guest] ?? null,
    called: guest in b.calls,
    reveal: revealed
      ? {
          calls: calls.map(([caller, target]) => ({ caller, target })),
          cards: Object.fromEntries(calls.map(([, target]) => [target, b.cards[b.step]![target]!])),
        }
      : null,
  };
}
