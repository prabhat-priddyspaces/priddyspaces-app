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

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load space")));

    const { getByText } = render(<OwnerSpaceEditScreen />);

    await waitFor(() => expect(getByText("Failed to load space")).toBeTruthy());
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
