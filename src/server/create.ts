import { getServerByName } from "partyserver";
import { makeInvitationCode } from "../engine/codes";
import type { SeatGrant } from "../shared/types";

const ATTEMPTS = 10;

/** Opens a game under a fresh Invitation code, trying another code when the object already holds a game. */
export async function createGame(env: Cloudflare.Env, name: string, random: () => number): Promise<SeatGrant | { error: string }> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const code = makeInvitationCode(random);
    const stub = await getServerByName(env.Game, code);
    const response = await stub.fetch(
      new Request("https://game.internal/create", { method: "POST", body: JSON.stringify({ name }) }),
    );
    if (response.status === 409) continue;
    if (!response.ok) return (await response.json()) as { error: string };
    return (await response.json()) as SeatGrant;
  }
  return { error: "no free Invitation code" };
}
