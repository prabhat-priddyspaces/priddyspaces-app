// True when Playwright/CI runs the app without Clerk so existing e2e specs
// (which mock /api/** and use a localStorage access token) can hit protected
// routes. Set by playwright.config.ts and the CI workflow.
export const IS_E2E_BYPASS =
  process.env.NEXT_PUBLIC_E2E_BYPASS_CLERK === "1";
