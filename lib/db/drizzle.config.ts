import { existsSync } from "node:fs";
import path from "path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit is executed as a standalone binary and does not load .env the way
 * the application does, so the config searches upwards for one. Without this,
 * `pnpm db:generate` and `pnpm db:push` fail with a confusing "ensure the
 * database is provisioned" error even when DATABASE_URL is configured.
 */
function loadEnvFile() {
  let dir = __dirname;
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) {
      config({ path: candidate });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  config();
}

loadEnvFile();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to the repo-root .env file.");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  // Relative to this package, which is the working directory drizzle-kit runs
  // in. An absolute path here gets mangled into `.//home/...` on resolution.
  out: "../../drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
