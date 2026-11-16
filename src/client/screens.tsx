import { useEffect, useState } from "react";
import { MINGLE_MS, SENT_DOWN_MS, UNMASKING_MS, type ClientAction, type GuestView, type StepView, type AlongView, type Announcement, type PreludeView, type AuctionView, type BluffView, type PredictionsView, type PredictionsReveal, type PublicGuest, type RankingEntry } from "../shared/types";
import { ColourStrip, MaskIcon, maskLabel } from "./mask";
import { rejoinLink } from "./connection";
import { Caption, PreludeSection } from "./prelude";
import { useSound } from "./audio";
import { Talk, type TalkLink } from "./talk";

type Act = (action: ClientAction) => void;

/** Server time now, from this phone's clock and the offset measured at connect. */
function useServerNow(offset: number): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 200);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

const PHASES = ["Mingle", "Dance", "Sent down", "Cellar", "Unmasking"] as const;

/** Where the round is: a rail of its phases, the current one lit. */
function PhaseRail({ phase }: { phase: "mingle" | "dance" | "sentDown" | "cellar" | "unmasking" }) {
  const current = { mingle: 0, dance: 1, sentDown: 2, cellar: 3, unmasking: 4 }[phase];
  return (
    <ol className="rail">
      {PHASES.map((p, i) => (
        <li key={p} className={i === current ? "here" : i < current ? "done" : ""}>{p}</li>
      ))}
    </ol>
  );
}

/** A candle that burns down to a deadline, with the seconds left. */
function Candle({ deadline, length, now }: { deadline: number; length: number; now: number }) {
  const left = Math.max(0, deadline - now);
  return (
    <div className="candle" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
      <div className="wax"><div style={{ height: `${Math.min(100, (left / length) * 100)}%` }} /></div>
      <span>{Math.ceil(left / 1000)}s</span>
    </div>
  );
}

