import { describe, expect, it } from "vitest";
import { apply, viewFor } from "../../src/engine/game";
import { LIBRARY } from "../../src/content/library";
import { playableCount, voteChance, voteCounts, type Playable } from "../../src/engine/schedule";
import { GREED_REWARD, VOTE_BALLOT_MS, VOTE_REVEAL_MS, type GameState, type VoteChoice } from "../../src/shared/types";
import { must, startedRaw, tickOnce } from "./sim";

const CAN: Playable = {
  dance: (n) => LIBRARY.some((m) => m.guestRange.dance && n >= m.guestRange.dance[0] && n <= m.guestRange.dance[1]),
  cellar: (n) => LIBRARY.some((m) => m.guestRange.cellar && n >= m.guestRange.cellar[0] && n <= m.guestRange.cellar[1]),
};

/** Every vote a game with nobody acting runs into, from the first one on: the state as it opens, and the round's other phases passed. */
function votesOf(n: number, seed: number, only = false): GameState[] {
  const found: GameState[] = [];
  let s = startedRaw(n, seed);
  for (let i = 0; i < 400 && s.phase !== "lastDance"; i++) {
    if (only && found.length > 0) break;
    if (s.phase === "vote" && s.vote!.stage === "ballot") found.push(s);
    s = tickOnce(s);
  }
  return found;
}

/** The first game of this size whose first vote comes at the given time, and that state. */
function firstVote(n: number, during: "start" | "dance"): GameState {
  for (let seed = 1; seed < 500; seed++) {
    const v = votesOf(n, seed, true)[0];
    if (v && v.vote!.during === during && v.round === 1) return v;
  }
  throw new Error(`no seed holds a ${during} vote for ${n} guests`);
}

const ids = (s: GameState) => s.guests.filter((g) => g.unmaskedIn === undefined).map((g) => g.id);

/** Casts these ballots (by guest index) and ticks to the end of the ballot. */
function ballot(s: GameState, choices: Record<number, VoteChoice>): GameState {
  for (const [i, choice] of Object.entries(choices)) s = must(s, { type: "vote", guest: `g${i}`, choice }, s.deadline! - 5000);
  return tickOnce(s);
}

describe("when the Unmasking vote comes", { timeout: 60_000 }, () => {
  it("holds at least one vote in every game and never one in the last round", () => {
    for (const n of [4, 5, 6, 7, 8, 9, 10]) {
      for (let seed = 1; seed <= 25; seed++) {
        const votes = votesOf(n, seed);
        expect(votes.length, `${n} guests, seed ${seed}`).toBeGreaterThan(0);
        expect(votes.every((v) => v.round < v.rounds)).toBe(true);
      }
    }
  });

  it("holds one in round 2 if round 1 held none", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const votes = votesOf(4, seed);
      if (votes[0]!.round === 2) expect(votes).toHaveLength(1);
    }
    expect(Array.from({ length: 100 }, (_, i) => votesOf(4, i + 1, true)[0]!.round)).toContain(2);
  });

  it("follows (remaining guests − 2) ÷ 8 in round 1, from the seed alone", () => {
    expect([10, 8, 6, 4].map(voteChance)).toEqual([1, 0.75, 0.5, 0.25]);
    const share = (n: number) => Array.from({ length: 200 }, (_, i) => votesOf(n, i + 1, true)[0]!.round === 1).filter(Boolean).length / 200;
    expect(share(10)).toBe(1);
    expect(share(8)).toBeGreaterThan(0.65);
    expect(share(8)).toBeLessThan(0.85);
    expect(share(6)).toBeGreaterThan(0.4);
    expect(share(6)).toBeLessThan(0.6);
    expect(votesOf(6, 7).map((v) => v.round)).toEqual(votesOf(6, 7).map((v) => v.round));
  });

  it("comes at the start of the round or partway through its Dance with equal odds", () => {
    const first = Array.from({ length: 200 }, (_, i) => votesOf(10, i + 1, true)[0]!.vote!.during);
    const start = first.filter((d) => d === "start").length / 200;
    expect(start).toBeGreaterThan(0.4);
    expect(start).toBeLessThan(0.6);
  });

  it("opens a start vote before the Mingle, which then keeps all its minutes", () => {
    const v = firstVote(10, "start");
    expect(v.phase).toBe("vote");
    const after = tickOnce(tickOnce(v));
    expect(after.phase).toBe("mingle");
    expect(after.deadline).toBe(v.deadline! + VOTE_REVEAL_MS + 4 * 60_000);
  });
});

