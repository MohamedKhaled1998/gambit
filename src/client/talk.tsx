import { useEffect, useState } from "react";
import { MAX_MESSAGE_LENGTH, type ChatId, type ChatMessage, type GuestView } from "../shared/types";
import { MaskIcon } from "./mask";

/** What the phone knows of each chat it can read. */
export type Chats = Record<ChatId, { messages: ChatMessage[]; more: boolean }>;

export interface TalkLink {
  chats: Chats;
  /** Newest message seen per chat when it was last open; the unread dot is "something newer from someone else". */
  lastRead: Record<ChatId, number>;
  open(chat: ChatId): void;
  post(chat: ChatId, body: string): void;
  older(chat: ChatId): void;
  openRoom(members: string[]): void;
  leaveRoom(room: string): void;
}

/** Read markers are kept per game and seat: chat ids and message numbers restart in every game. */
const readKey = (game: string, guest: string) => `two-faced-read:${game}:${guest}`;
export const loadRead = (game: string, guest: string): Record<ChatId, number> => {
  try {
    return JSON.parse(localStorage.getItem(readKey(game, guest)) ?? "{}") as Record<ChatId, number>;
  } catch {
    return {};
  }
};
export const saveRead = (game: string, guest: string, read: Record<ChatId, number>): void => localStorage.setItem(readKey(game, guest), JSON.stringify(read));

/** Whether the newest message in a chat is someone else's and newer than what this guest has read. */
export function isUnread(chats: Chats, lastRead: Record<ChatId, number>, id: ChatId, you: string): boolean {
  const latest = chats[id]?.messages.at(-1);
  return !!latest && latest.guest !== you && latest.seq > (lastRead[id] ?? 0);
}

type Seen = Exclude<GuestView, { phase: "foyer" }>;

/** The chats the view lists for this guest, labelled. */
function myChats(view: Seen): { id: ChatId; label: string; canPost: boolean }[] {
  const names = (members: string[]) => members.filter((m) => m !== view.you).map((m) => view.guests.find((g) => g.id === m)?.name ?? "").join(", ");
  const label = (id: ChatId) =>
    id === "table" ? "The Table" : id === "balcony" ? "The Balcony" : id.startsWith("cellar-") ? "Cellar talk" : names(view.rooms.find((r) => r.id === id)?.members ?? []) || "A Room you left";
  return view.chats.map((c) => ({ id: c.chat, label: label(c.chat), canPost: c.canPost }));
}

function Dot({ chats, lastRead, id, you }: { chats: Chats; lastRead: Record<ChatId, number>; id: ChatId; you: string }) {
  return isUnread(chats, lastRead, id, you) ? <span className="dot" role="img" aria-label="unread" /> : null;
}

/** Who is in which Room: public, with no sign of what is said. */
function WhoIsTalking({ view }: { view: Seen }) {
  const who = (id: string) => view.guests.find((g) => g.id === id)!;
  return (
    <div>
      <h3>Who's talking</h3>
      {view.rooms.filter((r) => r.members.length > 0).length === 0 && <p>No Rooms yet.</p>}
      <ul>
        {view.rooms.filter((r) => r.members.length > 0).map((r) => (
          <li key={r.id}>{r.members.map((m) => <MaskIcon key={m} mask={who(m).mask} />)}</li>
        ))}
      </ul>
    </div>
  );
}

function NewRoom({ view, link }: { view: Seen; link: TalkLink }) {
  const others = view.guests.filter((g) => g.id !== view.you && !g.unmasked);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const everyone = picked.length >= others.length;
  return (
    <details>
      <summary>Open a Room</summary>
      {others.map((g) => (
        <label key={g.id} className="pick"><input type="checkbox" checked={picked.includes(g.id)} onChange={() => toggle(g.id)} /> {g.name}</label>
      ))}
      <button disabled={picked.length === 0 || everyone} onClick={() => { link.openRoom(picked); setPicked([]); }}>Open Room</button>
      {everyone && <p>A Room can't hold everyone.</p>}
    </details>
  );
}

function ChatPane({ view, id, link, canPost }: { view: Seen; id: ChatId; link: TalkLink; canPost: boolean }) {
  const [text, setText] = useState("");
  const chat = link.chats[id];
  const name = (g: string) => view.guests.find((x) => x.id === g);
  return (
    <div className="chat">
      {chat?.more && <button onClick={() => link.older(id)}>Older messages</button>}
      <ul className="messages">
        {(chat?.messages ?? []).map((m) => (
          <li key={m.seq} className={m.guest === view.you ? "me" : ""}>
            <MaskIcon mask={name(m.guest)!.mask} size={20} /> <span><strong>{name(m.guest)!.name}</strong> {m.body}</span>
          </li>
        ))}
      </ul>
      {canPost ? <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { link.post(id, text); setText(""); } }}>
        <input value={text} maxLength={MAX_MESSAGE_LENGTH} autoComplete="off" onChange={(e) => setText(e.target.value)} />
        <button disabled={!text.trim()}>Send</button>
      </form> : <p>Read-only.</p>}
    </div>
  );
}

/** The Talk sheet (under the stage on a phone, a column beside it on a desktop): the Table and Rooms, who's talking, and the cover. */
export function Talk({ view, link, cover }: { view: Seen; link: TalkLink; cover(): void }) {
  const [current, setCurrent] = useState<ChatId | null>(null);
  const [sheet, setSheet] = useState(false);
  const chats = myChats(view);
  const shown = current && chats.some((c) => c.id === current) ? current : null;
  const anyUnread = chats.some((c) => isUnread(link.chats, link.lastRead, c.id, view.you));
  // A chat being viewed never counts as unread: read it as its messages arrive.
  const viewedSeq = shown ? (link.chats[shown]?.messages.at(-1)?.seq ?? 0) : 0;
  const { open } = link;
  useEffect(() => { if (shown) open(shown); }, [shown, viewedSeq]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <aside className={`talk ${sheet ? "up" : ""}`}>
      <div className="talk-bar">
        <button onClick={() => setSheet(!sheet)}>Talk{anyUnread && <span className="dot" role="img" aria-label="unread" />}</button>
        <button onClick={cover}>Cover</button>
      </div>
      <div className="talk-body">
        {shown ? (
          <>
            <button onClick={() => setCurrent(null)}>← Chats</button>
            {view.rooms.some((r) => r.id === shown && r.members.includes(view.you)) && <button onClick={() => { link.leaveRoom(shown); setCurrent(null); }}>Leave Room</button>}
            <ChatPane view={view} id={shown} link={link} canPost={chats.find((c) => c.id === shown)!.canPost} />
          </>
        ) : (
          <>
            <ul className="chats">
              {chats.map((c) => (
                <li key={c.id}><button onClick={() => { setCurrent(c.id); link.open(c.id); }}>{c.label}<Dot chats={link.chats} lastRead={link.lastRead} id={c.id} you={view.you} /></button></li>
              ))}
            </ul>
            {!view.guests.find((g) => g.id === view.you)?.unmasked && <NewRoom view={view} link={link} />}
            <WhoIsTalking view={view} />
          </>
        )}
      </div>
    </aside>
  );
}
