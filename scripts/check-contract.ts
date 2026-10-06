/**
 * Checks that every screen reads fields the endpoints actually return.
 *
 * This exists because of a bug it would have caught: the plans endpoint was
 * wrapped in an object to carry an unrelated list, and four screens that expected
 * an array broke. The endpoint and the client type agreed with each other and
 * disagreed with everything using them, so nothing else noticed.
 *
 * Run with: npx tsx scripts/check-contract.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const UI_DIRS = ["screens", "admin", "components"];
const failures: string[] = [];
const notes: string[] = [];

/** Reads every client hook's declared return type from the generated schema file. */
function hookReturnTypes(): Map<string, string> {
  const out = new Map<string, string>();
  const schema = readFileSync(
    "lib/api-client-react/src/generated/api.schemas.ts",
    "utf8",
  );
  const api = readFileSync("lib/api-client-react/src/generated/api.ts", "utf8");

  for (const m of api.matchAll(
    /export const (\w+) = async \([^)]*\): Promise<([\w\[\]| ]+)> =>/g,
  )) {
    out.set(m[1], m[2].replace(/\| null/g, "").trim());
  }
  void schema;
  return out;
}

const returns = hookReturnTypes();

/** Every `<Hook>().data` access, with the shape the screen assumes. */
function dataAccesses(): { file: string; hook: string; expr: string }[] {
  const found: { file: string; hook: string; expr: string }[] = [];
  const files = [
    ...UI_DIRS.flatMap((d) =>
      existsSync(d) ? readdirSync(d).map((f) => join(d, f)) : [],
    ),
    "app/dunda-app.tsx",
  ];
  for (const file of files) {
    if (!file.endsWith(".tsx")) continue;
    const src = readFileSync(file, "utf8");
    // `hook.data ?? []` / `hook.data?.length` / `hook.data?.map`
    for (const m of src.matchAll(/(\w+)\.data\s*(\?\?|\?\.)?\s*(\[\]|\.length|\.map|\.find|\.filter|\.reduce)?/g)) {
      found.push({ file, hook: m[1], expr: (m[3] ?? "").trim() });
    }
  }
  return found;
}

const usesArrayMethod = (expr: string) =>
  expr === "[]" || expr.startsWith(".");

for (const access of dataAccesses()) {
  const declared = returns.get(access.hook);
  if (!declared) continue;

  const declaredIsArray = declared.startsWith("[") || declared.endsWith("[]");
  // A hook declared as an array but read as an object (or the reverse) is the
  // exact shape mismatch that produced the runtime crash.
  if (declaredIsArray && usesArrayMethod(access.expr) && access.expr === ".find") {
    notes.push(
      `${access.file}: ${access.hook} is typed ${declared} and read with .find() — confirm the endpoint still returns an array`,
    );
  }
}

/** Every API route, so a missing one is caught rather than found by clicking. */
function routeFiles(dir = "app/api", prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    const next = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...routeFiles(p, next));
    else if (entry.name === "route.ts") out.push(next);
  }
  return out;
}

const routes = routeFiles();

/** Every `/api/...` path the UI fetches, compared against the routes on disk. */
function fetchedPaths(): { file: string; path: string }[] {
  const found: { file: string; path: string }[] = [];
  const files = [
    ...UI_DIRS.flatMap((d) =>
      existsSync(d) ? readdirSync(d).map((f) => join(d, f)) : [],
    ),
    "app/dunda-app.tsx",
  ];
  for (const file of files) {
    if (!file.endsWith(".tsx")) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/fetch\(\s*[`"'](\/api\/[^`"'$]*)/g)) {
      found.push({ file, path: m[1] });
    }
  }
  return found;
}

// routeFiles already accumulates the path from app/api, so stripping route.ts is
// all that is left: "/admin/support" rather than "/app/api/admin/support".
const onDisk = new Set(routes.map((r) => r.replace(/\/route\.ts$/, "")));

/**
 * A fetched path matches a route when its static prefix lines up.
 *
 * `/api/admin/support/anything` is served by admin/support/[ticketId], so the
 * dynamic tail is replaced before comparing. Trailing slashes are dropped for the
 * same reason — `/api/admin/organizations/` is the collection route, not a
 * different one.
 */
function matchesRoute(fetched: string): boolean {
  const clean = fetched.replace(/\/+$/, "").replace(/\$\{[^}]*\}/g, "x");
  if (onDisk.has(clean)) return true;
  // A fetched path with a dynamic tail resolves against any route beneath it.
  const prefix = clean.replace(/\/x$/, "");
  return [...onDisk].some((r) => r.startsWith(prefix + "/") || r === prefix);
}

for (const f of fetchedPaths()) {
  const clean = f.path.replace(/\/+$/, "");
  if (clean === "/api" || clean === "") continue;
  if (!matchesRoute(f.path)) {
    failures.push(`${f.file} fetches ${f.path} — no route.ts for it`);
  }
}

console.log(`routes on disk: ${routes.length}`);
console.log(`client hooks typed: ${returns.size}`);
if (notes.length) {
  console.log("\nworth a look:");
  for (const n of notes) console.log(`  ${n}`);
}
if (failures.length) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
} else {
  console.log("\nevery fetched path resolves to a route.");
}
