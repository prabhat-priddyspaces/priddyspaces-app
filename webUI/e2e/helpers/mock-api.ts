import { Page, Route } from "@playwright/test";

const AUTH_TOKEN_KEY = "priddyspaces_access_token";

export async function mockSession(page: Page, role: "customer" | "owner") {
  await page.addInitScript((tokenKey: string) => {
    window.localStorage.setItem(tokenKey, "playwright-token");
  }, AUTH_TOKEN_KEY);
}

export async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
