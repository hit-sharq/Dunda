#!/usr/bin/env node
/**
 * Checks the generated API client against the route handlers that actually
 * exist.
 *
 * The client used to be generated from a spec that was not in the repo, so it
 * drifted away from the routes and thirty five screens were calling
 * endpoints that had never been built. This script is the guard against that
 * happening again: it fails the build when the client calls a path or method
 * that no route file provides.
 *
 * Run it with: npm run check:api
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CLIENT = join(ROOT, "lib/api-client-react/src/generated/api.ts");
const API_DIR = join(ROOT, "app/api");

/* ------------------------------------------------------------------ */
/* Read the routes                                                     */
/* ------------------------------------------------------------------ */

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** /api/orders/[orderId]/status -> /api/orders/[x]/status */
function normalise(path) {
  return path
    .replace(/\$\{[^}]+\}/g, "[x]")
    .replace(/\{[^}]+\}/g, "[x]")
    .replace(/\[[^\]]+\]/g, "[x]")
    .replace(/\?\[x\]$/, "")
    .replace(/\/$/, "");
}

const routeMethods = new Map(); // path -> Set(method)

for (const file of walk(API_DIR)) {
  const rel = relative(ROOT, file).replace(/^app/, "").replace(/\/route\.ts$/, "");
  const source = readFileSync(file, "utf8");
  const methods = new Set();
  for (const m of source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)) {
    methods.add(m[1]);
  }
  if (methods.size === 0) continue;
  const path = normalise(rel);
  if (!routeMethods.has(path)) routeMethods.set(path, new Set());
  for (const m of methods) routeMethods.get(path).add(m);
}

/* ------------------------------------------------------------------ */
/* Read the client                                                     */
/* ------------------------------------------------------------------ */

const clientSource = readFileSync(CLIENT, "utf8");

// Every URL builder in the client, keyed by the function name.
const urlBuilders = new Map();
for (const m of clientSource.matchAll(
  /export const (get\w+Url)\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\}/g,
)) {
  const body = m[2];
  // The builder returns either a literal or a ternary of two literals.
  const literals = [...body.matchAll(/`([^`]*)`/g)].map((x) => x[1]);
  if (literals.length) urlBuilders.set(m[1], literals);
}

// Each fetch call: the URL builder it uses and the method it uses.
const clientCalls = [];
let cursor = 0;
for (;;) {
  const at = clientSource.indexOf("customFetch<", cursor);
  if (at === -1) break;
  cursor = at + 1;

  // Look at the call and the options object that follows it.
  const window = clientSource.slice(at, at + 700);
  const method = window.match(/method:\s*'([A-Z]+)'/)?.[1];
  if (!method) continue;

  const builder = window.match(/get\w+Url/)?.[0];
  let paths = builder ? urlBuilders.get(builder) ?? [] : [];

  // A builder that returns a plain string rather than a template.
  if (!paths.length) {
    const direct = window.match(/`(\/api\/[^`]*)`/);
    if (direct) paths = [direct[1]];
  }
  for (const p of paths) clientCalls.push({ path: normalise(p), method });
}

/* ------------------------------------------------------------------ */
/* Compare                                                             */
/* ------------------------------------------------------------------ */

const missing = [];
const seen = new Set();

for (const call of clientCalls) {
  const key = `${call.method} ${call.path}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const methods = routeMethods.get(call.path);
  if (!methods) {
    missing.push({ ...call, why: "no route file for this path" });
  } else if (!methods.has(call.method)) {
    missing.push({
      ...call,
      why: `route exists but only handles ${[...methods].join(", ")}`,
    });
  }
}

// Routes nothing in the client talks to. Not fatal, but worth seeing.
const calledPaths = new Set(clientCalls.map((c) => c.path));
const unreferenced = [...routeMethods.keys()].filter(
  (p) => !calledPaths.has(p) && !p.startsWith("/api/public"),
);

console.log(`routes on disk:      ${routeMethods.size}`);
console.log(`client calls checked: ${seen.size}`);

if (missing.length) {
  console.error(`\nThe client calls ${missing.length} endpoint(s) that do not exist:\n`);
  for (const m of missing) {
    console.error(`  ${m.method} ${m.path}`);
    console.error(`    ${m.why}\n`);
  }
  console.error(
    "Build a route for each of these, or fix the client. A screen that calls\n" +
      "a missing endpoint gets Next's HTML 404 page back and crashes on it.",
  );
  process.exit(1);
}

if (unreferenced.length) {
  console.log(`\nnot called by the client (fine, these are for other callers):`);
  for (const p of unreferenced) console.log(`  ${p}`);
}

console.log("\nAPI contract is in sync.");
