import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CODE_LENGTH, MAX_GUESTS, MAX_NAME_LENGTH, MIN_GUESTS, CLOSE_NO_SEAT, CLOSE_REMOVED, CLOSE_TAKEN_OVER, type ChatId, type ChatMessage, type GuestView, type SeatGrant } from "../shared/types";
import { claimRejoinLink, connect, forgetSeat, loadSeat, saveSeat } from "./connection";
import { MaskIcon } from "./mask";
import { Game, InPersonSwitch } from "./screens";
import { unlockOnFirstTap } from "./audio";
import { loadRead, saveRead, type Chats, type TalkLink } from "./talk";

function App() {
  const [seat, setSeat] = useState(() => { claimRejoinLink(); return loadSeat(); });
  const [links, setLinks] = useState<Record<string, string>>({});
  const [view, setView] = useState<GuestView | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState(new URLSearchParams(location.search).get("code") ?? "");
  const [pendingJoin, setPendingJoin] = useState<{ code: string; name: string } | null>(null);
  const [chats, setChats] = useState<Chats>({});
  const [lastRead, setLastRead] = useState<Record<ChatId, number>>({});
  const [covered, setCovered] = useState(false);
  const link = useRef<ReturnType<typeof connect> | null>(null);

  useEffect(() => {
    const target = seat ? { code: seat.code, token: seat.token, join: undefined } : pendingJoin ? { code: pendingJoin.code, token: null, join: pendingJoin.name } : null;
    if (!target) return;
    const handlers = {
      onView: (v: GuestView, o: number) => { setError(null); setOffset(o); setView(v); },
      onMessage: (m: ChatMessage) => setChats((c) => ({ ...c, [m.chat]: { more: c[m.chat]?.more ?? false, messages: [...(c[m.chat]?.messages ?? []).filter((x) => x.seq !== m.seq), m].sort((a, b) => a.seq - b.seq) } })),
      onHistory: (chat: ChatId, messages: ChatMessage[], more: boolean) =>
        setChats((c) => {
          const have = c[chat]?.messages ?? [];
          // The latest page replaces what a reconnect left stale; an older page joins the front.
          const older = have.length > 0 && messages.length > 0 && messages.at(-1)!.seq < have[0]!.seq;
          const merged = older ? [...messages, ...have] : messages.length > 0 && have.some((x) => x.seq > messages.at(-1)!.seq) ? [...messages, ...have.filter((x) => x.seq > messages.at(-1)!.seq)] : messages;
          return { ...c, [chat]: { messages: merged, more: older || !have.length ? more : (c[chat]?.more ?? more) } };
        }),
      onError: setError,
      onRejoin: (guest: string, token: string) => setLinks((l) => ({ ...l, [guest]: token })),
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

  const readScope = seat && view ? { game: seat.code, guest: view.you } : null;
  const scopeKey = readScope ? `${readScope.game}:${readScope.guest}` : "";
  useEffect(() => {
    setLastRead(readScope ? loadRead(readScope.game, readScope.guest) : {});
  }, [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const talk: TalkLink = {
    chats,
    lastRead,
    open: (chat) => {
      const latest = chats[chat]?.messages.at(-1)?.seq ?? 0;
      const next = { ...lastRead, [chat]: latest };
      if (!readScope || (lastRead[chat] ?? 0) >= latest) return;
      saveRead(readScope.game, readScope.guest, next);
      setLastRead(next);
    },
    post: (chat, body) => link.current?.post(chat, body),
    older: (chat) => { const first = chats[chat]?.messages[0]; if (first) link.current?.loadHistory(chat, first.seq); },
    openRoom: (members) => link.current?.act({ type: "openRoom", members }),
    leaveRoom: (room) => link.current?.act({ type: "leaveRoom", room }),
  };
  if (view.phase !== "foyer" && covered) return <main className="cover" onClick={() => setCovered(false)}><p>Notes</p><p>Tap to go back.</p></main>;
  if (view.phase !== "foyer") return <Game view={view} offset={offset} code={seat?.code ?? ""} links={links} act={(a) => link.current?.act(a)} error={error} talk={talk} cover={() => setCovered(true)} />;
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
      <p><InPersonSwitch view={view} act={(a) => link.current?.act(a)} /></p>
      {view.canRemove && <button disabled={!view.canStart} onClick={() => link.current?.act({ type: "start" })}>Start ({MIN_GUESTS}-{MAX_GUESTS} guests)</button>}
      {error && <p className="error">{error}</p>}
    </main>
  );
}

unlockOnFirstTap();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
