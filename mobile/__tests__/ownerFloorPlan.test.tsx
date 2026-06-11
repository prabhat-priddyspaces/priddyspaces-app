import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerFloorPlanScreen } from "../src/screens/owner/OwnerFloorPlanScreen";
import { apiFetch } from "../src/lib/api";
import * as ImagePicker from "expo-image-picker";

let mockRouteParams: Record<string, unknown> = {};

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const plan = { public_id: "fp_1", image_url: "https://cdn.example.com/plan.png", version: 2 };
const marker = {
  public_id: "mk_1",
  space_id: 7,
  x_coordinate: 10,
  y_coordinate: 20,
  width: 30,
  height: 40,
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/locations/loc_1/floor-plans") return Promise.resolve([plan]);
    if (path === "/api/floor-plans/fp_1/markers") return Promise.resolve([marker]);
    if (path === "/api/floor-plan-markers" && method === "POST") {
      return Promise.resolve({ ...marker, public_id: "mk_2" });
    }
    if (path === "/api/floor-plans/presign" && method === "POST") {
      return Promise.resolve({
        upload_url: "https://storage.example.com/upload",
        key: "plans/loc_1/v3.png",
        public_url: "https://cdn.example.com/v3.png",
        max_bytes: 10485760,
      });
    }
    if (path === "/api/floor-plans" && method === "POST") return Promise.resolve({});
    return Promise.resolve([]);
  });
}

describe("OwnerFloorPlanScreen", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockRouteParams = { locationId: "loc_1", name: "Rochester Hub" };
    (apiFetch as jest.Mock).mockReset();
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockReset();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("lists plans and markers and creates a marker with web's payload", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerFloorPlanScreen />);

    await waitFor(() => expect(getByLabelText("Plan version 2")).toBeTruthy());
    await waitFor(() => expect(getByText("Space ID: 7")).toBeTruthy());

    fireEvent.changeText(getByLabelText("Space public id"), "space_1");
    fireEvent.changeText(getByLabelText("Marker X"), "15");
    fireEvent.changeText(getByLabelText("Marker Y"), "25");
    fireEvent.press(getByLabelText("Save marker"));

    await waitFor(() => expect(getByText("Marker created")).toBeTruthy());
    const postCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/floor-plan-markers" && options?.method === "POST",
    );
    expect(JSON.parse(postCall[1].body)).toEqual({
      floor_plan_public_id: "fp_1",
      space_public_id: "space_1",
      x_coordinate: 15,
      y_coordinate: 25,
      width: 10,
      height: 10,
    });
  });

  it("uploads a floor plan through the presign flow", async () => {
    mockApi();
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/plan.png", fileName: "plan.png", mimeType: "image/png", fileSize: 2048 }],
    });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === "file:///tmp/plan.png") {
        return Promise.resolve({ blob: () => Promise.resolve({ size: 2048 }) });
      }
      if (url === "https://storage.example.com/upload") return Promise.resolve({ ok: true });
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { getByLabelText, getByText } = render(<OwnerFloorPlanScreen />);

    await waitFor(() => expect(getByLabelText("Upload floor plan")).toBeTruthy());
    fireEvent.press(getByLabelText("Upload floor plan"));

    await waitFor(() => expect(getByText("Floor plan uploaded")).toBeTruthy());
    const presignCall = (apiFetch as jest.Mock).mock.calls.find(([path]) => path === "/api/floor-plans/presign");
    expect(JSON.parse(presignCall[1].body)).toEqual({
      filename: "plan.png",
      content_type: "image/png",
      size_bytes: 2048,
      location_public_id: "loc_1",
    });
    const registerCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/floor-plans" && options?.method === "POST",
    );
    expect(JSON.parse(registerCall[1].body)).toEqual({
      location_public_id: "loc_1",
      image_url: "https://cdn.example.com/v3.png",
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation(() => Promise.reject(new Error("Failed to load plans")));

    const { getByText } = render(<OwnerFloorPlanScreen />);

    await waitFor(() => expect(getByText("Failed to load plans")).toBeTruthy());
  });
});
