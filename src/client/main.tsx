import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CODE_LENGTH, MAX_GUESTS, MAX_NAME_LENGTH, MIN_GUESTS, CLOSE_NO_SEAT, CLOSE_REMOVED, CLOSE_TAKEN_OVER, type GuestView, type SeatGrant } from "../shared/types";
import { connect, forgetSeat, loadSeat, saveSeat } from "./connection";
import { MaskIcon } from "./mask";

function App() {
  const [seat, setSeat] = useState(loadSeat);
  const [view, setView] = useState<GuestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState(new URLSearchParams(location.search).get("code") ?? "");
  const [pendingJoin, setPendingJoin] = useState<{ code: string; name: string } | null>(null);
  const link = useRef<ReturnType<typeof connect> | null>(null);

  useEffect(() => {
    const target = seat ? { code: seat.code, token: seat.token, join: undefined } : pendingJoin ? { code: pendingJoin.code, token: null, join: pendingJoin.name } : null;
    if (!target) return;
    const handlers = {
      onView: (v: GuestView) => { setError(null); setView(v); },
      onError: setError,
      onClosed: (c: number) => {
        if (c === CLOSE_NO_SEAT || c === CLOSE_REMOVED) { forgetSeat(); setSeat(null); setView(null); }
        else if (c === CLOSE_TAKEN_OVER) setError("This game is open in another tab.");
      },
    };
    const conn = connect(target.code, target.token, handlers, target.join);
    link.current = conn;
    return () => conn.close();
  }, [seat, pendingJoin]);

  useEffect(() => {
    // After joining, the server's seat message saved the token; pick it up.
    if (!seat && pendingJoin && view) setSeat(loadSeat());
  }, [seat, pendingJoin, view]);

  async function create() {
    const res = await fetch("/api/games", { method: "POST", body: JSON.stringify({ name }) });
    const grant = (await res.json()) as SeatGrant | { error: string };
    if ("error" in grant) return setError(grant.error);
    saveSeat({ code: grant.code, token: grant.token });
    setSeat({ code: grant.code, token: grant.token });
  }

  if (!seat && !view) {
    return (
      <main>
        <h1>Two-Faced</h1>
        <label>Your name<br /><input value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} /></label>
        <p><button disabled={!name.trim()} onClick={create}>Host a game</button></p>
        <label>Invitation code<br /><input value={code} maxLength={CODE_LENGTH} onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
        <p><button disabled={!name.trim() || code.length !== CODE_LENGTH} onClick={() => { setError(null); setPendingJoin({ code, name }); }}>Join</button></p>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }
  if (!view) return <main><p>Taking your seat…</p>{error && <p className="error">{error}</p>}</main>;

  if (view.phase === "started") {
    return (
      <main>
        <h1>The game has started</h1>
        <ul>{view.guests.map((g) => <li key={g.id}><MaskIcon mask={g.mask} />{g.name}</li>)}</ul>
      </main>
    );
  }
  return (
    <main>
      <h1>The Foyer</h1>
      <p>Invitation code: <strong>{seat?.code}</strong> · {view.format} game</p>
      <ul>
        {view.guests.map((g) => (
          <li key={g.id}>
            <MaskIcon mask={g.mask} />
            <span style={{ flex: 1 }}>{g.name}{g.id === view.host ? " (Host)" : ""}</span>
            {view.canRemove && g.id !== view.host && <button onClick={() => link.current?.act({ type: "removeGuest", target: g.id })}>Remove</button>}
          </li>
        ))}
      </ul>
      {view.canRemove && <button disabled={!view.canStart} onClick={() => link.current?.act({ type: "start" })}>Start ({MIN_GUESTS}-{MAX_GUESTS} guests)</button>}
      {error && <p className="error">{error}</p>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
