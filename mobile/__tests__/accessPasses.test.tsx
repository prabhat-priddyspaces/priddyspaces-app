import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AccessPassesScreen } from "../src/screens/access/AccessPassesScreen";
import { MySpaceQrScreen } from "../src/screens/access/MySpaceQrScreen";
import { MemberDirectoryScreen } from "../src/screens/access/MemberDirectoryScreen";
import { AccessScannerScreen } from "../src/screens/access/AccessScannerScreen";
import { AttendanceScreen } from "../src/screens/access/AttendanceScreen";
import {
  checkInAccessPass,
  listAccessPasses,
  listAttendance,
  listAttendanceLocations,
  listCurrentAttendance,
  listMemberDirectory,
  resolveAccessPass,
} from "../src/lib/accessPasses";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token", me: { role: "member", platform_role: null } }),
}));

jest.mock("react-native-qrcode-svg", () => "QRCode");

const mockRequestPermission = jest.fn();
jest.mock("expo-camera", () => {
  const React = require("react");
  const { Text, TouchableOpacity } = require("react-native");
  return {
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned?: (event: { data: string; type: string }) => void }) => (
      <TouchableOpacity testID="mock-camera" onPress={() => onBarcodeScanned?.({ data: "https://app.test/guest/access-pass#scan-token", type: "qr" })}>
        <Text>Mock camera</Text>
      </TouchableOpacity>
    ),
    useCameraPermissions: () => [{ granted: false }, mockRequestPermission],
  };
});

jest.mock("../src/lib/accessPasses", () => {
  const actual = jest.requireActual("../src/lib/accessPasses");
  return {
    ...actual,
    listAccessPasses: jest.fn(),
    listMemberDirectory: jest.fn(),
    resolveAccessPass: jest.fn(),
    checkInAccessPass: jest.fn(),
    checkOutAccessPass: jest.fn(),
    listAttendance: jest.fn(),
    listAttendanceLocations: jest.fn(),
    listCurrentAttendance: jest.fn(),
  };
});

const pass = {
  public_id: "pass_1",
  booking_public_id: "book_1",
  booking_request_public_id: "req_1",
  qr_payload: "https://app.test/guest/access-pass#token",
  status: "active",
  pass_status: "not_yet_valid",
  valid_from_at: "2026-07-01T10:00:00Z",
  expires_at: "2026-07-01T12:00:00Z",
  checked_in_at: null,
  checked_out_at: null,
  member_name: "Member One",
  member_email: "member@example.com",
  location_public_id: "loc_1",
  location_name: "Main",
  space_public_id: "space_1",
  space_name: "Conference Room 2",
  space_type: "conference_room",
  start_datetime: "2026-07-01T10:00:00Z",
  end_datetime: "2026-07-01T12:00:00Z",
};

const resolved = {
  public_id: "pass_1",
  booking_public_id: "book_1",
  booking_request_public_id: "req_1",
  member_name: "Member One",
  member_email: "member@example.com",
  location_public_id: "loc_1",
  location_name: "Main",
  space_public_id: "space_1",
  space_name: "Conference Room 2",
  space_type: "conference_room",
  start_datetime: "2026-07-01T10:00:00Z",
  end_datetime: "2026-07-01T12:00:00Z",
  checked_in_at: null,
  checked_out_at: null,
  pass_status: "valid",
  can_check_in: true,
  can_check_out: false,
  message: null,
};

const attendance = {
  public_id: "attendance_1",
  booking_public_id: "book_1",
  access_pass_public_id: "pass_1",
  member_public_id: "member_1",
  member_name: "Member One",
  member_email: "member@example.com",
  scanned_by_public_id: "owner_1",
  scanned_by_name: "Owner One",
  location_public_id: "loc_1",
  location_name: "Main",
  space_public_id: "space_1",
  space_name: "Conference Room 2",
  space_type: "conference_room",
  start_datetime: "2026-07-01T10:00:00Z",
  end_datetime: "2026-07-01T12:00:00Z",
  checked_in_at: "2026-07-01T10:05:00Z",
  checked_out_at: null,
  status: "checked_in",
  event_type: "check_in",
  event_at: "2026-07-01T10:05:00Z",
};

