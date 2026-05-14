import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DefaultMarketplaceRedirect,
  defaultMarketplaceFallbackHref,
} from "../components/default-marketplace-redirect";

const replaceMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe("DefaultMarketplaceRedirect", () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it("recovers legacy static-export space detail URLs", async () => {
    window.history.pushState({}, "", "/spaces/space_1?date=2026-05-12");

    render(<DefaultMarketplaceRedirect />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        "/spaces/_.html?id=space_1&back=%2Fspaces&date=2026-05-12",
      );
    });
  });

  it("recovers legacy static-export location detail URLs", async () => {
    window.history.pushState({}, "", "/locations/location_1");

    render(<DefaultMarketplaceRedirect />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/locations/_.html?id=location_1");
    });
  });

  it("recovers clean static-export URLs when CloudFront serves the root fallback", async () => {
    window.history.pushState({}, "", "/owners/sign-up?utm=owner");

    render(<DefaultMarketplaceRedirect />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/owners/sign-up.html?utm=owner");
    });
  });

  it("falls back to the exported spaces route for the root route", async () => {
    window.history.pushState({}, "", "/");

    render(<DefaultMarketplaceRedirect />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/spaces");
    });
  });

  it("redirects app routes to their static HTML file instead of the public marketplace", () => {
    expect(defaultMarketplaceFallbackHref("/owner/locations/new", "")).toBe(
      "/owner/locations/new.html",
    );
    expect(defaultMarketplaceFallbackHref("/admin/members", "")).toBe("/admin/members.html");
    expect(defaultMarketplaceFallbackHref("/member/calendar", "")).toBe("/member/calendar.html");
  });

  it("recovers member request detail URLs for static export", () => {
    expect(defaultMarketplaceFallbackHref("/member/requests/req_1", "?tab=payment")).toBe(
      "/member/requests/_.html?tab=payment&id=req_1",
    );
  });

  it("recovers legacy owner space media URLs for static export", () => {
    expect(
      defaultMarketplaceFallbackHref(
        "/owner/spaces/space_1/media",
        "?locationId=location_1",
      ),
    ).toBe("/owner/spaces/media.html?locationId=location_1&spaceId=space_1");
  });

  it("recovers legacy owner space edit URLs for static export", () => {
    expect(defaultMarketplaceFallbackHref("/owner/spaces/space_1/edit", "")).toBe(
      "/owner/spaces/edit.html?spaceId=space_1",
    );
  });

  it("recovers admin member detail URLs for static export", () => {
    expect(defaultMarketplaceFallbackHref("/admin/members/member_1", "")).toBe(
      "/admin/members/_.html?id=member_1",
    );
  });

  it("recovers admin owner user detail URLs for static export", () => {
    expect(defaultMarketplaceFallbackHref("/admin/owner-users/owner_1", "?tab=activity")).toBe(
      "/admin/owner-users/_.html?tab=activity&id=owner_1",
    );
  });
});