describe("the ballot", () => {
  const vote = () => firstVote(10, "start");

  it("lasts 25 seconds, then reveals for 10", () => {
    const v = vote();
    const open = v.deadline! - VOTE_BALLOT_MS;
    const revealed = tickOnce(v);
    expect(revealed.vote!.stage).toBe("reveal");
    expect(revealed.deadline).toBe(open + VOTE_BALLOT_MS + VOTE_REVEAL_MS);
  });

  it("offers the lower count and one more", () => {
    const v = viewFor(vote(), "g0");
    expect(v).toMatchObject({ phase: "vote", dim: true, mercy: 2, greed: 3, stage: "ballot" });
  });

  it("hides every ballot, even your own from others, until the reveal, then shows all with names", () => {
    let s = must(vote(), { type: "vote", guest: "g1", choice: "greed" }, 0);
    s = must(s, { type: "vote", guest: "g2", choice: "mercy" }, 0);
    expect(viewFor(s, "g1")).toMatchObject({ yourBallot: "greed", reveal: null });
    expect(viewFor(s, "g3")).toMatchObject({ yourBallot: null, reveal: null });
    const revealed = tickOnce(s);
    const view = viewFor(revealed, "g3") as Extract<ReturnType<typeof viewFor>, { phase: "vote" }>;
    expect(view.reveal!.ballots).toHaveLength(10);
    expect(view.reveal!.ballots.find((b) => b.guest === "g1")).toEqual({ guest: "g1", choice: "greed", cast: true });
    expect(view.reveal!.ballots.find((b) => b.guest === "g5")).toEqual({ guest: "g5", choice: "mercy", cast: false });
  });

  it("takes one ballot a guest, from a remaining guest, while it is open", () => {
    const s = vote();
    const voted = must(s, { type: "vote", guest: "g0", choice: "greed" }, 0);
    expect(apply(voted, { type: "vote", guest: "g0", choice: "mercy" }, 0)).toEqual({ ok: false, reason: "already voted" });
    expect(apply(s, { type: "vote", guest: "zz", choice: "mercy" }, 0)).toEqual({ ok: false, reason: "no such guest" });
    expect(apply(s, { type: "vote", guest: "g0", choice: "mercy" }, s.deadline!)).toEqual({ ok: false, reason: "too late" });
    expect(apply(tickOnce(s), { type: "vote", guest: "g0", choice: "mercy" }, 0)).toEqual({ ok: false, reason: "no vote is running" });
    expect(apply(startedRaw(4), { type: "vote", guest: "g0", choice: "mercy" }, 0)).toEqual({ ok: false, reason: "no vote is running" });
  });

  const six = () => {
    for (let seed = 1; seed < 500; seed++) {
      const v = votesOf(6, seed, true)[0];
      if (v && v.round === 1 && v.vote!.during === "start") return v;
    }
    throw new Error("no seed");
  };

  it("lets Mercy win only with a strict majority of the guests", () => {
    // Six guests: Mercy 1, Greed 2.
    expect(ballot(six(), { 0: "mercy", 1: "mercy", 2: "mercy", 3: "mercy" }).vote!.result).toMatchObject({ mercyWon: true, count: 1 });
    expect(ballot(six(), { 0: "mercy", 1: "mercy", 2: "mercy", 3: "greed", 4: "greed", 5: "greed" }).vote!.result).toMatchObject({ mercyWon: false, count: 2 });
  });

  it("gives a tie to Greed", () => {
    expect(ballot(six(), { 0: "mercy", 1: "mercy", 2: "mercy", 3: "greed", 4: "greed", 5: "greed" }).voteCount).toBe(2);
  });

  it("counts an absent guest as Mercy", () => {
    // Two Greed voters, one Mercy voter and three who never voted: four Mercy.
    const s = ballot(six(), { 0: "greed", 1: "greed", 2: "mercy" });
    expect(s.vote!.result).toMatchObject({ mercyWon: true, count: 1 });
    // Three Greed voters against three absent guests is a tie.
    expect(ballot(six(), { 0: "greed", 1: "greed", 2: "greed" }).vote!.result).toMatchObject({ mercyWon: false, count: 2 });
  });

  it("pays every Greed voter 2 favours at the reveal, whatever the outcome", () => {
    const before = six();
    const mercy = ballot(before, { 0: "greed", 1: "mercy", 2: "mercy", 3: "mercy" });
    expect(mercy.vote!.result!.mercyWon).toBe(true);
    const favours = (s: GameState, i: number) => s.guests[i]!.favours;
    expect(favours(mercy, 0)).toBe(favours(before, 0) + GREED_REWARD);
    expect(favours(mercy, 1)).toBe(favours(before, 1));
    const greed = ballot(before, { 0: "greed", 1: "greed", 2: "greed", 3: "greed" });
    expect(favours(greed, 3)).toBe(favours(before, 3) + GREED_REWARD);
    expect(viewFor(greed, "g0")).toMatchObject({ favours: favours(before, 0) + GREED_REWARD });
  });

  it("makes the round unmask the chosen count and recomputes the schedule after it", () => {
    for (const choices of [{ 0: "mercy", 1: "mercy", 2: "mercy", 3: "mercy" }, { 0: "greed", 1: "greed", 2: "greed" }] as Record<number, VoteChoice>[]) {
      let s = ballot(six(), choices);
      const count = s.voteCount!;
      const unmasked: number[] = [];
      for (let i = 0; i < 2000 && s.phase !== "lastDance"; i++) {
        s = tickOnce(s);
        if (s.phase === "vote" && s.vote!.stage === "ballot") s = tickOnce(tickOnce(s));
        if (s.phase === "unmasking") unmasked.push(s.cellar!.unmasked.length);
      }
      expect(unmasked[0]).toBe(count);
      expect(unmasked.reduce((a, b) => a + b, 0)).toBe(4);
      expect(ids(s)).toHaveLength(2);
    }
  });

  it("turns the round into a warm-up when Mercy wins on 0", () => {
    let four: GameState | null = null;
    for (let seed = 1; seed < 500 && !four; seed++) {
      const v = votesOf(4, seed, true)[0];
      if (v && v.vote!.mercy === 0 && v.vote!.during === "start") four = v;
    }
    let s = ballot(four!, { 0: "mercy", 1: "mercy", 2: "mercy" });
    expect(s.voteCount).toBe(0);
    while (s.phase !== "sentDown") {
      s = tickOnce(s);
      if (s.phase === "vote") s = tickOnce(tickOnce(s));
    }
    expect(viewFor(s, "g0")).toMatchObject({ unmaskings: 0 });
  });
});