describe("mobile access pass screens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestPermission.mockResolvedValue({ granted: true });
    (listAccessPasses as jest.Mock).mockResolvedValue([pass]);
    (listMemberDirectory as jest.Mock).mockResolvedValue([
      {
        member_public_id: "member_2",
        name: "Peer Member",
        email: "peer@example.com",
        location_public_id: "loc_1",
        location_name: "Main",
        space_public_id: "space_1",
        space_name: "Conference Room 2",
        space_type: "conference_room",
        last_seen_at: "2026-07-01T10:00:00Z",
      },
    ]);
    (resolveAccessPass as jest.Mock).mockResolvedValue(resolved);
    (checkInAccessPass as jest.Mock).mockResolvedValue({
      ...resolved,
      pass_status: "already_checked_in",
      can_check_in: false,
      can_check_out: true,
      checked_in_at: "2026-07-01T10:05:00Z",
    });
    (listAttendance as jest.Mock).mockResolvedValue({ results: [attendance], total: 1, page: 1, page_size: 100 });
    (listAttendanceLocations as jest.Mock).mockResolvedValue([{ location_public_id: "loc_1", location_name: "Main" }]);
    (listCurrentAttendance as jest.Mock).mockResolvedValue([attendance]);
  });

  it("renders populated and empty access pass states", async () => {
    const populated = render(<AccessPassesScreen />);
    expect(await populated.findByText("Conference Room 2")).toBeTruthy();
    expect(populated.getByTestId("mobile-access-pass-qr")).toBeTruthy();
    populated.unmount();

    (listAccessPasses as jest.Mock).mockResolvedValueOnce([]);
    const empty = render(<AccessPassesScreen />);
    expect(await empty.findByText("No valid access passes")).toBeTruthy();
  });

  it("renders My Space QR booking details", async () => {
    const screen = render(<MySpaceQrScreen />);
    expect(await screen.findByText("My Space QR")).toBeTruthy();
    expect(await screen.findByText("Conference Room 2")).toBeTruthy();
    expect(screen.getByText("book_1")).toBeTruthy();
  });

  it("renders same-location member directory rows", async () => {
    const screen = render(<MemberDirectoryScreen />);
    expect(await screen.findByText("Peer Member")).toBeTruthy();
    expect(screen.getByText("peer@example.com")).toBeTruthy();
    expect(screen.queryByText("member@example.com")).toBeNull();
  });

  it("requests camera permission, resolves scan, and prevents duplicate check-in", async () => {
    const screen = render(<AccessScannerScreen />);
    fireEvent.press(screen.getByText("Start camera"));

    await waitFor(() => expect(mockRequestPermission).toHaveBeenCalled());
    fireEvent.press(await screen.findByTestId("mock-camera"));

    await waitFor(() => expect(resolveAccessPass).toHaveBeenCalledWith("scan-token", "token"));
    expect(await screen.findByText("Member One")).toBeTruthy();

    fireEvent.press(screen.getByText("Check in"));
    await waitFor(() => expect(checkInAccessPass).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Already Checked In")).toBeTruthy();
    fireEvent.press(screen.getByText("Check in"));
    expect(checkInAccessPass).toHaveBeenCalledTimes(1);
  });

  it("sends attendance filter params to the API", async () => {
    const screen = render(<AttendanceScreen />);
    expect(await screen.findByText("Currently in office: 1")).toBeTruthy();
    expect((await screen.findAllByText("Member One")).length).toBeGreaterThan(0);
    fireEvent.changeText(screen.getByPlaceholderText("Member name or email"), "member@example.com");

    await waitFor(() => {
      expect(listAttendance).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "member@example.com" }),
        "token",
      );
    });
  });
});
