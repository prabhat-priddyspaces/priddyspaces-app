import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerPaymentSettingsScreen } from "../src/screens/owner/OwnerPaymentSettingsScreen";
import { apiFetch } from "../src/lib/api";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const stripeSetting = {
  public_id: "ps_1",
  provider: "stripe",
  is_enabled: true,
  is_test_mode: true,
  stripe_publishable_key: "pk_test_123",
  has_stripe_secret_key: true,
  has_stripe_webhook_secret: false,
  cardpointe_merchant_id: null,
  has_cardpointe_username: false,
  has_cardpointe_password: false,
  cardpointe_site: null,
  cardpointe_tokenizer_url: null,
  connection_status: "ok",
  last_tested_at: null,
};

const readiness = {
  organization_public_id: "org_1",
  organization_name: "Priddyspaces",
  provider: "stripe",
  status: "ready",
  blockers: [],
  public_listing_count: 3,
  marketplace_visible_listing_count: 3,
  payment_hidden_listing_count: 0,
};

function mockApi(overrides: Record<string, unknown> = {}) {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    const key = `${method} ${path}`;
    if (key in overrides) {
      const value = overrides[key];
      return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    }
    if (key === "GET /api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (key === "GET /api/owner/payment-settings?organization_public_id=org_1") {
      return Promise.resolve([stripeSetting]);
    }
    if (key === "GET /api/owner/marketplace-readiness") return Promise.resolve([readiness]);
    if (key === "GET /api/locations?organization_public_id=org_1") {
      return Promise.resolve([{ public_id: "loc_1", name: "Rochester Hub" }]);
    }
    if (method === "POST" || method === "PATCH") return Promise.resolve({});
    return Promise.resolve([]);
  });
}

describe("OwnerPaymentSettingsScreen", () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockReset();
  });

  it("loads readiness, prefills the provider form, and lists configured providers", async () => {
    mockApi();
    const { getByText, getByLabelText } = render(<OwnerPaymentSettingsScreen />);

    await waitFor(() =>
      expect(getByText("Payments are ready. Public listings can appear in marketplace search.")).toBeTruthy(),
    );
    expect(getByLabelText("Stripe publishable key").props.value).toBe("pk_test_123");
    expect(getByLabelText("Stripe secret key").props.placeholder).toBe("Secret key saved");
    expect(getByText("stripe")).toBeTruthy();
    expect(getByText("Enabled • Test • ok")).toBeTruthy();
  });

  it("saves provider credentials with the same payload shape as web", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerPaymentSettingsScreen />);

    await waitFor(() => expect(getByLabelText("Stripe publishable key").props.value).toBe("pk_test_123"));
    fireEvent.changeText(getByLabelText("Stripe secret key"), "sk_test_456");
    fireEvent.press(getByLabelText("Save provider"));

    await waitFor(() => expect(getByText("Payment settings saved")).toBeTruthy());
    const saveCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) =>
        path === "/api/owner/payment-settings?organization_public_id=org_1" && options?.method === "POST",
    );
    expect(JSON.parse(saveCall[1].body)).toMatchObject({
      provider: "stripe",
      is_enabled: true,
      is_test_mode: true,
      stripe_publishable_key: "pk_test_123",
      stripe_secret_key: "sk_test_456",
    });
  });

  it("disables and tests the configured provider", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerPaymentSettingsScreen />);

    await waitFor(() => expect(getByLabelText("Disable provider")).toBeTruthy());
    fireEvent.press(getByLabelText("Disable provider"));
    await waitFor(() => expect(getByText("Provider disabled")).toBeTruthy());
    expect(
      (apiFetch as jest.Mock).mock.calls.some(
        ([path, options]) => path === "/api/owner/payment-settings/ps_1/disable" && options?.method === "POST",
      ),
    ).toBe(true);

    fireEvent.press(getByLabelText("Test connection"));
    await waitFor(() => expect(getByText("Connection test succeeded")).toBeTruthy());
    expect(
      (apiFetch as jest.Mock).mock.calls.some(
        ([path, options]) => path === "/api/owner/payment-settings/ps_1/test" && options?.method === "POST",
      ),
    ).toBe(true);
  });

  it("saves organization and location provider overrides", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerPaymentSettingsScreen />);

    await waitFor(() => expect(getByLabelText("Organization provider Stripe")).toBeTruthy());
    fireEvent.press(getByLabelText("Organization provider Stripe"));
    fireEvent.press(getByLabelText("Save organization override"));
    await waitFor(() => expect(getByText("Organization payment provider saved")).toBeTruthy());
    const orgCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) =>
        path === "/api/owner/payment-provider/organization/org_1" && options?.method === "PATCH",
    );
    expect(JSON.parse(orgCall[1].body)).toEqual({ payment_provider: "stripe" });

    fireEvent.press(getByLabelText("Location provider CardPointe"));
    fireEvent.press(getByLabelText("Save location override"));
    await waitFor(() => expect(getByText("Location payment provider saved")).toBeTruthy());
    const locationCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) =>
        path === "/api/owner/payment-provider/location/loc_1" && options?.method === "PATCH",
    );
    expect(JSON.parse(locationCall[1].body)).toEqual({ payment_provider: "cardpointe" });
  });

  it("switches to CardPointe fields and surfaces load errors", async () => {
    mockApi({ "GET /api/owner/payment-settings?organization_public_id=org_1": new Error("Settings unavailable") });
    const { getByText } = render(<OwnerPaymentSettingsScreen />);
    await waitFor(() => expect(getByText("Settings unavailable")).toBeTruthy());

    mockApi();
    const { getByLabelText, queryByLabelText } = render(<OwnerPaymentSettingsScreen />);
    await waitFor(() => expect(getByLabelText("Provider CardPointe")).toBeTruthy());
    fireEvent.press(getByLabelText("Provider CardPointe"));
    expect(getByLabelText("Merchant ID")).toBeTruthy();
    expect(getByLabelText("Tokenizer URL")).toBeTruthy();
    expect(queryByLabelText("Stripe publishable key")).toBeNull();
  });
});
