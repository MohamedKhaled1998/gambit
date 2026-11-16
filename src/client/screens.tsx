import { useEffect, useState } from "react";
import { MINGLE_MS, SENT_DOWN_MS, UNMASKING_MS, type ClientAction, type GuestView, type StepView, type AuctionView, type PublicGuest, type RankingEntry } from "../shared/types";
import { ColourStrip, MaskIcon, maskLabel } from "./mask";
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

export function Game({ view, offset, act, error, talk, cover }: { view: Exclude<GuestView, { phase: "foyer" }>; offset: number; act: Act; error: string | null; talk: TalkLink; cover(): void }) {
  const now = useServerNow(offset);
  return (
    <div className="salon">
    <main>
      {view.phase !== "lastDance" && <PhaseRail phase={view.phase} />}
      {view.phase === "mingle" && (
        <>
          <h1>The Mingle</h1>
          <Candle deadline={view.deadline} length={MINGLE_MS} now={now} />
          <p>You hold <strong>{view.favours}</strong> favours.</p>
          <GiftScreen view={view} act={act} />
          <h2>Tonight's Dance: {view.announcement.name}</h2>
          <p>{view.announcement.rulesSummary}</p>
          <p><em>{view.announcement.workedExample}</em></p>
          {view.announcement.masks && <ColourStrip />}
        </>
      )}
      {view.phase === "dance" && (
        <>
          <h1>{view.announcement.name}</h1>
          {view.auction ? <BidPanel auction={view.auction} guests={view.guests} you={view.you} favours={view.favours} buyRate={view.buyRate} now={now} act={act} /> : view.step ? <StepPanel step={view.step} favours={view.favours} buyRate={view.buyRate} now={now} act={act} /> : <p>You are watching from the Balcony.</p>}
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
          <p>{view.cellarGame.rulesSummary}</p>
          {view.cellarGame.masks && <ColourStrip />}
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
      {view.phase === "lastDance" && (
        <>
          <h1>The Last Dance</h1>
          <p>The last two guests remain:</p>
          <ul>{view.finalists.map((id) => <li key={id}><Name guests={view.guests} id={id} /></li>)}</ul>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </main>
    <Talk view={view} link={talk} cover={cover} />
    </div>
  );
}
