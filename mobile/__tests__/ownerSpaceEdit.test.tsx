import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerSpaceEditScreen } from "../src/screens/owner/OwnerSpaceEditScreen";
import { OwnerLocationRoomsScreen } from "../src/screens/owner/OwnerLocationRoomsScreen";
import { apiFetch } from "../src/lib/api";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const conferenceSpace = {
  public_id: "space_1",
  name: "Board Room",
  space_type: "conference_room",
  capacity: 8,
  price_monthly: null,
  price_daily: "300",
  price_hourly: "75",
  availability_status: "available",
  availability_start_time: "08:00",
  availability_end_time: "18:00",
  buffer_before_minutes: 10,
  buffer_after_minutes: 15,
  visibility: "public",
};

describe("OwnerSpaceEditScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockRouteParams = { spaceId: "space_1" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("prefills the form from the space and saves web-parity payload", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/spaces/space_1" && options?.method === "GET") {
        return Promise.resolve(conferenceSpace);
      }
      if (path === "/api/spaces/space_1" && options?.method === "PATCH") {
        return Promise.resolve({ ...conferenceSpace });
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerSpaceEditScreen />);

    await waitFor(() => expect(getByLabelText("Listing name").props.value).toBe("Board Room"));
    expect(getByLabelText("Capacity").props.value).toBe("8");
    expect(getByLabelText("Hourly price").props.value).toBe("75");
    expect(getByLabelText("Start time").props.value).toBe("08:00");
    expect(getByLabelText("Buffer before").props.value).toBe("10");

    fireEvent.changeText(getByLabelText("Listing name"), "Board Room A");
    fireEvent.changeText(getByLabelText("Hourly price"), "80");
    fireEvent.press(getByLabelText("Set availability Maintenance"));
    fireEvent.press(getByLabelText("Save changes"));

    await waitFor(() => expect(getByText("Space updated")).toBeTruthy());
    const patchCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/spaces/space_1" && options?.method === "PATCH",
    );
    expect(JSON.parse(patchCall[1].body)).toEqual({
      name: "Board Room A",
      space_type: "conference_room",
      capacity: 8,
      price_monthly: null,
      price_daily: "300",
      price_hourly: "80",
      availability_status: "maintenance",
      availability_start_time: "08:00",
      availability_end_time: "18:00",
      buffer_before_minutes: 10,
      buffer_after_minutes: 15,
      visibility: "public",
    });
  });

  it("blocks saving a conference room without required prices", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/spaces/space_1" && options?.method === "GET") {
        return Promise.resolve(conferenceSpace);
      }
      return Promise.resolve([]);
    });

    const { getByLabelText } = render(<OwnerSpaceEditScreen />);

    await waitFor(() => expect(getByLabelText("Hourly price").props.value).toBe("75"));
    fireEvent.changeText(getByLabelText("Hourly price"), "");
    expect(getByLabelText("Save changes").props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(getByLabelText("Save changes"));
    expect(
      (apiFetch as jest.Mock).mock.calls.filter(([, options]) => options?.method === "PATCH").length,
    ).toBe(0);
  });

  it("drops type-specific fields when switching to a suite", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/spaces/space_1" && options?.method === "GET") {
        return Promise.resolve(conferenceSpace);
      }
      if (path === "/api/spaces/space_1" && options?.method === "PATCH") {
        return Promise.resolve({});
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText, queryByLabelText } = render(<OwnerSpaceEditScreen />);

    await waitFor(() => expect(getByLabelText("Listing name").props.value).toBe("Board Room"));
    fireEvent.press(getByLabelText("Set space type Suite"));
    expect(queryByLabelText("Hourly price")).toBeNull();

    fireEvent.press(getByLabelText("Save changes"));
    await waitFor(() => expect(getByText("Space updated")).toBeTruthy());
    const patchCall = (apiFetch as jest.Mock).mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    );
    expect(JSON.parse(patchCall[1].body)).toMatchObject({
      space_type: "suite",
      price_hourly: null,
      price_daily: null,
      availability_start_time: null,
      buffer_before_minutes: 0,
    });
  });


  it("saves volume discount tiers and setup fees with web payloads", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      const method = options?.method || "GET";
      if (path === "/api/spaces/space_1" && method === "GET") return Promise.resolve(conferenceSpace);
      if (path === "/api/spaces/space_1/volume-discounts" && method === "GET") {
        return Promise.resolve([{ min_hours: 4, discount_percent: 10, is_active: true }]);
      }
      if (path === "/api/spaces/space_1/setup-fees" && method === "GET") {
        return Promise.resolve([
          { label: "Room setup", amount_cents: 7500, is_active: true, sort_order: 0 },
          { label: "Old fee", amount_cents: 100, is_active: false, sort_order: 1 },
        ]);
      }
      if (method === "PUT") return Promise.resolve({});
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerSpaceEditScreen />);

    await waitFor(() => expect(getByLabelText("Min hours 1").props.value).toBe("4"));
    fireEvent.changeText(getByLabelText("Discount % 1"), "15");
    fireEvent.press(getByLabelText("Save tiers"));
    await waitFor(() => expect(getByText("Tiers saved")).toBeTruthy());
    const tiersCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/spaces/space_1/volume-discounts" && options?.method === "PUT",
    );
    expect(JSON.parse(tiersCall[1].body)).toEqual({
      tiers: [{ min_hours: 4, discount_percent: 15, is_active: true }],
    });

    // Inactive fees are filtered out on load, like web.
    expect(getByLabelText("Line item 1").props.value).toBe("Room setup");
    fireEvent.press(getByLabelText("Add fee"));
    fireEvent.changeText(getByLabelText("Line item 2"), "Cleaning");
    fireEvent.changeText(getByLabelText("Amount $ 2"), "25.50");
    fireEvent.press(getByLabelText("Save setup fees"));
    await waitFor(() => expect(getByText("Setup fees saved")).toBeTruthy());
    const feesCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/spaces/space_1/setup-fees" && options?.method === "PUT",
    );
    expect(JSON.parse(feesCall[1].body)).toEqual({
      items: [
        { label: "Room setup", amount_cents: 7500, is_active: true, sort_order: 0 },
        { label: "Cleaning", amount_cents: 2550, is_active: true, sort_order: 1 },
      ],
    });
  });

  it("creates a lease term and enables the booking mode for the first plan", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      const method = options?.method || "GET";
      if (path === "/api/spaces/space_1" && method === "GET") {
        return Promise.resolve({ ...conferenceSpace, space_type: "private_office" });
      }
      if (path.startsWith("/api/membership-plans?") && method === "GET") return Promise.resolve([]);
      if (path === "/api/membership-plans" && method === "POST") {
        return Promise.resolve({ public_id: "plan_1" });
      }
      if (path === "/api/spaces/space_1/booking-modes" && method === "PUT") return Promise.resolve({});
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerSpaceEditScreen />);

    await waitFor(() => expect(getByText("Lease Terms")).toBeTruthy());
    fireEvent.press(getByLabelText("Add lease term"));
    fireEvent.changeText(getByLabelText("Term length (months, blank = month-to-month)"), "12");
    fireEvent.changeText(getByLabelText("Monthly price"), "1200");
    fireEvent.press(getByLabelText("Save lease term"));

    await waitFor(() => {
      const postCall = (apiFetch as jest.Mock).mock.calls.find(
        ([path, options]) => path === "/api/membership-plans" && options?.method === "POST",
      );
      expect(postCall).toBeTruthy();
      expect(JSON.parse(postCall[1].body)).toEqual({
        space_public_id: "space_1",
        booking_mode: "private_office_lease",
        name: "12-month Term",
        price_cents: 120000,
        billing_cycle: "monthly",
        commitment_months: 12,
        seats_per_plan: 8,
        max_active_subscriptions: null,
        is_active: true,
      });
    });
    expect(
      (apiFetch as jest.Mock).mock.calls.some(
        ([path, options]) => path === "/api/spaces/space_1/booking-modes" && options?.method === "PUT",
      ),
    ).toBe(true);
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load space")));

    const { getAllByText } = render(<OwnerSpaceEditScreen />);

    await waitFor(() => expect(getAllByText("Failed to load space").length).toBeGreaterThanOrEqual(1));
  });
});

describe("OwnerLocationRoomsScreen edit entry point", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRouteParams = { locationId: "loc_1", name: "Rochester Hub" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("opens the space editor from a room card", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/locations/loc_1/spaces") {
        return Promise.resolve([
          {
            public_id: "space_1",
            name: "Board Room",
            space_type: "conference_room",
            capacity: 8,
            availability_status: "available",
            visibility: "public",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerLocationRoomsScreen />);

    await waitFor(() => expect(getByText("Board Room")).toBeTruthy());
    fireEvent.press(getByLabelText("Edit Board Room"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerSpaceEdit", {
      spaceId: "space_1",
      name: "Board Room",
    });
  });
});