describe("the ballot's counts", () => {
  /** Mercy and Greed for the coming round, by guests remaining and rounds left. */
  const counts = (remaining: number, rounds: number) => voteCounts({ remaining, rounds }, CAN);

  it("offers k and k + 1 from every starting count from 4 to 10, shifting down when k + 1 leaves a later round unplayable", () => {
    // Round 1 of three. Starting counts 4-10; null is a round with no vote.
    expect([4, 5, 6, 7, 8, 9, 10].map((n) => counts(n, 3))).toEqual([
      { mercy: 0, greed: 1 },
      { mercy: 1, greed: 2 },
      { mercy: 1, greed: 2 },
      { mercy: 1, greed: 2 },
      { mercy: 2, greed: 3 },
      { mercy: 2, greed: 3 },
      { mercy: 2, greed: 3 },
    ]);
  });

  it("shifts the ballot down one in round 2 when Greed would leave fewer than three guests", () => {
    // Four guests, two rounds left: Greed 2 would leave two guests for the last round's Dance.
    expect(counts(4, 2)).toEqual({ mercy: 0, greed: 1 });
    expect(counts(5, 2)).toEqual({ mercy: 1, greed: 2 });
    expect(counts(10, 2)).toEqual({ mercy: 4, greed: 5 });
  });

  it("holds no vote when a round can't offer two playable counts", () => {
    expect(counts(3, 2)).toBeNull();
  });

  it("only ever offers counts that leave every later round playable, from every starting count", () => {
    for (let start = 4; start <= 10; start++) {
      for (let remaining = 4; remaining <= start; remaining++) {
        for (const rounds of [3, 2]) {
          const c = counts(remaining, rounds);
          if (!c) continue;
          expect(c.greed).toBe(c.mercy + 1);
          for (const count of [c.mercy, c.greed]) expect(playableCount({ remaining, rounds, count }, CAN), `${remaining} guests, ${rounds} rounds, ${count}`).toBe(true);
        }
      }
    }
  });

  it("never needs the no-vote case for the guaranteed vote, from every starting count", () => {
    for (let start = 4; start <= 10; start++) {
      for (let remaining = 4; remaining <= start; remaining++) expect(counts(remaining, 2), `${remaining} guests in round 2`).not.toBeNull();
    }
  });
});

