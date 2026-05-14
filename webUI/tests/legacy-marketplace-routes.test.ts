import { describe, expect, it } from "vitest";

import { legacyLocationRedirectHref } from "../lib/legacy-marketplace-routes";

describe("legacy marketplace routes", () => {
  it("recovers stale meeting room placeholder URLs to server location routes", () => {
    expect(
      legacyLocationRedirectHref("meeting-rooms", "_.html", {
        id: "loc_1",
        lat: "26.132029",
        lng: "-80.262418",
        radius_miles: "50",
      }),
    ).toBe("/locations/loc_1?route=meeting-rooms&lat=26.132029&lng=-80.262418&radius_miles=50");
  });

  it("redirects stale private-office location paths to the canonical location route", () => {
    expect(
      legacyLocationRedirectHref("private-offices", "loc_2", {
        q: "Miami",
        route: "spaces",
      }),
    ).toBe("/locations/loc_2?route=private-offices&q=Miami");
  });
});
