import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerAddSpaceScreen } from "../src/screens/owner/OwnerAddSpaceScreen";
import { OwnerLocationEditScreen } from "../src/screens/owner/OwnerLocationEditScreen";
import { OwnerLocationRoomsScreen } from "../src/screens/owner/OwnerLocationRoomsScreen";
import { OwnerLocationsScreen } from "../src/screens/owner/OwnerLocationsScreen";
import { OwnerNewLocationScreen } from "../src/screens/owner/OwnerNewLocationScreen";
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

const locations = [
  {
    public_id: "loc_1",
    organization_public_id: "org_1",
    name: "Rochester Hub",
    address: "104 New York",
    city: "Rochester",
    state: "NY",
    postal_code: "14604",
    timezone: "America/New_York",
    status: "active",
  },
  {
    public_id: "loc_2",
    organization_public_id: "org_1",
    name: "Buffalo Outpost",
    address: "200 Main",
    city: "Buffalo",
    state: "NY",
    postal_code: "14202",
    timezone: "America/New_York",
    status: "inactive",
  },
];

const spaces = [
  {
    public_id: "space_1",
    name: "Board Room",
    space_type: "conference_room",
    capacity: 8,
    price_hourly: "75",
    price_daily: "300",
    price_monthly: null,
    availability_status: "available",
    visibility: "public",
  },
  {
    public_id: "space_2",
    name: "Shared Desk",
    space_type: "shared_desk",
    capacity: 12,
    price_hourly: null,
    price_daily: "25",
    price_monthly: null,
    availability_status: "available",
    visibility: "public",
  },
];

function futureIso() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function pastIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

describe("owner location mobile screens", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockRouteParams = {};
    (apiFetch as jest.Mock).mockReset();
  });

  it("shows active/inactive cards, upcoming approved counts, filters, and real actions", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/locations") return Promise.resolve(locations);
      if (path === "/api/booking-requests?status=approved") {
        return Promise.resolve([
          { public_id: "req_1", location_public_id: "loc_1", end_datetime: futureIso() },
          { public_id: "req_2", location_public_id: "loc_1", end_datetime: futureIso() },
          { public_id: "req_3", location_public_id: "loc_2", end_datetime: pastIso() },
        ]);
      }
      if (path === "/api/locations/loc_1/spaces") return Promise.resolve([{}, {}, {}]);
      if (path === "/api/locations/loc_2/spaces") return Promise.resolve([{}]);
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText, getAllByText, queryByText } = render(<OwnerLocationsScreen />);

    await waitFor(() => expect(getByText("Rochester Hub")).toBeTruthy());
    await waitFor(() => expect(getByText("2")).toBeTruthy());

    expect(getAllByText("Active").length).toBeGreaterThan(0);
    expect(getAllByText("Inactive").length).toBeGreaterThan(0);
    expect(getAllByText("Upcoming approved").length).toBeGreaterThan(0);
    expect(queryByText("Live")).toBeNull();
    expect(queryByText("Occupancy")).toBeNull();
    expect(queryByText("Map view")).toBeNull();
    expect(queryByText("...")).toBeNull();

    fireEvent.press(getByLabelText("Filter status inactive"));
    expect(queryByText("Rochester Hub")).toBeNull();
    expect(getByText("Buffalo Outpost")).toBeTruthy();

    fireEvent.press(getByLabelText("Filter status all"));
    fireEvent.press(getByLabelText("Filter city Rochester"));
    expect(getByText("Rochester Hub")).toBeTruthy();
    expect(queryByText("Buffalo Outpost")).toBeNull();

    fireEvent.press(getByLabelText("Manage rooms for Rochester Hub"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerLocationRooms", { locationId: "loc_1", name: "Rochester Hub" });

    fireEvent.press(getByLabelText("Edit Rochester Hub"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerLocationEdit", { locationId: "loc_1" });

    fireEvent.press(getByLabelText("Add space for Rochester Hub"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerAddSpace", {
      locationId: "loc_1",
      locationName: "Rochester Hub",
    });

    fireEvent.press(getByLabelText("New location"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerNewLocation");
  });

  it("opens the manage rooms page for a location", async () => {
    mockRouteParams = { locationId: "loc_1", name: "Rochester Hub" };
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/locations/loc_1/spaces") return Promise.resolve(spaces);
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerLocationRoomsScreen />);

    await waitFor(() => expect(getByText("Board Room")).toBeTruthy());
    expect(getByText("Manage rooms")).toBeTruthy();
    expect(getByText("Conference Room - Capacity 8")).toBeTruthy();

    fireEvent.press(getByLabelText("Add space"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerAddSpace", {
      locationId: "loc_1",
      locationName: "Rochester Hub",
    });
  });

  it("updates a location and can mark it inactive", async () => {
    mockRouteParams = { locationId: "loc_1" };
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/locations/loc_1" && options?.method === "GET") return Promise.resolve(locations[0]);
      if (path === "/api/locations/loc_1" && options?.method === "PATCH") return Promise.resolve({ ...locations[0] });
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerLocationEditScreen />);

    await waitFor(() => expect(getByLabelText("Location name").props.value).toBe("Rochester Hub"));
    fireEvent.changeText(getByLabelText("Location name"), "Rochester Main");
    fireEvent.press(getByLabelText("Set location inactive"));
    fireEvent.press(getByText("Save changes"));

    await waitFor(() => expect(getByText("Location updated")).toBeTruthy());
    const patchCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/locations/loc_1" && options?.method === "PATCH",
    );
    expect(JSON.parse(patchCall[1].body)).toMatchObject({
      name: "Rochester Main",
      status: "inactive",
    });
  });

  it("creates a space for the selected location", async () => {
    mockRouteParams = { locationId: "loc_1", locationName: "Rochester Hub" };
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/spaces" && options?.method === "POST") return Promise.resolve({ public_id: "space_new" });
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerAddSpaceScreen />);

    fireEvent.changeText(getByLabelText("Space name"), "Board Room");
    fireEvent.changeText(getByLabelText("Capacity"), "8");
    fireEvent.changeText(getByLabelText("Hourly price"), "75");
    fireEvent.changeText(getByLabelText("Daily price"), "300");
    fireEvent.press(getByText("Create space"));

    await waitFor(() => expect(getByText("Space created")).toBeTruthy());
    const createCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/spaces" && options?.method === "POST",
    );
    expect(JSON.parse(createCall[1].body)).toMatchObject({
      location_public_id: "loc_1",
      name: "Board Room",
      space_type: "conference_room",
      capacity: 8,
      price_hourly: "75",
      price_daily: "300",
      visibility: "public",
    });
  });

  it("creates a new owner location", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      if (path === "/api/locations" && options?.method === "POST") return Promise.resolve({ public_id: "loc_new" });
      return Promise.resolve([]);
    });

    const { getByLabelText, getByText } = render(<OwnerNewLocationScreen />);

    await waitFor(() => expect(getByText("Priddyspaces")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Location name"), "New Rochester");
    fireEvent.changeText(getByLabelText("Address"), "101 Main St");
    fireEvent.changeText(getByLabelText("City"), "Rochester");
    fireEvent.press(getByText("Create location"));

    await waitFor(() => expect(getByText("Location created")).toBeTruthy());
    const createCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/locations" && options?.method === "POST",
    );
    expect(JSON.parse(createCall[1].body)).toMatchObject({
      organization_public_id: "org_1",
      name: "New Rochester",
      address: "101 Main St",
      city: "Rochester",
      timezone: "America/New_York",
    });
  });
});
