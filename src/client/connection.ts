import type { ClientAction, ClientMessage, GuestView, ServerMessage } from "../shared/types";

const STORAGE_KEY = "two-faced-seat";

export interface Stored {
  code: string;
  token: string;
}
export const loadSeat = (): Stored | null => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Stored | null;
  } catch {
    return null;
  }
};
export const saveSeat = (seat: Stored): void => localStorage.setItem(STORAGE_KEY, JSON.stringify(seat));
export const forgetSeat = (): void => localStorage.removeItem(STORAGE_KEY);

export interface Handlers {
  /** `offset` is server time minus this phone's time, measured when the view arrived. */
  onView(view: GuestView, offset: number): void;
  onError(reason: string): void;
  onClosed(code: number): void;
}

/** One socket to the game; draws nothing, decides nothing. */
export function connect(code: string, token: string | null, handlers: Handlers, joinName?: string) {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const ws = new WebSocket(`${scheme}://${location.host}/parties/game/${code}${query}`);
  ws.onopen = () => {
    if (!token && joinName !== undefined) send({ type: "join", name: joinName });
  };
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    if (message.type === "view") {
      if (message.build !== __BUILD_ID__ && sessionStorage.getItem("reloaded-for") !== message.build) {
        sessionStorage.setItem("reloaded-for", message.build);
        location.reload();
        return;
      }
      handlers.onView(message.view, message.now - Date.now());
    } else if (message.type === "seat") saveSeat({ code, token: message.token });
    else handlers.onError(message.reason);
  };
  ws.onclose = (event) => handlers.onClosed(event.code);
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  return {
    act: (action: ClientAction) => send({ type: "action", id: crypto.randomUUID(), action }),
    close: () => ws.close(),
  };
}
