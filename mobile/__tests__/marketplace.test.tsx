import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { HomeScreen } from "../src/screens/HomeScreen";
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

const rochester = {
  location_public_id: "loc_1",
  name: "Rochester Hub",
  address: "104 New York St",
  city: "Rochester",
  state: "NY",
  neighborhood: null,
  featured_image_url: null,
  location_amenities: ["Wifi", "Coffee"],
  matching_space_count: 3,
  starting_day_pass_price: "25",
  starting_monthly_price: null,
  starting_hourly_price: 12.5,
  starting_membership_price: null,
  distance_miles: 1.234,
};

function lastLocationsCall(): string {
  const calls = (apiFetch as jest.Mock).mock.calls.filter(([path]) =>
    String(path).startsWith("/api/marketplace/locations?"),
  );
  return calls[calls.length - 1][0];
}

describe("HomeScreen marketplace browser", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (apiFetch as jest.Mock).mockReset();
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path.startsWith("/api/marketplace/locations")) {
        return Promise.resolve({ meta: { total_results: 1 }, results: [rochester] });
      }
      return Promise.resolve([]);
    });
  });

  it("auto-loads coworking locations and opens a location", async () => {
    const { getByText, getByLabelText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText("Rochester Hub")).toBeTruthy());
    const url = new URL(`http://x${lastLocationsCall().replace("/api/marketplace/locations", "/p")}`);
    expect(url.searchParams.get("category")).toBe("coworking");

    expect(getByText("3 matching spaces • 1.2 mi")).toBeTruthy();
    expect(getByText("Day pass from $25 • Hourly from $12.50")).toBeTruthy();
    expect(getByText("Wifi • Coffee")).toBeTruthy();

    fireEvent.press(getByLabelText("Open location Rochester Hub"));
    expect(mockNavigate).toHaveBeenCalledWith("LocationSpaces", {
      locationId: "loc_1",
      name: "Rochester Hub",
    });
  });

  it("re-queries when switching category", async () => {
    const { getByText, getByLabelText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText("Rochester Hub")).toBeTruthy());
    fireEvent.press(getByLabelText("Category Private offices"));

    await waitFor(() =>
      expect(lastLocationsCall()).toContain("category=private_office"),
    );
  });

  it("sends web-parity filter params on search", async () => {
    const { getByText, getByLabelText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText("Rochester Hub")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Search query"), "Park Ave");
    fireEvent.changeText(getByLabelText("Date"), "2026-07-01");
    fireEvent.changeText(getByLabelText("Start time"), "09:00");
    fireEvent.changeText(getByLabelText("End time"), "12:00");
    fireEvent.changeText(getByLabelText("Capacity"), "6");
    fireEvent.changeText(getByLabelText("Max price"), "100");
    fireEvent.press(getByLabelText("Sort Lowest price"));
    fireEvent.press(getByLabelText("Search locations"));

    await waitFor(() => {
      const url = new URL(`http://x${lastLocationsCall().replace("/api/marketplace/locations", "/p")}`);
      expect(url.searchParams.get("q")).toBe("Park Ave");
      expect(url.searchParams.get("date")).toBe("2026-07-01");
      expect(url.searchParams.get("start_time")).toBe("09:00");
      expect(url.searchParams.get("end_time")).toBe("12:00");
      expect(url.searchParams.get("capacity")).toBe("6");
      expect(url.searchParams.get("max_price")).toBe("100");
      expect(url.searchParams.get("sort")).toBe("price_asc");
    });
  });

  it("drops q in favor of lat/lng radius like web", async () => {
    const { getByText, getByLabelText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText("Rochester Hub")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Search query"), "Rochester");
    fireEvent.changeText(getByLabelText("Latitude"), "43.16");
    fireEvent.changeText(getByLabelText("Longitude"), "-77.61");
    fireEvent.changeText(getByLabelText("Radius miles"), "10");
    fireEvent.press(getByLabelText("Search locations"));

    await waitFor(() => {
      const url = new URL(`http://x${lastLocationsCall().replace("/api/marketplace/locations", "/p")}`);
      expect(url.searchParams.get("q")).toBeNull();
      expect(url.searchParams.get("lat")).toBe("43.16");
      expect(url.searchParams.get("lng")).toBe("-77.61");
      expect(url.searchParams.get("radius_miles")).toBe("10");
    });
  });

  it("shows an error and empty state when the search fails", async () => {
    (apiFetch as jest.Mock).mockImplementation(() =>
      Promise.reject(new Error("Marketplace unavailable")),
    );

    const { getByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText("Marketplace unavailable")).toBeTruthy());
    expect(getByText("No locations match these filters.")).toBeTruthy();
  });
});
