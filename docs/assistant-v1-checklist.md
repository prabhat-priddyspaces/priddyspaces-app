# Assistant V1 Implementation Checklist

This file is the source-of-truth checklist for the single Assistant V1 PR.

## Branch And Release

- [x] Create `codex/priddyspaces-assistant-v1` from `main`.
- [x] Keep this checklist updated until merge.
- [x] Commit all assistant work intentionally.
- [x] Push one branch and open one PR.
- [ ] Merge into `main` after CI passes.
- [ ] Verify the existing dev backend/frontend deploy workflows complete.

## Backend

- [x] Add assistant settings and dark-launch feature flag.
- [x] Add assistant persistence models and migration.
- [x] Add OpenAI Responses API adapter with deterministic test fallback.
- [x] Add persona resolver and RBAC-scoped session builder.
- [x] Add PII redaction before persistence and provider calls.
- [x] Add rate limiting, cost cap, and tool-hop guards.
- [x] Add chat, conversation, feedback, export, proposal, support, policy KB, and quality APIs.
- [x] Add marketplace, booking, billing, operations, analytics, policy, support, wayfinding, and platform read-only tool handlers.
- [x] Add proactive reminder and space-alert jobs.

## Web

- [x] Add assistant types, stream client, and hook.
- [x] Add global `AssistantMount`, panel, messages, citations, proposal cards, and escalation UI.
- [x] Add admin assistant quality dashboard.
- [x] Add owner/admin policy KB management UI.

## Mobile

- [x] Add authenticated assistant entry from app headers.
- [x] Add assistant screen with messages, citations, proposals, and escalation.
- [x] Add token-authenticated assistant API/SSE client.

## Tests And CI

- [x] Add backend assistant tests for disabled state, RBAC, rate limits, redaction, citations, proposals, escalation, KB, and jobs.
- [x] Add web unit/E2E coverage for parser, panel, citations, proposals, escalation, KB, and quality dashboard.
- [x] Add mobile Jest coverage for authenticated gate, entry, chat rendering, citations, and proposals.
- [x] Update CI to run mobile tests when mobile paths change.
- [x] Run backend, web, e2e, and mobile tests locally where dependencies are available.
