#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Removes the "use server" directive from @clerk/nextjs's server-action and
 * keyless-action modules so they can be bundled into a `output: export`
 * static build. Replaces the action bodies with safe no-ops.
 *
 * Static-deployed builds run Clerk fully client-side (`<SignIn />`, `useAuth`,
 * `useUser`) and have the JWT verified by the FastAPI backend on every API
 * call — none of these stubbed actions are reachable in that mode. This
 * This is intentionally opt-in so normal server builds keep Clerk's runtime
 * modules intact. `npm run build:export` enables the patch before exporting.
 */
const fs = require("fs");
const path = require("path");

if (process.env.PATCH_CLERK_STATIC_EXPORT !== "1") {
  process.exit(0);
}

const CLERK_DIR = path.join(__dirname, "..", "node_modules", "@clerk", "nextjs", "dist");

const STUB_ESM = `// Stubbed by scripts/patch-clerk-static-export.js for output: export.
async function invalidateCacheAction() { return; }
async function deleteKeylessAction() { return; }
async function createOrReadKeylessAction() { return null; }
async function syncKeylessConfigAction() { return; }
export {
  invalidateCacheAction,
  createOrReadKeylessAction,
  deleteKeylessAction,
  syncKeylessConfigAction,
};
`;

const STUB_CJS = `// Stubbed by scripts/patch-clerk-static-export.js for output: export.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateCacheAction = async function () { return; };
exports.deleteKeylessAction = async function () { return; };
exports.createOrReadKeylessAction = async function () { return null; };
exports.syncKeylessConfigAction = async function () { return; };
`;

const targets = [
  { file: "esm/app-router/server-actions.js", body: STUB_ESM },
  { file: "esm/app-router/keyless-actions.js", body: STUB_ESM },
  { file: "cjs/app-router/server-actions.js", body: STUB_CJS },
  { file: "cjs/app-router/keyless-actions.js", body: STUB_CJS },
];

let patched = 0;
for (const { file, body } of targets) {
  const full = path.join(CLERK_DIR, file);
  if (!fs.existsSync(full)) {
    continue;
  }
  const current = fs.readFileSync(full, "utf8");
  if (current === body) {
    continue;
  }
  fs.writeFileSync(full, body);
  patched += 1;
}

if (patched > 0) {
  console.log(`patch-clerk-static-export: rewrote ${patched} action module(s)`);
}
