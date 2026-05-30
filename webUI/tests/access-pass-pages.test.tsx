import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccessScannerPage,
  AttendancePage,
  GuestAccessPassPage,
  MemberAccessPassesPage,
  MemberDirectoryPage,
} from "../components/access-passes/access-pass-pages";

vi.mock("../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../hooks/useApiToken", () => ({
  useApiToken: () => ({
    getApiToken: mocks.getApiToken,
    isAuthReady: true,
  }),
}));

const accessPass = {
  public_id: "pass_1",
  booking_public_id: "book_1",
  booking_request_public_id: "req_1",
  qr_payload: "https://app.example.com/guest/access-pass#secure-token",
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

const resolvedPass = {
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

const checkedInPass = {
  ...resolvedPass,
  pass_status: "already_checked_in",
  can_check_in: false,
  can_check_out: true,
  checked_in_at: "2026-07-01T10:05:00Z",
};

const attendanceRow = {
  public_id: "attendance_1",
  booking_public_id: "book_1",
  access_pass_public_id: "pass_1",
  member_public_id: "user_1",
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

const mocks = vi.hoisted(() => ({
  getApiToken: vi.fn(async () => "token"),
  listAccessPasses: vi.fn(),
  resolveAccessPass: vi.fn(),
  checkInAccessPass: vi.fn(),
  listAttendance: vi.fn(),
  listAttendanceLocations: vi.fn(),
  listCurrentAttendance: vi.fn(),
  listMemberDirectory: vi.fn(),
  resolveGuestAccessPass: vi.fn(),
}));

vi.mock("../lib/access-passes", async () => {
  const actual = await vi.importActual<typeof import("../lib/access-passes")>("../lib/access-passes");
  return {
    ...actual,
    listAccessPasses: mocks.listAccessPasses,
    resolveAccessPass: mocks.resolveAccessPass,
    checkInAccessPass: mocks.checkInAccessPass,
    checkOutAccessPass: vi.fn(),
    listAttendance: mocks.listAttendance,
    listAttendanceLocations: mocks.listAttendanceLocations,
    listCurrentAttendance: mocks.listCurrentAttendance,
    listMemberDirectory: mocks.listMemberDirectory,
    resolveGuestAccessPass: mocks.resolveGuestAccessPass,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAccessPasses.mockResolvedValue([accessPass]);
  mocks.resolveAccessPass.mockResolvedValue(resolvedPass);
  mocks.checkInAccessPass.mockResolvedValue(checkedInPass);
  mocks.listAttendance.mockResolvedValue({ results: [attendanceRow], total: 1, page: 1, page_size: 100 });
  mocks.listAttendanceLocations.mockResolvedValue([{ location_public_id: "loc_1", location_name: "Main" }]);
  mocks.listCurrentAttendance.mockResolvedValue([attendanceRow]);
  mocks.resolveGuestAccessPass.mockResolvedValue(accessPass);
  mocks.listMemberDirectory.mockResolvedValue([
    {
      member_public_id: "user_2",
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
});

describe("member access pass screens", () => {
  it("renders pass QR and booking details", async () => {
    render(<MemberAccessPassesPage />);

    expect(await screen.findByText("Conference Room 2")).toBeInTheDocument();
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByTestId("access-pass-qr")).toBeInTheDocument();
  });

  it("renders a helpful empty state", async () => {
    mocks.listAccessPasses.mockResolvedValue([]);
    render(<MemberAccessPassesPage />);

    expect(await screen.findByText("No valid access passes")).toBeInTheDocument();
  });
});

describe("scanner screen", () => {
  it("resolves a token and submits check-in", async () => {
    render(<AccessScannerPage shell="owner" />);

    fireEvent.change(screen.getByPlaceholderText("Paste QR URL or token"), {
      target: { value: "https://app.example.com/guest/access-pass#secure-token" },
    });
    fireEvent.click(screen.getByText("Resolve"));

    expect((await screen.findAllByText("Member One")).length).toBeGreaterThan(0);
    expect(mocks.resolveAccessPass).toHaveBeenCalledWith("secure-token", "token");

    fireEvent.click(screen.getByText("Check in"));
    await waitFor(() => expect(mocks.checkInAccessPass).toHaveBeenCalledWith("secure-token", "token"));
    expect(await screen.findByText("Already Checked In")).toBeInTheDocument();
  });
});

describe("attendance screen", () => {
  it("passes filters to the attendance API", async () => {
    render(<AttendancePage shell="owner" />);

    expect(await screen.findByText("Member One")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Member search"), { target: { value: "member@example.com" } });

    await waitFor(() => {
      expect(mocks.listAttendance).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "member@example.com" }),
        "token",
      );
    });
  });
});

describe("member directory screen", () => {
  it("renders same-location directory rows returned by the API", async () => {
    render(<MemberDirectoryPage />);

    expect(await screen.findByText("Peer Member")).toBeInTheDocument();
    expect(screen.getByText("peer@example.com")).toBeInTheDocument();
    expect(screen.queryByText("member@example.com")).not.toBeInTheDocument();
  });
});

describe("guest access pass screen", () => {
  it("does not render a QR for expired or cancelled guest passes", async () => {
    mocks.resolveGuestAccessPass.mockResolvedValue({ ...accessPass, pass_status: "expired" });
    window.history.pushState({}, "", "/guest/access-pass#secure-token");

    render(<GuestAccessPassPage />);

    expect((await screen.findAllByText("Expired")).length).toBeGreaterThan(0);
    expect(screen.getByText("This access pass can no longer be used at reception.")).toBeInTheDocument();
    expect(screen.queryByTestId("access-pass-qr")).not.toBeInTheDocument();
  });
});
