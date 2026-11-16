import { useEffect, useState } from "react";
import { MINGLE_MS, type ClientAction, type GuestView, type PublicGuest, type RankingEntry } from "../shared/types";
import { MaskIcon } from "./mask";

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

const PHASES = ["Mingle", "Dance", "Standings"] as const;

/** Where the round is: a rail of its phases, the current one lit. */
function PhaseRail({ phase }: { phase: "mingle" | "dance" | "standings" }) {
  const current = { mingle: 0, dance: 1, standings: 2 }[phase];
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

export function Game({ view, offset, act, error }: { view: Exclude<GuestView, { phase: "foyer" }>; offset: number; act: Act; error: string | null }) {
  const now = useServerNow(offset);
  const [spend, setSpend] = useState(1);
  return (
    <main>
      <PhaseRail phase={view.phase} />
      {view.phase === "mingle" && (
        <>
          <h1>The Mingle</h1>
          <Candle deadline={view.deadline} length={MINGLE_MS} now={now} />
          <p>You hold <strong>{view.favours}</strong> favours.</p>
          <h2>Tonight's Dance: {view.announcement.name}</h2>
          <p>{view.announcement.rulesSummary}</p>
          <p><em>{view.announcement.workedExample}</em></p>
        </>
      )}
      {view.phase === "dance" && (
        <>
          <h1>{view.announcement.name}</h1>
          <p>Step {view.step.index + 1} of {view.step.total} · you hold {view.favours} favours</p>
          <Candle deadline={view.step.stage === "answer" ? view.step.answerDeadline : view.step.deadline} length={view.step.stage === "answer" ? view.step.answerDeadline - view.step.startedAt : 3000} now={now} />
          <p className="prompt">{view.step.prompt}</p>
          <div className="choices">
            {view.step.choices.map((c, i) => {
              const r = view.step.reveal;
              const cls = r ? (i === r.correct ? "right" : i === view.step.yourAnswer ? "wrong" : "") : i === view.step.yourAnswer ? "picked" : "";
              return (
                <button key={i} className={cls} disabled={view.step.stage !== "answer" || view.step.yourAnswer !== null} onClick={() => act({ type: "answer", position: i })}>{c}</button>
              );
            })}
          </div>
          {view.step.reveal && <p>{{ right: "✓ Right: ten points.", wrong: "✗ Not that one.", none: "No answer: no points." }[view.step.reveal.yourResult]}</p>}
          <h2>The running ranking</h2>
          <Ranking ranking={view.ranking} guests={view.guests} you={view.you} />
          <p>
            Buy points ({view.buyRate} each):{" "}
            <input type="number" min={1} max={view.favours} value={spend} onChange={(e) => setSpend(Math.max(1, Math.floor(Number(e.target.value))))} style={{ width: "4rem" }} />
            <button disabled={view.favours < 1 || spend > view.favours} onClick={() => act({ type: "buyPoints", favours: spend })}>Spend favours</button>
          </p>
        </>
      )}
      {view.phase === "standings" && (
        <>
          <h1>The standings</h1>
          <h2>The Dance</h2>
          <ol className="ranking">
            {view.danceRanking.map((r, i) => {
              const g = view.guests.find((x) => x.id === r.guest)!;
              const p = view.payout[r.guest]!;
              return (
                <li key={r.guest} className={r.guest === view.you ? "me" : ""}>
                  <span>{i + 1}</span><MaskIcon mask={g.mask} /><span style={{ flex: 1 }}>{g.name}{r.drawn ? " (drawn)" : ""}</span>
                  <span>{r.points} pts</span><span>{p > 0 ? `+${p}` : p}</span>
                </li>
              );
            })}
          </ol>
          <h2>Favours</h2>
          <ul>
            {[...view.guests].sort((a, b) => view.favours[b.id]! - view.favours[a.id]!).map((g) => (
              <li key={g.id}><MaskIcon mask={g.mask} /><span style={{ flex: 1 }}>{g.name}</span><strong>{view.favours[g.id]}</strong></li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