describe("a vote during a Dance", { timeout: 60_000 }, () => {
  const danceVote = (n: number) => {
    for (let seed = 1; seed < 500; seed++) {
      const found = votesOf(n, seed).find((v) => v.vote!.during === "dance");
      if (found) return { seed, vote: found };
    }
    throw new Error("no seed");
  };

  /** The running Dance match, whichever its type. */
  const running = (s: GameState) => s.pledge ?? s.auction ?? s.pick ?? s.match!;

  it("starts only between steps, when the step's reveal ends", () => {
    for (const n of [10, 8, 6]) {
      const { vote } = danceVote(n);
      expect(running(vote).stage).toBe("reveal");
      expect(vote.vote!.deadline - VOTE_BALLOT_MS).toBe(running(vote).deadline);
    }
  });

  it("resumes the match with fresh deadlines, losing no step and cutting none short", () => {
    for (let seed = 1; seed < 40; seed++) {
      const found = votesOf(10, seed).find((v) => v.vote!.during === "dance");
      if (!found) continue;
      const m = running(found);
      const step = m.step;
      const lengthBefore = m.deadline - m.stepStartedAt;
      const paused = tickOnce(found);
      expect(paused.phase).toBe("vote");
      expect(running(paused).step).toBe(step);
      const resumed = tickOnce(paused);
      expect(resumed.phase).toBe("dance");
      expect(running(resumed).step).toBe(step + 1);
      expect(running(resumed).stepStartedAt).toBe(found.deadline! + VOTE_REVEAL_MS);
      expect(resumed.deadline).toBeGreaterThan(running(resumed).stepStartedAt);
      expect(lengthBefore).toBeGreaterThan(0);
    }
  });

  it("plays every step of the match, the same number with or without the vote", () => {
    const { seed } = danceVote(10);
    const stepsSeen = (withVote: boolean) => {
      let s = startedRaw(10, seed);
      const seen = new Set<string>();
      for (let i = 0; i < 400 && s.phase !== "sentDown"; i++) {
        if (s.phase === "dance") seen.add(`${running(s).step}`);
        s = tickOnce(s);
        if (s.phase === "vote" && !withVote) s = tickOnce(s);
        if (s.phase === "vote") s = tickOnce(s);
      }
      return seen.size;
    };
    expect(stepsSeen(true)).toBe(stepsSeen(false));
  });

  it("lets a Greed voter spend the reward at once, in the paused Dance", () => {
    const { vote } = danceVote(10);
    let s = must(vote, { type: "vote", guest: "g1", choice: "greed" }, 0);
    s = tickOnce(s);
    const before = s.guests[1]!.favours;
    const points = running(s).points["g1"]!;
    s = must(s, { type: "buyPoints", guest: "g1", favours: GREED_REWARD }, s.deadline! - 1000);
    expect(s.guests[1]!.favours).toBe(before - GREED_REWARD);
    expect(running(s).points["g1"]).toBeGreaterThan(points);
  });

  it("takes no answers to the paused match", () => {
    const { vote } = danceVote(10);
    expect(apply(vote, { type: "pick", guest: "g0", number: 1 }, 0).ok).toBe(false);
    expect(apply(vote, { type: "buyPoints", guest: "g0", favours: 1 }, 0).ok).toBe(false);
  });
});
