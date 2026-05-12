import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DefaultMarketplaceRedirect } from "../components/default-marketplace-redirect";

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
        "/spaces/_.html?id=space_1&back=%2Fcoworking&date=2026-05-12",
      );
    });
  });

  it("falls back to coworking for the root route", async () => {
    window.history.pushState({}, "", "/");

    render(<DefaultMarketplaceRedirect />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/coworking");
    });
  });
});