function Ranking({ ranking, guests, you }: { ranking: RankingEntry[]; guests: PublicGuest[]; you: string }) {
  return (
    <ol className="ranking">
      {ranking.map((r, i) => {
        const g = guests.find((x) => x.id === r.guest)!;
        return (
          <li key={r.guest} className={r.guest === you ? "me" : ""}>
            <span>{i + 1}</span><MaskIcon mask={g.mask} /><span style={{ flex: 1 }}>{g.name}</span>
            <span>{r.points}{r.drawn ? " (drawn)" : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The study phase: a crowd all at once, a grid in the guest's own layout, a sequence one mask a second. */
function StudyStage({ study, startedAt, now }: { study: NonNullable<StepView["study"]>; startedAt: number; now: number }) {
  if (study.kind === "sequence") {
    const i = Math.min(study.masks.length - 1, Math.max(0, Math.floor((now - startedAt) / 1000)));
    return <p className="prompt-masks"><MaskIcon mask={study.masks[i]!} size={96} /></p>;
  }
  if (study.kind === "grid")
    return (
      <div className="tile-grid study" style={{ gridTemplateColumns: `repeat(${study.cols}, 1fr)` }}>
        {study.masks.map((m, i) => <MaskIcon key={i} mask={m} size={48} />)}
      </div>
    );
  return <p className="prompt-masks">{study.masks.map((m, i) => <MaskIcon key={i} mask={m} size={32} />)}</p>;
}

function StepPanel({ step, favours, buyRate, now, act }: { step: StepView; favours: number; buyRate: number; now: number; act: Act }) {
  const [spend, setSpend] = useState(1);
  return (
    <>
      <p>Step {step.index + 1} of {step.total} · you hold {favours} favours</p>
      <Candle deadline={step.stage === "reveal" ? step.deadline : step.stage === "study" ? step.deadline : step.answerDeadline} length={step.stage === "study" ? step.deadline - step.startedAt : step.stage === "answer" ? step.answerDeadline - step.answerStartedAt : 3000} now={now} />
      <div className={step.lightsOut ? "stage lights-out" : "stage"}>
      {step.study ? (
        <StudyStage study={step.study} startedAt={step.startedAt} now={now} />
      ) : step.promptMasks ? (
        <p className="prompt-masks">{step.promptMasks.map((m, i) => <MaskIcon key={i} mask={m} size={48} />)}<span className="prompt">?</span></p>
      ) : (
        <p className="prompt">{step.prompt}</p>
      )}
      <div className={step.grid ? "choices tile-grid" : step.choiceMasks ? "choices with-masks" : "choices"} style={step.grid ? { gridTemplateColumns: `repeat(${step.grid.cols}, 1fr)` } : undefined}>
        {step.choices.map((c, i) => {
          const r = step.reveal;
          const cls = r ? (i === r.correct ? "right" : i === step.yourAnswer ? "wrong" : "") : i === step.yourAnswer ? "picked" : "";
          return (
            <button key={i} className={cls} disabled={step.stage !== "answer" || step.yourAnswer !== null} onClick={() => act({ type: "answer", position: i })} aria-label={step.choiceMasks ? maskLabel(step.choiceMasks[i]!) : step.grid ? c : undefined}>{step.choiceMasks ? <MaskIcon mask={step.choiceMasks[i]!} size={64} /> : step.grid ? "" : c}</button>
          );
        })}
      </div>
      </div>
      {step.reveal && <p>{{ right: "✓ Right: ten points.", wrong: "✗ Not that one.", none: "No answer: no points." }[step.reveal.yourResult]}</p>}
      <p>
        Buy points ({buyRate} each):{" "}
        <input type="number" min={1} max={favours} value={spend} onChange={(e) => setSpend(Math.max(1, Math.floor(Number(e.target.value))))} style={{ width: "4rem" }} />
        <button disabled={favours < 1 || spend > favours} onClick={() => act({ type: "buyPoints", favours: spend })}>Spend favours</button>
      </p>
    </>
  );
}

/** The bid entry and reveal screens of a Sealed bid lot. */
function BidPanel({ auction, guests, you, favours, buyRate, now, act }: { auction: AuctionView; guests: PublicGuest[]; you: string; favours: number; buyRate: number; now: number; act: Act }) {
  const [amount, setAmount] = useState(0);
  const [spend, setSpend] = useState(1);
  const r = auction.reveal;
  const name = (id: string) => guests.find((g) => g.id === id)!.name;
  return (
    <>
      <p>Lot {auction.index + 1} of {auction.total} · you hold {auction.points} points and {favours} favours</p>
      <Candle deadline={auction.deadline} length={auction.stage === "bid" ? auction.bidDeadline - auction.startedAt : 5000} now={now} />
      <p className="prompt">A lot worth {auction.lot} points</p>
      {auction.stage === "bid" ? (
        auction.yourBid === null ? (
          <p>
            <input type="number" min={0} max={auction.points} value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))} style={{ width: "5rem" }} />
            <button disabled={amount > auction.points} onClick={() => act({ type: "bid", amount })}>Bid in secret</button>
          </p>
        ) : (
          <p>You bid {auction.yourBid}. The others are still bidding.</p>
        )
      ) : (
        <>
          <ol className="ranking">
            {r!.bids.map((b) => <li key={b.guest} className={b.guest === you ? "me" : ""}><span>{name(b.guest)}</span><span>{b.amount}</span>{b.guest === r!.winner && <span>wins</span>}</li>)}
          </ol>
          <p>{r!.winner ? `${name(r!.winner)} pays ${r!.price} and gains ${auction.lot}.` : "Nobody bid: the lot goes unsold."}</p>
        </>
      )}
      <p>
        Buy points ({buyRate} each):{" "}
        <input type="number" min={1} max={favours} value={spend} onChange={(e) => setSpend(Math.max(1, Math.floor(Number(e.target.value))))} style={{ width: "4rem" }} />
        <button disabled={favours < 1 || spend > favours} onClick={() => act({ type: "buyPoints", favours: spend })}>Spend favours</button>
      </p>
    </>
  );
}

/** The card grid, claim entry, choice grid and reveal of a Bluff step. */
function ToastPanel({ bluff, guests, you, favours, buyRate, now, act }: { bluff: BluffView; guests: PublicGuest[]; you: string; favours: number; buyRate: number; now: number; act: Act }) {
  const [value, setValue] = useState(1);
  const [spend, setSpend] = useState(1);
  const name = (id: string) => guests.find((g) => g.id === id)!.name;
  const others = guests.filter((g) => !g.unmasked && g.id !== you);
  const length = bluff.stage === "claim" ? bluff.claimDeadline - bluff.startedAt : bluff.stage === "call" ? bluff.callDeadline - bluff.claimDeadline : 5000;
  const r = bluff.reveal;
  return (
    <>
      <p>Toast {bluff.index + 1} of {bluff.total} · you hold {favours} favours</p>
      <Candle deadline={bluff.deadline} length={length} now={now} />
      <p className="prompt">Your card: {bluff.yourCard}</p>
      {bluff.stage === "claim" &&
        (bluff.yourClaim === null ? (
          <p>
            <input type="number" min={1} max={bluff.maxCard} value={value} onChange={(e) => setValue(Math.max(1, Math.floor(Number(e.target.value))))} style={{ width: "4rem" }} />
            <button disabled={value > bluff.maxCard} onClick={() => act({ type: "claim", value })}>Raise your toast</button>
          </p>
        ) : (
          <p>You toasted {bluff.yourClaim}. The others are still raising theirs.</p>
        ))}
      {bluff.stage !== "claim" && (
        <ol className="ranking">
          {guests.filter((g) => !g.unmasked && bluff.claims && g.id in bluff.claims || g.id === you).map((g) => (
            <li key={g.id} className={g.id === you ? "me" : ""}>
              <span>{g.name}</span><span>{bluff.claims?.[g.id] ?? "no claim"}</span>
              {r && g.id in r.cards && <span>held {r.cards[g.id]}</span>}
              {bluff.stage === "call" && g.id !== you && !bluff.called && <button onClick={() => act({ type: "call", target: g.id })}>Call a liar</button>}
            </li>
          ))}
        </ol>
      )}
      {bluff.stage === "call" && (bluff.called ? <p>{bluff.yourCall ? `You called ${name(bluff.yourCall)}.` : "You called no one."}</p> : others.length > 0 && <p><button onClick={() => act({ type: "call", target: null })}>Call no one</button></p>)}
      {r && <p>{r.calls.length ? r.calls.map((c) => `${name(c.caller)} called ${name(c.target)}`).join("; ") + "." : "Nobody was called."}</p>}
      <p>
        Buy points ({buyRate} each):{" "}
        <input type="number" min={1} max={favours} value={spend} onChange={(e) => setSpend(Math.max(1, Math.floor(Number(e.target.value))))} style={{ width: "4rem" }} />
        <button disabled={favours < 1 || spend > favours} onClick={() => act({ type: "buyPoints", favours: spend })}>Spend favours</button>
      </p>
    </>
  );
}

const STAGE_TITLES: Record<string, string> = { intro: "The Last Dance", match: "The Last Dance", winnerFloor: "The addresses", loserFloor: "The addresses", questions: "Questions", vote: "The Jury votes", reveal: "The ballots", ended: "The last mask", deleted: "The last mask" };

/** The Last Dance: the match, the addresses on the Table, the Jury vote, the reveal and the end screen. */
function LastDance({ view, now, act }: { view: Extract<GuestView, { phase: "lastDance" }>; now: number; act: Act }) {
  const name = (id: string) => view.guests.find((g) => g.id === id)?.name ?? "?";
  const r = view.result;
  const over = view.stage === "ended" || view.stage === "deleted";
  const juror = view.guests.find((g) => g.id === view.you)!.unmasked;
  return (
    <>
      <h1>{STAGE_TITLES[view.stage]}</h1>
      {view.deadline !== null && <Candle deadline={view.deadline} length={Math.max(1, view.deadline - now)} now={now} />}
      <p>The last two: {view.finalists.map(name).join(" and ")}.</p>
      {view.stage === "intro" && (
        <>
          <h2>{view.announcement.name}{view.announcement.encore ? " (an Encore)" : ""}</h2>
          <Teaching announcement={view.announcement} view={view} now={now} act={act} />
        </>
      )}
      {view.stage === "match" && (
        <>
          {view.step ? <StepPanel step={view.step} favours={view.yourFavours} buyRate={view.buyRate} now={now} act={act} /> : <p>The last two play; you are watching.</p>}
          <Ranking ranking={view.ranking} guests={view.guests} you={view.you} />
        </>
      )}
      {r && (
        <p>
          {name(r.winner)} won the match.{" "}
          {r.jurors === 0 ? "No juror is here, so the match decides." : `${name(r.loser)} needs ${r.needs} of ${r.jurors} votes.`}
        </p>
      )}
      {(view.stage === "winnerFloor" || view.stage === "loserFloor") && <p>{view.floor === view.you ? "You have the floor on the Table." : `${name(view.floor as string)} has the floor on the Table.`}</p>}
      {view.stage === "questions" && <p>The Table is open to everyone: open questions.</p>}
      {view.stage === "vote" && juror && view.vote && (
        view.vote.yourVote ? <p>You voted for {name(view.vote.yourVote)}.</p> : (
          <p>{view.finalists.map((id) => <button key={id} onClick={() => act({ type: "vote", finalist: id })}>Vote for {name(id)}</button>)}</p>
        )
      )}
      {view.stage === "vote" && !(juror && view.vote) && <p>The Jury is voting in secret.</p>}
      {view.ballots.length > 0 && <ul>{view.ballots.map((b) => <li key={b.juror}>{name(b.juror)} voted for {name(b.finalist)}</li>)}</ul>}
      {over && view.lastMask && (
        <>
          <h2>{name(view.lastMask)} is the last mask</h2>
          {view.favours && <><h3>Final favours</h3><FavourList view={view} favours={view.favours} /></>}
          {view.reveal && <PredictionReveal reveal={view.reveal} guests={view.guests} />}
        </>
      )}
    </>
  );
}

function Name({ guests, id }: { guests: PublicGuest[]; id: string }) {
  const g = guests.find((x) => x.id === id)!;
  return <>{g.unmasked ? <span className="maskless" aria-label="unmasked" /> : <MaskIcon mask={g.mask} />}<span style={{ flex: 1 }}>{g.name}</span></>;
}

function FavourList({ view, favours }: { view: { guests: PublicGuest[] }; favours: Record<string, number> }) {
  return (
    <ul>
      {view.guests.filter((g) => g.id in favours).sort((a, b) => favours[b.id]! - favours[a.id]!).map((g) => (
        <li key={g.id}><Name guests={view.guests} id={g.id} /><strong>{favours[g.id]}</strong></li>
      ))}
    </ul>
  );
}

/** The Salon's gift screen: standings as the Mingle began, a gift form, and a visual-only note of gifts given or received. */
function GiftScreen({ view, act }: { view: Extract<GuestView, { phase: "mingle" }>; act: Act }) {
  const others = view.guests.filter((g) => g.id !== view.you && g.id in view.standings);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(1);
  const target = others.some((g) => g.id === to) ? to : (others[0]?.id ?? "");
  const nameOf = (id: string) => view.guests.find((g) => g.id === id)?.name ?? "";
  return (
    <>
      <h2>Standings at the start of the Mingle</h2>
      <FavourList view={view} favours={view.standings} />
      <h2>Give a gift</h2>
      {view.favours < 1 ? (
        <p>You hold no favours to give.</p>
      ) : (
        <p>
          <select value={target} onChange={(e) => setTo(e.target.value)}>
            {others.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>{" "}
          <input type="number" min={1} max={view.favours} value={amount} onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value))))} style={{ width: "4rem" }} />{" "}
          <button disabled={!target || amount > view.favours} onClick={() => act({ type: "gift", to: target, favours: amount })}>Give favours</button>
        </p>
      )}
      {view.gifts.map((g, i) => (
        <p key={i} className="gift-cue" role="status">
          {g.from === view.you ? `You gave ${g.favours} favours to ${nameOf(g.to)}.` : `${nameOf(g.from)} gave you ${g.favours} favours.`}
        </p>
      ))}
    </>
  );
}

