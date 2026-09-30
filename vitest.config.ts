import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The test files live at the repository root, so the workspace packages have
    // to be resolved by path rather than through a package's own node_modules.
    alias: {
      "@workspace/db": path.resolve(import.meta.dirname, "lib/db/src/index.ts"),
    },
  },
  test: {
    // These suites exercise decision logic and the database layer. They touch a
    // real database where they need one, so they must not run concurrently
    // against the same rows.
    include: ["tests/**/*.test.ts", "lib/*/tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
