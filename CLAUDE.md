# Claude Code Instructions

Follow all shared agent rules from `AGENTS.md`.

Before every task:
- Read `AGENTS.md`.
- Inspect this repo.
- Understand existing functionality before coding.
- Search for related files before editing.
- Start from a new branch and target PRs to `main`.

For every implementation change:
- update or add tests,
- run relevant local checks,
- run Playwright E2E when a web user flow is affected,
- inspect logs and Playwright artifacts when failures occur,
- fix failures and rerun the relevant suite,
- commit after checks pass or document blockers,
- push the branch and create or update a PR when supported.

Never skip testing.
Never remove, skip, or weaken tests just to pass.
Never use production credentials.
Never call real payment, email, SMS, captcha, calendar, map, geocoding, or webhook services in tests.
Never push directly to `main`.
Never merge or deploy unless CI passes and repo rules, approval gates, and human approval allow it.

At the end, report:
- what changed,
- files changed,
- tests run,
- E2E scenarios covered,
- failures fixed,
- risks,
- next steps.