/** The Balcony's own screens: the play-along, with nothing at stake, and the Cellar game predictions. */
function Balcony({ view, now, act }: { view: Exclude<GuestView, { phase: "foyer" }>; now: number; act: Act }) {
  const { along, predictions } = view;
  if (!along && !predictions) return null;
  // The play-along's guests are all unmasked, but they are the ones playing it.
  const players = along ? view.guests.filter((g) => along.ranking.some((r) => r.guest === g.id)).map((g) => ({ ...g, unmasked: false })) : [];
  return (
    <section className="balcony">
      <h2>The Balcony</h2>
      {along && <AlongPanel along={along} players={players} you={view.you} now={now} act={act} />}
      {predictions && <PredictionPanel predictions={predictions} guests={view.guests} you={view.you} act={act} />}
    </section>
  );
}

function AlongPanel({ along, players, you, now, act }: { along: AlongView; players: PublicGuest[]; you: string; now: number; act: Act }) {
  return (
    <>
      <h3>Playing along: {along.name}{along.done ? " (over)" : ""}</h3>
      <p>Nothing is at stake here.</p>
      {!along.done && along.bluff ? <ToastPanel bluff={along.bluff} guests={players} you={you} favours={0} buyRate={0} now={now} act={act} /> : !along.done && along.auction ? <BidPanel auction={along.auction} guests={players} you={you} favours={0} buyRate={0} now={now} act={act} /> : !along.done && along.step ? <StepPanel step={along.step} favours={0} buyRate={0} now={now} act={act} /> : null}
      <Ranking ranking={along.ranking} guests={players} you={you} />
    </>
  );
}

