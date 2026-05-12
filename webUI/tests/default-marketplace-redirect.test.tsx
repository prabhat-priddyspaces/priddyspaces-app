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

  it("does not send protected static-export misses to the public marketplace", () => {
    expect(defaultMarketplaceFallbackHref("/owner/locations/new", "")).toBeNull();
    expect(defaultMarketplaceFallbackHref("/admin/members", "")).toBeNull();
    expect(defaultMarketplaceFallbackHref("/member/requests", "")).toBeNull();
  });
});
