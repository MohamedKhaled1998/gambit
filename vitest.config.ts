import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const exclude = ["**/node_modules/**", "**/dist/**", ".worktrees/**", ".wrangler/**"];

export default defineConfig({
  test: {
    exclude,
    projects: [
      { test: { name: "engine", include: ["test/engine/**/*.test.ts"], exclude, environment: "node" } },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: { bindings: { BUILD_ID: "test-build" } },
          }),
        ],
        test: { name: "server", include: ["test/server/**/*.test.ts"], exclude },
      },
    ],
  },
});