function PredictionPanel({ predictions, guests, you, act }: { predictions: PredictionsView; guests: PublicGuest[]; you: string; act: Act }) {
  const [picked, setPicked] = useState<string[]>([]);
  const name = (id: string) => guests.find((g) => g.id === id)?.name ?? "?";
  const open = predictions.open;
  return (
    <>
      <h3>Predictions</h3>
      {open && (
        <>
          <p>{open.kind === "lastDance" ? "Who will win the Last Dance's match? Pick one, until it starts." : `Who will the Cellar game unmask? Pick ${open.picks}, until it starts.`}</p>
          <ul>
            {open.cellar.map((id) => (
              <li key={id}>
                <button className={picked.includes(id) ? "picked" : ""} onClick={() => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-open.picks)))}>{name(id)}</button>
              </li>
            ))}
          </ul>
          <button disabled={picked.length !== open.picks} onClick={() => act({ type: "predict", picks: picked })}>Lock in my picks</button>
        </>
      )}
      <ul>
        {predictions.rounds.map((r) => (
          <li key={r.round}>
            Round {r.round}: {Object.entries(r.picks).map(([g, p]) => `${name(g)} picked ${p.map(name).join(" and ")}`).join("; ") || "no picks"}
            {r.unmasked && ` · unmasked: ${r.unmasked.map(name).join(", ")}`}
          </li>
        ))}
      </ul>
      {predictions.lastDance && <p>Last Dance match: {Object.entries(predictions.lastDance.picks).map(([g, p]) => `${name(g)} picked ${name(p)}`).join("; ") || "no picks"}</p>}
      <p>Points: {Object.entries(predictions.scores).map(([g, n]) => `${g === you ? "you" : name(g)} ${n}`).join(", ")}</p>
    </>
  );
}

