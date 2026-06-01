import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutSummaryModal } from "../components/checkout-summary-modal";
import { SetupFeeManager } from "../components/setup-fee-manager";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

describe("setup fee checkout UI", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders setup fee line items before confirmation", async () => {
    const onConfirm = vi.fn();
    apiFetchMock.mockResolvedValueOnce({
      currency: "USD",
      base_amount_cents: 12000,
      setup_fee_amount_cents: 3000,
      discount_amount_cents: 0,
      tax_amount_cents: 0,
      total_amount_cents: 15000,
      line_items: [
        { label: "Hourly reservation", amount_cents: 12000 },
        { label: "Room setup", amount_cents: 2000 },
        { label: "AV kit", amount_cents: 1000 },
      ],
    });

    render(
      <CheckoutSummaryModal
        open
        payload={{
          space_public_id: "space_1",
          start_datetime: "2026-06-01T14:00:00.000Z",
          end_datetime: "2026-06-01T16:00:00.000Z",
          booking_mode: "hourly",
          full_day: false,
        }}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(await screen.findByText("Room setup")).toBeInTheDocument();
    expect(screen.getByText("AV kit")).toBeInTheDocument();
    expect(screen.getByText("$150")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("loads and replaces owner setup fee rows", async () => {
    apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/spaces/space_1/setup-fees" && init?.method === "GET") {
        return Promise.resolve([
          {
            public_id: "setup_1",
            label: "Room setup",
            amount_cents: 7500,
            is_active: true,
            sort_order: 0,
          },
        ]);
      }
      if (url === "/api/spaces/space_1/setup-fees" && init?.method === "PUT") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unhandled API call: ${url}`));
    });

    render(<SetupFeeManager spacePublicId="space_1" />);

    expect(await screen.findByDisplayValue("Room setup")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add fee" }));
    const labels = screen.getAllByLabelText("Line item");
    const amounts = screen.getAllByLabelText("Amount ($)");
    fireEvent.change(labels[1], { target: { value: "AV kit" } });
    fireEvent.change(amounts[1], { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save setup fees" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/spaces/space_1/setup-fees",
        {
          method: "PUT",
          body: JSON.stringify({
            items: [
              { label: "Room setup", amount_cents: 7500, is_active: true, sort_order: 0 },
              { label: "AV kit", amount_cents: 2500, is_active: true, sort_order: 1 },
            ],
          }),
        },
        "token",
      );
    });
  });
});
