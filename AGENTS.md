# AI Agent Instructions

You are working as a senior engineer in the Priddyspaces application repository.

This repo contains:
- `backend/`: FastAPI API, Alembic migrations, Python tests.
- `webUI/`: Next.js web app, Vitest tests, Playwright E2E tests.
- `mobile/`: Expo React Native app and Jest tests.
- `docs/`: architecture, API, database, auth, and deployment notes.

## Branch, PR, merge, and deploy rules

- Start every task from a new branch. Use `codex/<short-description>` unless the user requests a different name.
- Target pull requests to `main`.
- Do not push directly to `main`.
- Commit only after the relevant local validation passes or after clearly documenting the blocker.
- Push the branch and create or update a PR when a remote is available.
- Fix local test failures, CI failures, review feedback, and deployment issues before calling the task complete.
- Do not merge unless CI passes and repo rules, approval gates, and human approval allow it.
- App deploys happen through existing GitHub Actions after merge to `main` or through explicit manual workflow dispatch.
- Do not deploy staging or production without explicit human authorization and the required GitHub Environment approvals.

Full delivery loop:
1. Fetch the latest `origin/main`.
2. Create a new branch from `main`.
3. Make only the intended changes.
4. Run the relevant local checks.
5. Commit the intended files with a clear message.
6. Push the branch and create a PR to `main`.
7. Wait for CI and required checks to complete.
8. If anything fails, inspect logs and artifacts, fix the root cause, commit, repush, and repeat until checks pass.
9. Merge only after CI passes and required repo or human approvals allow it.
10. Deploy only through the approved app deployment path.

## Before making code changes

1. Inspect the repo structure.
2. Read relevant docs and configuration first, including `README.md`, package files, env examples, Docker files, CI workflows, and existing tests.
3. Identify impacted frontend, backend, mobile, database, scripts, and deployment paths.
4. Understand existing roles, routes, APIs, forms, workflows, permissions, and integrations before editing.
5. Search for related code before changing files.
6. Preserve existing conventions and avoid unrelated refactors.

## Completion rule

Every implementation task must include the appropriate code, config, documentation, or test change plus validation. Do not create fake code changes for documentation-only tasks.

For user-facing or behavior changes, the task is not complete until:
- relevant local checks have run,
- automated tests have been added or updated,
- Playwright E2E coverage has been added or updated when a web user flow is affected,
- failures have been investigated and fixed or clearly documented,
- the branch is committed and pushed when supported,
- a PR to `main` exists when supported.

## App validation commands

Detect the correct commands from this repo before running them. Common commands include:

```bash
docker compose config
docker compose up -d --build
```

Backend:

```bash
cd backend
pip install -r requirements.txt
pytest -q
python -m alembic upgrade head
```

Web UI:

```bash
cd webUI
npm ci
npm run lint
npm test
npm run build
npm run test:e2e
```

Mobile:

```bash
cd mobile
npm ci
npm test -- --runInBand
```

Use the relevant subset for the changed area. If dependencies are already installed, do not reinstall unnecessarily. If a command is missing or obsolete, identify the repo-supported replacement.

## E2E testing

Use Playwright for browser E2E tests when web user flows are affected. Tests must verify real user behavior, not only API 200 responses.

Discover and cover affected flows such as:
- signup and registration,
- login and logout,
- dashboard loading,
- search and filters,
- create, edit, update, delete, cancel, and approval workflows,
- permissions and role-specific navigation,
- settings,
- payments in test mode,
- email and notification mocks,
- calendar and availability,
- activity and audit logs.

Each E2E test should verify:
- the visible UI result,
- backend or database state where practical.

Prefer stable selectors such as:

```tsx
data-testid="booking-submit-button"
```

over fragile CSS selectors.

## Test data and external services

Create repeatable seed data when test data is missing. Use test users only:

- `admin@test.com`
- `owner@test.com`
- `customer@test.com`
- `team@test.com`
- `Password123!`

Never use production credentials.

Disable or mock these services in test mode:
- real payments,
- real email,
- SMS or OTP,
- captcha,
- calendar APIs,
- map or geocoding APIs,
- external webhooks.

## Playwright failure loop

If Playwright or E2E fails:
1. Read the error and logs.
2. Inspect screenshot, video, and trace artifacts when available.
3. Identify the root cause.
4. Fix code or test setup.
5. Rerun the failed test.
6. Rerun the relevant full suite.
7. Repeat until passing or document the blocker.

Do not delete, skip, or weaken tests just to pass.

Maintain Playwright configuration for:
- screenshot on failure,
- video on failure,
- trace on retry,
- reusable login storage state when helpful,
- stable `data-testid` selectors for important controls.

## Deployment checks

When app deployment behavior is affected:
- verify GitHub Actions workflow changes,
- confirm backend deploy still builds and pushes the backend Docker image,
- confirm migrations are handled before ECS service update,
- confirm frontend static export and CloudFront invalidation still match infra outputs,
- document any new environment variables in the app and infra repos,
- ensure secrets are not hardcoded.

## Final response format

Always report:

```md
Summary:
Files changed:
Tests run:
E2E scenarios covered:
Failures fixed:
Risks:
Next steps:
```
