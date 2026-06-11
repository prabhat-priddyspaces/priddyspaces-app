import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { MemberSubscriptionsScreen } from "../src/screens/member/MemberSubscriptionsScreen";
import { apiFetch } from "../src/lib/api";

const mockNavigate = jest.fn();

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const subscriptions = [
  {
    public_id: "sub_1",
    space_public_id: "space_1",
    space_type: "shared_desk",
    location_name: "Rochester Hub",
    status: "active",
    start_date: "2026-01-01",
    end_date: null,
  },
  {
    public_id: "sub_2",
    space_public_id: null,
    space_type: null,
    location_name: null,
    status: "past_due",
    start_date: "2026-02-01",
    end_date: "2026-12-31",
  },
  {
    public_id: "sub_3",
    space_public_id: "space_3",
    space_type: "private_office",
    location_name: "Buffalo Outpost",
    status: "canceling",
    start_date: "2026-03-01",
    end_date: null,
  },
];

describe("MemberSubscriptionsScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (apiFetch as jest.Mock).mockReset();
  });

  it("lists memberships with status stats and a past-due banner", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/subscriptions" && options?.method === "GET") {
        return Promise.resolve(subscriptions);
      }
      return Promise.resolve([]);
    });

    const { getByText, getByLabelText } = render(<MemberSubscriptionsScreen />);

    await waitFor(() => expect(getByText("Rochester Hub")).toBeTruthy());
    expect(getByText("Billing attention needed")).toBeTruthy();
    expect(getByText("shared_desk • active")).toBeTruthy();
    expect(getByText("Membership • past_due")).toBeTruthy();
    expect(getByText("private_office • canceling")).toBeTruthy();

    fireEvent.press(getByLabelText("Open payments"));
    expect(mockNavigate).toHaveBeenCalledWith("Payments");

    fireEvent.press(getByLabelText("Open membership space sub_1"));
    expect(mockNavigate).toHaveBeenCalledWith("App", {
      screen: "Marketplace",
      params: { screen: "SpaceDetail", params: { spaceId: "space_1" } },
    });
  });

  it("cancels a membership only after inline confirmation", async () => {
    let canceled = false;
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/subscriptions" && options?.method === "GET") {
        return Promise.resolve(
          canceled ? [{ ...subscriptions[0], status: "canceling" }] : [subscriptions[0]],
        );
      }
      if (path === "/api/subscriptions/sub_1/cancel" && options?.method === "POST") {
        canceled = true;
        return Promise.resolve({});
      }
      return Promise.resolve([]);
    });

    const { getByText, getByLabelText, queryByLabelText } = render(<MemberSubscriptionsScreen />);

    await waitFor(() => expect(getByLabelText("Cancel membership sub_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Cancel membership sub_1"));

    expect(getByText("Cancel this membership at the end of the current billing period?")).toBeTruthy();
    expect(
      (apiFetch as jest.Mock).mock.calls.filter(([path]) => String(path).includes("/cancel")).length,
    ).toBe(0);

    fireEvent.press(getByLabelText("Confirm cancel sub_1"));
    await waitFor(() => expect(getByText("Membership update saved.")).toBeTruthy());
    expect(
      (apiFetch as jest.Mock).mock.calls.some(
        ([path, options]) => path === "/api/subscriptions/sub_1/cancel" && options?.method === "POST",
      ),
    ).toBe(true);
    // After reload the membership is canceling, so the cancel button is gone.
    await waitFor(() => expect(queryByLabelText("Cancel membership sub_1")).toBeNull());
  });

  it("keeps the membership when confirmation is dismissed", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/subscriptions" && options?.method === "GET") {
        return Promise.resolve([subscriptions[0]]);
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, queryByText } = render(<MemberSubscriptionsScreen />);

    await waitFor(() => expect(getByLabelText("Cancel membership sub_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Cancel membership sub_1"));
    fireEvent.press(getByLabelText("Keep membership sub_1"));

    expect(queryByText("Cancel this membership at the end of the current billing period?")).toBeNull();
    expect(
      (apiFetch as jest.Mock).mock.calls.filter(([path]) => String(path).includes("/cancel")).length,
    ).toBe(0);
  });

  it("shows an empty state that links to the marketplace", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/subscriptions" && options?.method === "GET") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const { getByText, getByLabelText } = render(<MemberSubscriptionsScreen />);

    await waitFor(() => expect(getByText("No active workspace memberships yet.")).toBeTruthy());
    fireEvent.press(getByLabelText("Browse available spaces"));
    expect(mockNavigate).toHaveBeenCalledWith("App", { screen: "Marketplace" });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load memberships")));

    const { getByText } = render(<MemberSubscriptionsScreen />);

    await waitFor(() => expect(getByText("Failed to load memberships")).toBeTruthy());
  });
});
