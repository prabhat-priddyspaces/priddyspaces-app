import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerSpaceMediaScreen } from "../src/screens/owner/OwnerSpaceMediaScreen";
import { OwnerLocationRoomsScreen } from "../src/screens/owner/OwnerLocationRoomsScreen";
import { apiFetch } from "../src/lib/api";
import * as ImagePicker from "expo-image-picker";

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

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const space = { public_id: "space_1", space_type: "conference_room" };
const existingImage = {
  public_id: "img_1",
  image_url: "https://cdn.example.com/img_1.jpg",
  is_primary: true,
  sort_order: 0,
};
const presign = {
  upload_url: "https://storage.example.com/upload",
  key: "media/space_1/photo.jpg",
  public_url: "https://cdn.example.com/photo.jpg",
  max_bytes: 10485760,
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/spaces/space_1" && method === "GET") return Promise.resolve(space);
    if (path === "/api/spaces/space_1/media" && method === "GET") return Promise.resolve([existingImage]);
    if (path === "/api/media/presign" && method === "POST") return Promise.resolve(presign);
    if (path === "/api/media" && method === "POST") return Promise.resolve({});
    return Promise.resolve([]);
  });
}

function mockPicker(asset: Record<string, unknown> | null) {
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue(
    asset ? { canceled: false, assets: [asset] } : { canceled: true, assets: [] },
  );
}

describe("OwnerSpaceMediaScreen", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockNavigate.mockClear();
    mockRouteParams = { spaceId: "space_1" };
    (apiFetch as jest.Mock).mockReset();
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockReset();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockReset();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("lists existing photos with primary and sort order", async () => {
    mockApi();
    const { getByText } = render(<OwnerSpaceMediaScreen />);

    await waitFor(() => expect(getByText("Sort order 0 • Primary")).toBeTruthy());
  });

  it("uploads a picked image through the presign flow", async () => {
    mockApi();
    mockPicker({
      uri: "file:///tmp/photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 2048,
    });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === "file:///tmp/photo.jpg") {
        return Promise.resolve({ blob: () => Promise.resolve({ size: 2048 }) });
      }
      if (url === presign.upload_url) {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { getByLabelText, getByText } = render(<OwnerSpaceMediaScreen />);

    await waitFor(() => expect(getByText("Sort order 0 • Primary")).toBeTruthy());
    fireEvent.press(getByLabelText("Choose image"));
    await waitFor(() => expect(getByText("photo.jpg")).toBeTruthy());

    fireEvent.changeText(getByLabelText("Sort order"), "2");
    fireEvent.press(getByLabelText("Upload photo"));

    await waitFor(() => expect(getByText("Photo uploaded")).toBeTruthy());
    const presignCall = (apiFetch as jest.Mock).mock.calls.find(([path]) => path === "/api/media/presign");
    expect(JSON.parse(presignCall[1].body)).toEqual({
      filename: "photo.jpg",
      content_type: "image/jpeg",
      size_bytes: 2048,
      space_public_id: "space_1",
    });
    const putCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === presign.upload_url);
    expect(putCall[1]).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/jpeg" } });
    const mediaCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/media" && options?.method === "POST",
    );
    expect(JSON.parse(mediaCall[1].body)).toEqual({
      space_public_id: "space_1",
      storage_key: presign.key,
      image_url: presign.public_url,
      is_primary: false,
      sort_order: 2,
    });
  });

  it("requires photo library permission", async () => {
    mockApi();
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    const { getByLabelText, getByText } = render(<OwnerSpaceMediaScreen />);

    await waitFor(() => expect(getByLabelText("Choose image")).toBeTruthy());
    fireEvent.press(getByLabelText("Choose image"));

    await waitFor(() =>
      expect(getByText("Allow photo library access to upload space photos.")).toBeTruthy(),
    );
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("rejects images over 10 MB without presigning", async () => {
    mockApi();
    mockPicker({
      uri: "file:///tmp/huge.jpg",
      fileName: "huge.jpg",
      mimeType: "image/jpeg",
      fileSize: 11 * 1024 * 1024,
    });

    const { getByLabelText, getByText } = render(<OwnerSpaceMediaScreen />);

    await waitFor(() => expect(getByLabelText("Choose image")).toBeTruthy());
    fireEvent.press(getByLabelText("Choose image"));
    await waitFor(() => expect(getByText("huge.jpg")).toBeTruthy());
    fireEvent.press(getByLabelText("Upload photo"));

    await waitFor(() => expect(getByText("Image must be 10 MB or smaller.")).toBeTruthy());
    expect(
      (apiFetch as jest.Mock).mock.calls.filter(([path]) => path === "/api/media/presign").length,
    ).toBe(0);
  });
});

describe("OwnerLocationRoomsScreen photos entry point", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRouteParams = { locationId: "loc_1", name: "Rochester Hub" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("opens the photo manager from a room card", async () => {
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
    fireEvent.press(getByLabelText("Photos for Board Room"));
    expect(mockNavigate).toHaveBeenCalledWith("OwnerSpaceMedia", {
      spaceId: "space_1",
      name: "Board Room",
    });
  });
});
