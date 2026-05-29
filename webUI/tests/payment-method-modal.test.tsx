import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentMethodModal } from "../components/payment-method-modal";
import { apiFetch } from "../lib/api";

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("PaymentMethodModal", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/payment-methods?")) return Promise.resolve([]);
      if (url === "/api/payment-methods/setup-session") {
        return Promise.resolve({
          provider: "cardpointe",
          owner_payment_setting_public_id: "ops_1",
          provider_customer_id: null,
          client_secret: null,
          setup_intent_id: null,
          publishable_key: null,
          tokenizer_url: "https://tokenizer.test?useexpiry=true&enhancedresponse=true",
        });
      }
      if (url === "/api/payment-methods" && init?.method === "POST") {
        return Promise.resolve({ public_id: "pm_1" });
      }
      return Promise.resolve({});
    });
  });

  it("requires CardPointe last4 and expiration before saving", async () => {
    const onSaved = vi.fn();
    render(
      <PaymentMethodModal
        open
        spacePublicId="space_1"
        organizationName="Skyline Works"
        initialMode="add"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    expect(await screen.findByTitle("CardPointe tokenizer")).toBeInTheDocument();
    expect(
      screen.getByText("I authorize Skyline Works to charge this card for approved or instant bookings."),
    ).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Save payment method" });
    expect(saveButton).toBeDisabled();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ message: "9411111111114242", expiry: "122030" }),
      }),
    );
    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("pm_1"));
    const saveCall = vi.mocked(apiFetch).mock.calls.find(([url, init]) => url === "/api/payment-methods" && init?.method === "POST");
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({
      card_token: "9411111111114242",
      last4: "4242",
      expiration: "122030",
    });
  });
});
