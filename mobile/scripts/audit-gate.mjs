#!/usr/bin/env node
// Mobile production dependency audit gate.
//
// Runs `npm audit --omit=dev --json` and fails on any advisory of severity
// `moderate` or higher UNLESS its GitHub advisory id is listed in
// audit-allowlist.json. This replaces a bare `npm audit --audit-level=moderate`
// so we can accept a small set of documented, unfixable-without-a-major-upgrade
// transitive advisories while still failing on anything new or fixable.
//
// Exit codes: 0 = clean (or only allowlisted advisories present), 1 = blocked.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const THRESHOLD = SEVERITY_RANK.moderate;

const here = dirname(fileURLToPath(import.meta.url));
const allowlistPath = join(here, "..", "audit-allowlist.json");

/** @type {Record<string, unknown>} */
let allowlist = {};
try {
  allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
} catch (err) {
  console.error(`audit-gate: could not read ${allowlistPath}: ${err.message}`);
  process.exit(1);
}
const allowed = new Set(Object.keys(allowlist).filter((k) => !k.startsWith("$")));

function runAudit() {
  // npm audit exits non-zero when vulnerabilities are found; capture stdout anyway.
  try {
    return execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

const report = JSON.parse(runAudit());

// Collect distinct advisories (the object entries in each vuln's `via`).
/** @type {Map<string, {id: string, severity: string, name: string, title: string}>} */
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== "object" || !via.url) continue;
    const id = String(via.url).replace("https://github.com/advisories/", "");
    advisories.set(id, {
      id,
      severity: via.severity ?? "unknown",
      name: via.name ?? vuln.name ?? "?",
      title: via.title ?? "",
    });
  }
}

const atOrAboveThreshold = [...advisories.values()].filter(
  (a) => (SEVERITY_RANK[a.severity] ?? 0) >= THRESHOLD
);
const blocking = atOrAboveThreshold.filter((a) => !allowed.has(a.id));
const acceptedPresent = atOrAboveThreshold.filter((a) => allowed.has(a.id));
const staleAllowlist = [...allowed].filter(
  (id) => !atOrAboveThreshold.some((a) => a.id === id)
);

if (acceptedPresent.length) {
  console.log("audit-gate: accepted (allowlisted) advisories present:");
  for (const a of acceptedPresent) console.log(`  - ${a.id} ${a.severity} ${a.name}: ${a.title}`);
}
if (staleAllowlist.length) {
  // Not fatal, but surface it so the allowlist gets trimmed once upstream fixes land.
  console.log(`audit-gate: NOTE stale allowlist entries no longer reported: ${staleAllowlist.join(", ")}`);
}

if (blocking.length) {
  console.error(`\naudit-gate: FAILED — ${blocking.length} moderate+ advisory(ies) not in audit-allowlist.json:`);
  for (const a of blocking) console.error(`  - ${a.id} ${a.severity} ${a.name}: ${a.title}`);
  console.error("\nFix the dependency, or (if genuinely unfixable) add the advisory id to mobile/audit-allowlist.json with justification.");
  process.exit(1);
}

console.log(`\naudit-gate: PASS — no un-allowlisted moderate+ advisories (${acceptedPresent.length} accepted).`);
process.exit(0);
