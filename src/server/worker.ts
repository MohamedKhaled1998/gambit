import { routePartykitRequest } from "partyserver";
import { createGame } from "./create";

export { Game } from "./game-server";

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/games" && request.method === "POST") {
      const { name } = (await request.json().catch(() => ({}))) as { name?: string };
      const result = await createGame(env, String(name ?? ""), Math.random);
      return Response.json(result, { status: "error" in result ? 400 : 200 });
    }
    const routed = await routePartykitRequest(request, env);
    return routed ?? new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
