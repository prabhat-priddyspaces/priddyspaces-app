import { expect, test } from "@playwright/test";

import { json, meResponse, mockSession } from "./helpers/mock-api";

// Verifies that the address-autocomplete component on /owner/locations/new
// successfully wires up google.maps.places.Autocomplete without falling
// back to either of its warning states ("Could not load Google Maps" or
// "Address autocomplete unavailable"). Catches regressions like the
// pre-resolve race on `loading=async` and the `importLibrary` undefined
// crash that bit us during the initial rollout.

test("owner location new: address autocomplete loads and binds without warnings", async ({ page }) => {
  await mockSession(page, "owner");

  // Stub the JSON the form needs so the page renders without a real backend.
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;

    if (key === "GET /api/me") {
      await json(route, meResponse("owner"));
      return;
    }
    if (key === "GET /api/orgs") {
      await json(route, [{ public_id: "org_1", name: "Skyline Works" }]);
      return;
    }
    if (url.pathname.startsWith("/api/amenities") || url.pathname.startsWith("/api/orgs/")) {
      await json(route, []);
      return;
    }
    await json(route, { detail: `Unhandled route: ${key}` }, 404);
  });

  // Mock the Google Maps JS load. The component appends a <script> with a
  // ?callback= parameter; we capture that callback name from the URL and
  // build a tiny shim that defines google.maps.places.Autocomplete and then
  // fires the callback, mirroring the real loader's contract.
  await page.route("https://maps.googleapis.com/maps/api/js**", async (route) => {
    const url = new URL(route.request().url());
    const callbackName = url.searchParams.get("callback");
    expect(callbackName, "Maps loader URL must include a callback param").toBeTruthy();
    expect(url.searchParams.get("libraries"), "Maps loader URL must request the places library")
      .toContain("places");
    const body = `
      (function () {
        window.google = window.google || {};
        window.google.maps = window.google.maps || {};
        window.google.maps.places = window.google.maps.places || {};
        var calls = (window.__priddyAutocompleteCalls = []);
        window.google.maps.places.Autocomplete = function (input, opts) {
          calls.push({ input: input.id, opts: opts });
          this._listeners = {};
          this.addListener = function (event, handler) {
            this._listeners[event] = handler;
            return { remove: function () {} };
          };
          this.getPlace = function () { return {}; };
        };
        window["${callbackName}"] && window["${callbackName}"]();
      })();
    `;
    await route.fulfill({ status: 200, contentType: "application/javascript", body });
  });

  await page.goto("/owner/locations/new");

  const addressInput = page.locator("input#address");
  await expect(addressInput).toBeVisible();

  // The two failure-mode strings the component renders. Neither should appear.
  const sdkFailure = page.getByText("Could not load Google Maps", { exact: false });
  const noKeyWarning = page.getByText("Address autocomplete unavailable", { exact: false });
  await expect(sdkFailure).toHaveCount(0);
  await expect(noKeyWarning).toHaveCount(0);

  // And the constructor must have actually been called on our input.
  const autocompleteCalls = await page.evaluate(
    () => (window as unknown as { __priddyAutocompleteCalls?: Array<{ input: string }> }).__priddyAutocompleteCalls || [],
  );
  expect(autocompleteCalls.length, "Autocomplete should have been instantiated").toBeGreaterThan(0);
  expect(autocompleteCalls[0].input).toBe("address");
});

