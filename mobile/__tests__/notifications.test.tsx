import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { NotificationsScreen } from "../src/screens/NotificationsScreen";
import {
  getNotificationPreferences,
  listNotifications,
  registerExpoPushToken,
  updateNotificationPreferences,
} from "../src/lib/notifications";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    token: "token",
    me: { role: "member", platform_role: null },
  }),
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: "ExponentPushToken[test]" })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("../src/lib/notifications", () => {
  const actual = jest.requireActual("../src/lib/notifications");
  return {
    ...actual,
    listNotifications: jest.fn(),
    getNotificationPreferences: jest.fn(),
    updateNotificationPreferences: jest.fn(),
    registerExpoPushToken: jest.fn(),
    markNotificationRead: jest.fn(() => Promise.resolve({ status: "ok" })),
  };
});

describe("NotificationsScreen", () => {
  beforeEach(() => {
    (listNotifications as jest.Mock).mockResolvedValue({
      results: [
        {
          public_id: "note_1",
          audience: "member",
          reminder_type: "booking_start",
          title: "Your booking starts soon",
          body: "Board Room starts in 10 minutes.",
          link_url: null,
          is_read: false,
          read_at: null,
          push_status: "sent",
          push_error: null,
          created_at: "2026-05-30T10:00:00Z",
        },
      ],
      total: 1,
      unread_count: 1,
      page: 1,
      page_size: 25,
    });
    (getNotificationPreferences as jest.Mock).mockResolvedValue({
      booking_start_push_enabled: true,
      booking_end_push_enabled: true,
    });
    (updateNotificationPreferences as jest.Mock).mockResolvedValue({
      booking_start_push_enabled: true,
      booking_end_push_enabled: false,
    });
    (registerExpoPushToken as jest.Mock).mockResolvedValue({
      status: "granted",
      message: "Booking reminders are enabled on this device.",
    });
  });

  it("renders notification history and updates member preferences", async () => {
    const screen = render(<NotificationsScreen />);

    expect(await screen.findByText("Your booking starts soon")).toBeTruthy();
    fireEvent(screen.getByTestId("booking-end-push-toggle"), "valueChange", false);

    await waitFor(() => {
      expect(updateNotificationPreferences).toHaveBeenCalledWith({ booking_end_push_enabled: false }, "token");
    });
  });

  it("requests push registration from the enable button", async () => {
    const screen = render(<NotificationsScreen />);

    fireEvent.press(await screen.findByText("Enable push"));

    await waitFor(() => {
      expect(registerExpoPushToken).toHaveBeenCalledWith("token", true);
    });
  });
});
