import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditSpaceClient } from "../app/owner/spaces/[spaceId]/edit/client";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ spaceId: "space_1" }),
}));

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The live managers fetch on mount; stub them out for this validation test.
vi.mock("../components/lease-terms-manager", () => ({
  LeaseTermsManager: () => <div data-testid="lease-terms-manager" />,
}));
vi.mock("../components/setup-fee-manager", () => ({
  SetupFeeManager: () => <div data-testid="setup-fee-manager" />,
}));
vi.mock("../components/volume-discount-manager", () => ({
  VolumeDiscountManager: () => <div data-testid="volume-discount-manager" />,
}));

describe("EditSpaceClient required-price validation", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/spaces/space_1" && (!init || init.method === "GET")) {
        return Promise.resolve({
          public_id: "space_1",
          name: "Conf A",
          space_type: "conference_room",
          capacity: 4,
          price_monthly: null,
          price_daily: "200",
          price_hourly: "30",
          availability_status: "available",
          availability_start_time: null,
          availability_end_time: null,
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          visibility: "public",
        });
      }
      return Promise.resolve({});
    });
  });

  it("disables Save Changes when a required conference price is cleared", async () => {
    render(<EditSpaceClient />);

    const saveButton = await screen.findByRole("button", { name: "Save Changes" });
    expect(saveButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Hourly price (USD)*"), { target: { value: "" } });
    await waitFor(() => expect(saveButton).toBeDisabled());

    fireEvent.change(screen.getByLabelText("Hourly price (USD)*"), { target: { value: "30" } });
    await waitFor(() => expect(saveButton).toBeEnabled());

    fireEvent.change(screen.getByLabelText("Day rate price (USD)*"), { target: { value: "" } });
    await waitFor(() => expect(saveButton).toBeDisabled());
  });
});
