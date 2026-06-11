import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { LocationSpacesScreen } from "../src/screens/member/LocationSpacesScreen";
import { apiFetch } from "../src/lib/api";

const mockNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const location = {
  public_id: "loc_1",
  name: "Rochester Hub",
  address: "104 New York St",
  city: "Rochester",
};

const spaces = [
  {
    public_id: "space_1",
    space_type: "conference_room",
    capacity: 8,
    price_daily: "300",
    price_monthly: null,
    availability_status: "available",
    availability_start_time: "08:00",
    availability_end_time: "18:00",
  },
  {
    public_id: "space_2",
    space_type: "private_office",
    capacity: 4,
    price_daily: null,
    price_monthly: 1200,
    availability_status: "available",
    availability_start_time: null,
    availability_end_time: null,
  },
];

describe("LocationSpacesScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRouteParams = { locationId: "loc_1", name: "Rochester Hub" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("shows the location header with address, prices, and hours like web", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/locations/loc_1") return Promise.resolve(location);
      if (path === "/api/locations/loc_1/spaces") return Promise.resolve(spaces);
      return Promise.resolve([]);
    });

    const { getByText } = render(<LocationSpacesScreen />);

    await waitFor(() => expect(getByText("104 New York St, Rochester")).toBeTruthy());
    expect(getByText("Capacity 8 • available")).toBeTruthy();
    expect(getByText("Hours: 08:00 to 18:00")).toBeTruthy();
    expect(getByText("$300/day")).toBeTruthy();
    expect(getByText("$1200/mo")).toBeTruthy();

    fireEvent.press(getByText("conference_room"));
    expect(mockNavigate).toHaveBeenCalledWith("SpaceDetail", { spaceId: "space_1" });
  });

  it("still renders with the route-param name when the location fetch fails", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/locations/loc_1") return Promise.reject(new Error("not found"));
      if (path === "/api/locations/loc_1/spaces") return Promise.resolve(spaces);
      return Promise.resolve([]);
    });

    const { getByText } = render(<LocationSpacesScreen />);

    await waitFor(() => expect(getByText("conference_room")).toBeTruthy());
    expect(getByText("Rochester Hub")).toBeTruthy();
  });

  it("shows the empty state when the location has no spaces", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/locations/loc_1") return Promise.resolve(location);
      if (path === "/api/locations/loc_1/spaces") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const { getByText } = render(<LocationSpacesScreen />);

    await waitFor(() =>
      expect(getByText("No bookable spaces available at this location.")).toBeTruthy(),
    );
  });

  it("surfaces spaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/locations/loc_1") return Promise.resolve(location);
      if (path === "/api/locations/loc_1/spaces") return Promise.reject(new Error("Failed to load spaces"));
      return Promise.resolve([]);
    });

    const { getByText } = render(<LocationSpacesScreen />);

    await waitFor(() => expect(getByText("Failed to load spaces")).toBeTruthy());
  });
});
