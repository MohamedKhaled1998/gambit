import type { GuestId, Problem, RaceMatchDef, RaceState, RankingEntry, Rejection, StepView } from "../shared/types";
import { draw, shuffle } from "./random";
import { generateProblems } from "./problems";

/** The Race match type: same problems for every guest, four choices shuffled per guest, one answer per step. */

const REVEAL_MS = 3000;

/** How long a step's study lasts, in ms; 0 when the match has none. */
const studyMs = (def: RaceMatchDef, p: Problem) => (p.studySeconds ?? def.studySeconds) * 1000;

/** Opens a step's first stage at `at`: its study if it has one, else the answer phase. */
function openStep(race: RaceState, at: number): void {
  const study = studyMs(race.def, race.problems[race.step]!);
  race.stepStartedAt = at;
  race.answerStartedAt = at + study;
  race.answerDeadline = race.answerStartedAt + race.def.answerSeconds * 1000;
  race.stage = study > 0 ? "study" : "answer";
  race.deadline = study > 0 ? race.answerStartedAt : race.answerDeadline;
}

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
      [order, seed] = shuffle(seed, problems[i]!.choices.map((_, k) => k));
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
    answerStartedAt: at,
    answerDeadline: at,
    deadline: at,
    answers: {},
    points,
    time,
    results: {},
  };
  openStep(race, at);
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
    race.time[g]! += a.at - race.answerStartedAt;
  }
  race.stage = "reveal";
  race.deadline = at + REVEAL_MS;
}

/** Moves the clock to `at` (a deadline); returns false once the last reveal is over. */
export function advanceRace(race: RaceState, at: number): boolean {
  if (race.stage === "study") {
    race.stage = "answer";
    race.deadline = race.answerDeadline;
    return true;
  }
  if (race.stage === "answer") {
    reveal(race, at);
    return true;
  }
  if (race.step + 1 >= race.problems.length) return false;
  race.step += 1;
  race.answers = {};
  race.results = {};
  openStep(race, at);
  return true;
}

export function answerRace(race: RaceState, guest: GuestId, position: number, now: number): Rejection | null {
  if (race.stage === "study") return "wait for the answer phase";
  if (race.stage !== "answer" || now >= race.answerDeadline) return "too late";
  if (race.answers[guest]) return "already answered";
  if (!Number.isInteger(position) || position < 0 || position >= race.problems[race.step]!.choices.length) return "no such choice";
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
  const study = problem.study;
  const grid = study?.kind === "grid";
  const studying = race.stage === "study";
  const base = {
    index: race.step,
    total: race.problems.length,
    stage: race.stage,
    startedAt: race.stepStartedAt,
    answerStartedAt: race.answerStartedAt,
    answerDeadline: race.answerDeadline,
    deadline: race.deadline,
    lightsOut: race.stage === "answer" && !!study && study.kind !== "crowd",
    yourAnswer: race.answers[guest]?.position ?? null,
    reveal: race.stage === "reveal" ? { correct: layout.indexOf(0), yourResult: race.results[guest] ?? "none" } : null,
  };
  // The study shows its prompt and hides the question; the answer phase hides the study again.
  if (studying) {
    const masks = grid ? layout.map((i) => study!.masks[i]!) : study!.masks;
    return { ...base, prompt: "", choices: [], study: { ...study!, masks } };
  }
  return {
    ...base,
    prompt: problem.prompt,
    // A tile grid's cells are anonymous: their names would give the answer away.
    choices: layout.map((i, pos) => (grid ? `Cell ${pos + 1}` : problem.choices[i]!)),
    ...(grid && { grid: { cols: study!.cols! } }),
    ...(problem.promptMasks && { promptMasks: problem.promptMasks }),
    ...(problem.choiceMasks && { choiceMasks: layout.map((i) => problem.choiceMasks![i]!) }),
  };
}
