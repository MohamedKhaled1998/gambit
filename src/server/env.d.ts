declare namespace Cloudflare {
  interface Env {
    Game: DurableObjectNamespace<import("./game-server").Game>;
    BUILD_ID: string;
  }
}
