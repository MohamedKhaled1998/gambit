import type { GuestId, RaceMatchDef, RaceState, RankingEntry, Rejection, StepView } from "../shared/types";
import { draw, shuffle } from "./random";
import { generateProblems } from "./problems";

/** The Race match type: same problems for every guest, four choices shuffled per guest, one answer per step. */

const REVEAL_MS = 3000;

export function startRace(seed: number, def: RaceMatchDef, guests: GuestId[], at: number, steps: number): [RaceState, number] {
  let problems;
  [problems, seed] = generateProblems(seed, def, steps);
  const layouts: RaceState["layouts"] = {};
  const drawKeys: RaceState["drawKeys"] = {};
  const points: RaceState["points"] = {};
  const time: RaceState["time"] = {};
  for (const g of guests) {
    layouts[g] = [];
    for (let i = 0; i < steps; i++) {
      let order: number[];
      [order, seed] = shuffle(seed, [0, 1, 2, 3]);
      layouts[g]!.push(order);
    }
    [drawKeys[g], seed] = draw(seed);
    points[g] = 0;
    time[g] = 0;
  }
  const race: RaceState = {
    def,
    problems,
    layouts,
    drawKeys,
    step: 0,
    stage: "answer",
    stepStartedAt: at,
    answerDeadline: at + def.answerSeconds * 1000,
    deadline: at + def.answerSeconds * 1000,
    answers: {},
    points,
    time,
    results: {},
  };
  return [race, seed];
}

/** Scores the step and opens its reveal at `at`. */
function reveal(race: RaceState, at: number): void {
  const { def } = race;
  const correctIndex = 0;
  race.results = {};
  for (const g of Object.keys(race.points)) {
    const a = race.answers[g];
    if (!a) {
      race.results[g] = "none";
      race.time[g]! += def.answerSeconds * 1000;
      continue;
    }
    const right = race.layouts[g]![race.step]![a.position] === correctIndex;
    race.results[g] = right ? "right" : "wrong";
    if (right) race.points[g]! += def.pointsPerCorrect;
    race.time[g]! += a.at - race.stepStartedAt;
  }
  race.stage = "reveal";
  race.deadline = at + REVEAL_MS;
}

/** Moves the clock to `at` (a deadline); returns false once the last reveal is over. */
export function advanceRace(race: RaceState, at: number): boolean {
  if (race.stage === "answer") {
    reveal(race, at);
    return true;
  }
  if (race.step + 1 >= race.problems.length) return false;
  race.step += 1;
  race.stage = "answer";
  race.answers = {};
  race.results = {};
  race.stepStartedAt = at;
  race.answerDeadline = at + race.def.answerSeconds * 1000;
  race.deadline = race.answerDeadline;
  return true;
}

export function answerRace(race: RaceState, guest: GuestId, position: number, now: number): Rejection | null {
  if (race.stage !== "answer" || now >= race.answerDeadline) return "too late";
  if (race.answers[guest]) return "already answered";
  if (!Number.isInteger(position) || position < 0 || position > 3) return "no such choice";
  race.answers[guest] = { position, at: now };
  if (Object.keys(race.answers).length === Object.keys(race.points).length) reveal(race, now);
  return null;
}

export function buyPoints(race: RaceState, guest: GuestId, favours: number): void {
  race.points[guest]! += favours * race.def.buyRate;
}

/** A strict ranking: points, then lower total answer time, then the draw. */
export function rankRace(race: RaceState): RankingEntry[] {
  const entries = Object.keys(race.points).map((guest) => ({ guest, points: race.points[guest]!, time: race.time[guest]! }));
  entries.sort((a, b) => b.points - a.points || a.time - b.time || race.drawKeys[a.guest]! - race.drawKeys[b.guest]!);
  return entries.map((e, i) => {
    const tiedWith = (o?: typeof e) => !!o && o.points === e.points && o.time === e.time;
    return { ...e, drawn: tiedWith(entries[i - 1]) || tiedWith(entries[i + 1]) };
  });
}

export function stepView(race: RaceState, guest: GuestId): StepView {
  const layout = race.layouts[guest]![race.step]!;
  const problem = race.problems[race.step]!;
  const revealed = race.stage === "reveal";
  return {
    index: race.step,
    total: race.problems.length,
    stage: race.stage,
    startedAt: race.stepStartedAt,
    answerDeadline: race.answerDeadline,
    deadline: race.deadline,
    prompt: problem.prompt,
    choices: layout.map((i) => problem.choices[i]!),
    yourAnswer: race.answers[guest]?.position ?? null,
    reveal: revealed ? { correct: layout.indexOf(0), yourResult: race.results[guest] ?? "none" } : null,
  };
}
