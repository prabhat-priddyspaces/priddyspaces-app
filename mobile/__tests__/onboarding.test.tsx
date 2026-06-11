import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OnboardingScreen } from "../src/screens/OnboardingScreen";
import { OrgOnboardingScreen } from "../src/screens/OrgOnboardingScreen";

const mockGetToken = jest.fn();
const mockRefreshMe = jest.fn();

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ getToken: mockGetToken, refreshMe: mockRefreshMe }),
}));

function lastFetchBody(): Record<string, unknown> {
  const calls = (global.fetch as jest.Mock).mock.calls;
  return JSON.parse(calls[calls.length - 1][1].body);
}

describe("OnboardingScreen role selection", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetToken.mockReset().mockResolvedValue("token");
    mockRefreshMe.mockReset().mockResolvedValue(undefined);
    jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("submits a member profile by default and refreshes me", async () => {
    const { getByText, getByPlaceholderText } = render(<OnboardingScreen />);

    fireEvent.changeText(getByPlaceholderText("Jane Doe"), "Casey Member");
    fireEvent.press(getByText("I agree to the Terms and Conditions and Privacy Policy."));
    fireEvent.press(getByText("Save member profile"));

    await waitFor(() => expect(mockRefreshMe).toHaveBeenCalled());
    expect(lastFetchBody()).toMatchObject({
      role: "member",
      full_name: "Casey Member",
      terms_accepted: true,
      privacy_policy_accepted: true,
    });
  });

  it("submits an owner profile with required phone", async () => {
    const { getByText, getByLabelText, getByPlaceholderText } = render(<OnboardingScreen />);

    fireEvent.press(getByLabelText("List my workspace"));
    fireEvent.changeText(getByPlaceholderText("Jane Doe"), "Olive Owner");
    fireEvent.press(getByText("I agree to the Terms and Conditions and Privacy Policy."));

    // Owner flow requires a phone number before submitting.
    fireEvent.press(getByText("Continue to business details"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Phone required",
      "Please enter a phone number for your owner account.",
    );
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.changeText(getByPlaceholderText("5551234567"), "(585) 555-0100");
    fireEvent.press(getByText("Continue to business details"));

    await waitFor(() => expect(mockRefreshMe).toHaveBeenCalled());
    expect(lastFetchBody()).toMatchObject({
      role: "owner",
      full_name: "Olive Owner",
      phone: "5855550100",
    });
  });
});

describe("OrgOnboardingScreen", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetToken.mockReset().mockResolvedValue("token");
    mockRefreshMe.mockReset().mockResolvedValue(undefined);
    jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("requires legal name and business phone before creating", async () => {
    const { getByText, getByPlaceholderText } = render(<OrgOnboardingScreen />);

    fireEvent.press(getByText("Create organization"));
    expect(Alert.alert).toHaveBeenCalledWith("Name required", "Please enter your legal business name.");

    fireEvent.changeText(getByPlaceholderText("Acme Coworking LLC"), "Acme Coworking LLC");
    fireEvent.press(getByText("Create organization"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Business phone required",
      "Please enter a business phone number.",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("creates the organization with web-parity payload and refreshes me", async () => {
    const { getByText, getByPlaceholderText } = render(<OrgOnboardingScreen />);

    fireEvent.changeText(getByPlaceholderText("Acme Coworking LLC"), "Acme Coworking LLC");
    fireEvent.changeText(getByPlaceholderText("Acme Coworking"), "Acme Coworking");
    fireEvent.changeText(getByPlaceholderText("hello@example.com"), "hello@acme.com");
    fireEvent.changeText(getByPlaceholderText("5551234567"), "585-555-0100");
    fireEvent.changeText(getByPlaceholderText("https://example.com"), "https://acme.com");
    fireEvent.changeText(
      getByPlaceholderText("Briefly describe your workspace business and the spaces you plan to list."),
      "Two floors of coworking in Rochester.",
    );
    fireEvent.press(getByText("Create organization"));

    await waitFor(() => expect(mockRefreshMe).toHaveBeenCalled());
    expect(lastFetchBody()).toEqual({
      name: "Acme Coworking LLC",
      display_name: "Acme Coworking",
      business_email: "hello@acme.com",
      business_phone: "5855550100",
      website: "https://acme.com",
      description: "Two floors of coworking in Rochester.",
    });
  });
});
