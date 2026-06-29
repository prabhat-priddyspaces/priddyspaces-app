# Mobile dependency security notes

The `mobile-security` CI job audits production dependencies
(`npm audit --omit=dev`) via `scripts/audit-gate.mjs`. This file records how the
current advisories are handled.

## A. Fixed via `overrides` (package.json)

These were transitive vulnerabilities whose patched versions are compatible with
the current tree, so they are pinned directly. Fixing the leaf packages also
clears every "depends on a vulnerable version of …" advisory that cascaded from
them (viem, isows, jayson, @solana/*, @clerk/*, @coinbase/* , metro, etc.).

| Override | Fixes | Notes |
|---|---|---|
| `ws` → `8.21.0` | GHSA-96hv-2xvq-fx4p (high, memory-exhaustion DoS) | ws 1.x/4.x remain (dev-only, not in the prod tree, not vulnerable). |
| `undici@<6.27.0` → `6.27.0` | GHSA-vxpw-j846-p89q (high), GHSA-p88m-4jfj-68fv (moderate), + two low | Stays within undici 6.x. |
| `tar@<=7.5.15` → `7.5.19` | GHSA-vmf3-w455-68vh (moderate) | Patch within tar 7.x. |

Validated: `npm ci` clean + `npm test` (48 suites / 178 tests) pass after the
overrides; production audit drops from 34 advisories to one (below).

## B. Accepted via allowlist (`audit-allowlist.json`)

| Advisory | Package | Severity | Why accepted |
|---|---|---|---|
| GHSA-h67p-54hq-rp68 | js-yaml | moderate | Pulled in transitively by `cosmiconfig@5` (Expo/Metro config loading). The fix needs js-yaml 4.x, but cosmiconfig@5 calls the removed `safeLoad`/`safeDump` API, so forcing it breaks the Metro/Expo build. The quadratic-complexity YAML DoS only affects parsing attacker-controlled YAML, which is build-time tooling — not the runtime mobile app. |

The gate (`scripts/audit-gate.mjs`) fails on **any** moderate+ advisory that is
not in the allowlist, so new or newly-fixable vulnerabilities still break CI.

## C. Follow-up (full remediation)

The single accepted advisory and the heavy wallet-SDK transitive tree
(`@clerk/expo` → `@clerk/clerk-js` → `@base-org/account` / `@coinbase/wallet-sdk`
→ `viem`) are resolved by a coordinated **React Native + Expo + Metro + Clerk
major upgrade** (the `react-native@0.86`/Expo SDK line), which pulls
`cosmiconfig>=8` (js-yaml 4.x) and newer Clerk/wallet dependencies.

That upgrade is a breaking change requiring on-device QA and is intentionally
out of scope here; attempting it mechanically (`npm audit fix --force`) breaks
the test/build toolchain and does not clear the audit. Track it as a dedicated
upgrade effort and trim `audit-allowlist.json` once it lands.