function PredictionReveal({ reveal, guests }: { reveal: PredictionsReveal; guests: PublicGuest[] }) {
  const name = (id: string) => guests.find((g) => g.id === id)?.name ?? "?";
  return (
    <>
      <h2>The predictions</h2>
      <ul>
        {reveal.rounds.map((r) => (
          <li key={r.round}>
            Round {r.round} ({r.unmasked ? `unmasked: ${r.unmasked.map(name).join(", ")}` : "not played"}): {Object.entries(r.picks).map(([g, p]) => `${name(g)} picked ${p.map(name).join(" and ")}`).join("; ") || "no picks"}
          </li>
        ))}
      </ul>
      {reveal.lastDance && <p>The Last Dance's match: {Object.entries(reveal.lastDance.picks).map(([g, p]) => `${name(g)} picked ${name(p)}`).join("; ") || "no picks"}.</p>}
      <p>{reveal.oracle.length ? `The Oracle: ${reveal.oracle.map(name).join(" and ")} (${reveal.scores[reveal.oracle[0]!]} points).` : "No Oracle tonight: no prediction came true."}</p>
    </>
  );
}

/** Who is at the party: "left the party" and "disconnected" markers, the leave button and, for the Host, their powers. */
function Party({ view, code, links, act }: { view: Exclude<GuestView, { phase: "foyer" }>; code: string; links: Record<string, string>; act: Act }) {
  const me = view.guests.find((g) => g.id === view.you)!;
  const host = view.you === view.host;
  const over = view.phase === "ended" || (view.phase === "lastDance" && (view.stage === "ended" || view.stage === "deleted"));
  return (
    <details className="party">
      <summary>The party</summary>
      <ul>
        {view.guests.map((g) => (
          <li key={g.id}>
            <Name guests={view.guests} id={g.id} />
            {g.id === view.host && <span> (Host)</span>}
            {g.left ? <span> · {g.name} left the party.</span> : g.disconnected ? <span className="disconnected"> · disconnected</span> : null}
            {host && !over && (
              <button onClick={() => act({ type: "rejoinLink", target: g.id })}>Show re-join link</button>
            )}
            {host && links[g.id] && <input readOnly value={rejoinLink(code, links[g.id]!)} onFocus={(e) => e.currentTarget.select()} aria-label={`Re-join link for ${g.name}`} />}
          </li>
        ))}
      </ul>
      {!over && <p><InPersonSwitch view={view} act={act} /></p>}
      {!me.unmasked && !over && <button onClick={() => { if (confirm("Leave the party? You'll be unmasked and can only watch.")) act({ type: "leave" }); }}>Leave the party</button>}
      {host && !over && <button onClick={() => { if (confirm("End the game for everyone? No last mask will be crowned.")) act({ type: "endGame" }); }}>End the game</button>}
    </details>
  );
}

/** The match's Prelude and Rules card; the worked example plays on the match's own panels, with Ana, Ben and Cy. */
function Teaching({ announcement, view, now, act, cardOpen }: { announcement: Announcement; view: { prelude: PreludeView | null }; now: number; act: Act; cardOpen?: boolean | undefined }) {
  return (
    <PreludeSection announcement={announcement} prelude={view.prelude} now={now} act={act} cardOpen={cardOpen}
      renderScreen={(v, guests, at) => v.bluff ? <ToastPanel bluff={v.bluff} guests={guests} you="ana" favours={5} buyRate={0} now={at} act={() => {}} /> : v.auction ? <BidPanel auction={v.auction} guests={guests} you="ana" favours={5} buyRate={0} now={at} act={() => {}} /> : <StepPanel step={v.step!} favours={5} buyRate={0} now={at} act={() => {}} />} />
  );
}

/** "I'm with the Host in person": captions only here, with the Host's phone playing the narration and the music. */
export function InPersonSwitch({ view, act }: { view: GuestView; act: Act }) {
  if (view.you === view.host) return <p className="hint">Your phone plays the narration and the music for guests with you in person.</p>;
  return (
    <label>
      <input type="checkbox" checked={view.inPerson} onChange={(e) => act({ type: "setInPerson", inPerson: e.target.checked })} /> I'm with the Host in person
    </label>
  );
}

export function Game({ view, offset, act, error, talk, cover, code, links }: { view: Exclude<GuestView, { phase: "foyer" }>; offset: number; act: Act; error: string | null; talk: TalkLink; cover(): void; code: string; links: Record<string, string> }) {
  const now = useServerNow(offset);
  const notice = useSound(view, now);
  return (
    <div className="salon">
    <main>
      {view.phase !== "lastDance" && view.phase !== "ended" && <PhaseRail phase={view.phase} />}
      <Caption narrator={view.narrator} overtureUntil={view.phase === "mingle" ? view.overtureUntil : null} now={now} />
      {notice && <p className="notice" role="status">{notice}</p>}
      {view.phase === "mingle" && (
        <>
          <h1>The Mingle</h1>
          <Candle deadline={view.deadline} length={MINGLE_MS} now={now} />
          <p>You hold <strong>{view.favours}</strong> favours.</p>
          <GiftScreen view={view} act={act} />
          <h2>Tonight's Dance: {view.announcement.name}</h2>
          <Teaching announcement={view.announcement} view={view} now={now} act={act} cardOpen />
        </>
      )}
      {view.phase === "dance" && (
        <>
          <h1>{view.announcement.name}</h1>
          <Teaching announcement={view.announcement} view={view} now={now} act={act} />
          {view.bluff ? <ToastPanel bluff={view.bluff} guests={view.guests} you={view.you} favours={view.favours} buyRate={view.buyRate} now={now} act={act} /> : view.auction ? <BidPanel auction={view.auction} guests={view.guests} you={view.you} favours={view.favours} buyRate={view.buyRate} now={now} act={act} /> : view.step ? <StepPanel step={view.step} favours={view.favours} buyRate={view.buyRate} now={now} act={act} /> : view.prelude ? null : <p>You are watching from the Balcony.</p>}
          <h2>The running ranking</h2>
          <Ranking ranking={view.ranking} guests={view.guests} you={view.you} />
        </>
      )}
      {view.phase === "sentDown" && (
        <>
          <h1>Sent <em>down</em></h1>
          <Candle deadline={view.deadline} length={SENT_DOWN_MS} now={now} />
          <h2>The Dance</h2>
          <ol className="ranking">
            {view.danceRanking.map((r, i) => {
              const p = view.payout[r.guest]!;
              return (
                <li key={r.guest} className={r.guest === view.you ? "me" : ""}>
                  <span>{i + 1}</span><Name guests={view.guests} id={r.guest} />
                  <span>{r.points} pts{r.drawn ? " (drawn)" : ""}</span><span>{p > 0 ? `+${p}` : p}</span>
                </li>
              );
            })}
          </ol>
          <h2>Favours</h2>
          <FavourList view={view} favours={view.favours} />
          <h2>Sent down to the Cellar</h2>
          <ul>{view.cellar.map((id) => <li key={id} className={id === view.you ? "me" : ""}><Name guests={view.guests} id={id} /></li>)}</ul>
          <p>{view.unmaskings === 0 ? "A warm-up round: nobody is unmasked tonight." : `The Cellar game unmasks ${view.unmaskings}.`}</p>
          <h2>The Cellar game: {view.cellarGame.name}{view.cellarGame.encore ? " (an Encore)" : ""}</h2>
          <Teaching announcement={view.cellarGame} view={view} now={now} act={act} />
        </>
      )}
      {view.phase === "cellar" && (
        <>
          <h1>{view.announcement.name}</h1>
          <p>{view.unmaskings === 0 ? "Played for practice: nobody is unmasked." : `The lowest ${view.unmaskings} will be unmasked.`}</p>
          {view.step ? <StepPanel step={view.step} favours={view.favours} buyRate={view.buyRate} now={now} act={act} /> : <p>The Cellar plays; you are watching.</p>}
          <h2>The running ranking</h2>
          <Ranking ranking={view.ranking} guests={view.guests} you={view.you} />
        </>
      )}
      {view.phase === "unmasking" && (
        <>
          <h1>Unmasked</h1>
          <Candle deadline={view.deadline} length={UNMASKING_MS} now={now} />
          {view.unmasked.length === 0 ? <p>Nobody is unmasked this round.</p> : <ul>{view.unmasked.map((id) => <li key={id} className="unmasked"><Name guests={view.guests} id={id} /></li>)}</ul>}
          <h2>Favours</h2>
          <FavourList view={view} favours={view.favours} />
        </>
      )}
      {view.phase === "lastDance" && <LastDance view={view} now={now} act={act} />}
      {view.phase === "ended" && (
        <>
          <h1>The party is over</h1>
          <p>The Host ended the game early. No last mask is crowned.</p>
          <h2>Final favours</h2>
          <FavourList view={view} favours={view.favours} />
          <PredictionReveal reveal={view.reveal} guests={view.guests} />
        </>
      )}
      <Party view={view} code={code} links={links} act={act} />
      <Balcony view={view} now={now} act={act} />
      {error && <p className="error">{error}</p>}
    </main>
    <Talk view={view} link={talk} cover={cover} />
    </div>
  );
}
