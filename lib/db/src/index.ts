import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Walk up from this module looking for a .env file.
 *
 * This module is consumed both as TypeScript source (scripts, drizzle-kit) and
 * as a bundle inside artifacts/api-server/dist, so the distance to the repo root
 * differs. Searching upwards keeps DATABASE_URL loading reliable in both cases.
 */
function loadEnvFile() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
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
  // Fall back to whatever dotenv can discover.
  config();
}

loadEnvFile();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./tokens";
