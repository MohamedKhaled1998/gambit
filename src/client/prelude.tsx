import { useState } from "react";
import { PRELUDE_GUESTS, type Announcement, type AuctionView, type BluffView, type ClientAction, type NarratorLine, type PreludeBeat, type PreludeScreen, type PreludeView, type StepView } from "../shared/types";
import { OVERTURE } from "../content/narrator";
import { ColourStrip } from "./mask";

/** What the Prelude's panels are given as `act`: made-up guests can't be played for. */
const noAct = (_: ClientAction): void => {};

/** The beat playing at `now`, given when the script started; null once it is over. */
export function beatAt(script: PreludeBeat[], startsAt: number, now: number): { beat: PreludeBeat; elapsed: number } | null {
  let at = startsAt;
  for (const b of script) {
    if (now < at + b.seconds * 1000) return { beat: b, elapsed: Math.max(0, now - at) };
    at += b.seconds * 1000;
  }
  return null;
}

/** A Prelude beat's screen as the real play screen's view, from Ana's seat. */
export function screenViews(s: PreludeScreen, seconds: number): { step?: StepView; auction?: AuctionView; bluff?: BluffView } {
  const base = { index: 0, total: 1, startedAt: 0, deadline: seconds * 1000 };
  if (s.kind === "step")
    return {
      step: {
        ...base, stage: s.stage, answerStartedAt: 0, answerDeadline: base.deadline, prompt: s.prompt, ...(s.study && { study: s.study }), lightsOut: !!s.lightsOut, ...(s.grid && { grid: s.grid }),
        choices: s.choices, ...(s.promptMasks && { promptMasks: s.promptMasks }), ...(s.choiceMasks && { choiceMasks: s.choiceMasks }), yourAnswer: s.taps?.["ana"] ?? null,
        reveal: s.correct === undefined ? null : { correct: s.correct, yourResult: s.taps?.["ana"] === s.correct ? "right" : s.taps?.["ana"] === undefined ? "none" : "wrong" },
      },
    };
  if (s.kind === "lot")
    return {
      auction: {
        ...base, stage: s.stage, bidDeadline: base.deadline, lot: s.points, points: 50, yourBid: s.bids?.find((b) => b.guest === "ana")?.amount ?? null,
        reveal: s.stage === "reveal" ? { bids: s.bids ?? [], winner: s.winner ?? null, price: s.price ?? 0 } : null,
      },
    };
  const yourClaim = s.claims?.["ana"] ?? null;
  return {
    bluff: {
      ...base, stage: s.stage, claimDeadline: base.deadline, callDeadline: base.deadline, maxCard: 9, yourCard: s.card, yourClaim,
      claims: s.stage === "claim" ? null : (s.claims ?? null), yourCall: s.calls?.find((c) => c.caller === "ana")?.target ?? null, called: !!s.calls,
      reveal: s.stage === "reveal" ? { calls: s.calls ?? [], cards: s.cards ?? {} } : null,
    },
  };
}

/** The caption bar: the Narrator's line while it plays, or the Overture. */
export function Caption({ narrator, overtureUntil, now }: { narrator: NarratorLine | null; overtureUntil: number | null; now: number }) {
  if (overtureUntil !== null && now < overtureUntil) return <p className="caption" role="status">{OVERTURE.text}</p>;
  if (narrator && now >= narrator.startedAt && now < narrator.startedAt + narrator.seconds) return <p className="caption" role="status">{narrator.text}</p>;
  return null;
}

/** The Rules card: the match's rules summary and worked example as text, with the colour strip for mask matches. */
export function RulesCard({ announcement }: { announcement: Announcement }) {
  return (
    <section className="rules-card">
      <h2>{announcement.name}{announcement.encore ? " (an Encore)" : ""}</h2>
      <p>{announcement.rulesSummary}</p>
      <p><em>{announcement.workedExample}</em></p>
      {announcement.masks && <ColourStrip />}
    </section>
  );
}

/**
 * The match's Prelude and Rules card, for whichever screen carries them. While the Prelude plays, every phone shows
 * the same beat from the game's clock; skipping, or the rules button, shows the Rules card; the button can also
 * replay the Prelude, which runs on this phone's own clock and never holds the game.
 */
export function PreludeSection({ announcement, prelude, now, act, renderScreen, cardOpen = false }: {
  announcement: Announcement;
  prelude: PreludeView | null;
  now: number;
  act: (a: ClientAction) => void;
  /** The Rules card starts open (in the Mingle, where the Dance is announced). */
  cardOpen?: boolean | undefined;
  renderScreen(views: ReturnType<typeof screenViews>, guests: typeof PRELUDE_GUESTS, elapsed: number): React.ReactNode;
}) {
  const [card, setCard] = useState(cardOpen);
  const [replayFrom, setReplayFrom] = useState<number | null>(null);
  const live = prelude && now >= prelude.startsAt && now < prelude.endsAt && !prelude.skipped;
  const startsAt = live ? prelude.startsAt : replayFrom;
  const playing = startsAt === null ? null : beatAt(announcement.prelude, startsAt, now);
  const beat = playing?.beat;
  const showing = !!beat;
  return (
    <>
      {showing && (
        <section className="prelude">
          <p className="caption" role="status">{beat.caption}</p>
          {beat.screen && renderScreen(screenViews(beat.screen, beat.seconds), PRELUDE_GUESTS, playing.elapsed)}
          {live && <button onClick={() => act({ type: "skipPrelude" })}>Skip to the Rules card</button>}
          {!live && <button onClick={() => setReplayFrom(null)}>Close</button>}
        </section>
      )}
      {!showing && (card || !!prelude?.skipped) && <RulesCard announcement={announcement} />}
      {!live && !showing && (
        <p>
          <button onClick={() => setCard(!card)}>{card ? "Hide the rules" : "Rules"}</button>{" "}
          {announcement.prelude.length > 0 && !announcement.encore && <button onClick={() => { setReplayFrom(now); setCard(false); }}>Replay the Prelude</button>}
        </p>
      )}
    </>
  );
}
