import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The repo starts with no tests; the first ticket adds them.
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**", ".worktrees/**"],
  },
});
