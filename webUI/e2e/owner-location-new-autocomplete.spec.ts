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
      await json(route, []);
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
        var instances = (window.__priddyAutocompleteInstances = []);
        window.google.maps.places.Autocomplete = function (input, opts) {
          calls.push({ input: input.id, opts: opts });
          this._listeners = {};
          this._place = {};
          this.addListener = function (event, handler) {
            this._listeners[event] = handler;
            return { remove: function () {} };
          };
          this.getPlace = function () { return this._place; };
          instances.push(this);
        };
        window.__priddySelectFirstPlace = function (place) {
          instances[0]._place = place;
          instances[0]._listeners.place_changed();
        };
        window["${callbackName}"] && window["${callbackName}"]();
      })();
    `;
    await route.fulfill({ status: 200, contentType: "application/javascript", body });
  });

  await page.goto("/owner/locations/new");

  const addressInput = page.locator("input#address");
  await expect(addressInput).toBeVisible();
  const orgNameInput = page.getByLabel("New organization name");
  const locationNameInput = page.getByLabel("Location name");

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

  await orgNameInput.fill("Priddy spaces");
  await locationNameInput.fill("prabhat new york1");
  await addressInput.fill("Empire State");

  await page.evaluate(() => {
    (
      window as unknown as {
        __priddySelectFirstPlace: (place: unknown) => void;
      }
    ).__priddySelectFirstPlace({
      address_components: [
        { long_name: "20", short_name: "20", types: ["street_number"] },
        { long_name: "West 34th Street", short_name: "W 34th St", types: ["route"] },
        { long_name: "New York", short_name: "New York", types: ["locality"] },
        { long_name: "New York", short_name: "NY", types: ["administrative_area_level_1"] },
        { long_name: "United States", short_name: "US", types: ["country"] },
        { long_name: "10001", short_name: "10001", types: ["postal_code"] },
      ],
      formatted_address: "20 W 34th St., New York, NY 10001, USA",
      geometry: {
        location: {
          lat: () => 40.7484,
          lng: () => -73.9857,
        },
      },
    });
  });

  await expect(orgNameInput).toHaveValue("Priddy spaces");
  await expect(locationNameInput).toHaveValue("prabhat new york1");
  await expect(addressInput).toHaveValue("20 West 34th Street");
  await expect(page.getByText("New York, NY, 10001", { exact: false })).toBeVisible();
  await expect(page.getByText("40.7484, -73.9857", { exact: false })).toBeVisible();
});
