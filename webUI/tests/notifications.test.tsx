import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationDrawer } from "../components/notifications/notification-drawer";
import { registerBrowserPush } from "../lib/notifications";

const apiFetch = vi.fn();

vi.mock("../lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: () => "token",
}));

describe("NotificationDrawer", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string) => {
      if (path === "/api/notifications") {
        return Promise.resolve({
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
      }
      if (path === "/api/notifications/note_1/read") {
        return Promise.resolve({ status: "ok" });
      }
      return Promise.resolve({ web_push_enabled: false, web_push_public_key: null, expo_push_enabled: true });
    });
  });

  it("renders notifications and marks an item read", async () => {
    const onUnread = vi.fn();
    render(<NotificationDrawer open onClose={() => {}} onUnreadCountChange={onUnread} />);

    expect(await screen.findByText("Your booking starts soon")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Board Room starts in 10 minutes."));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/notifications/note_1/read", { method: "PATCH" }, "token");
    });
    expect(onUnread).toHaveBeenCalledWith(0);
  });
});

describe("registerBrowserPush", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("registers a browser push subscription with the API", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/api/push/config") {
        return Promise.resolve({
          web_push_enabled: true,
          web_push_public_key: "BCVxSGVsbG8",
          expo_push_enabled: true,
        });
      }
      if (path === "/api/push-subscriptions") {
        return Promise.resolve({ public_id: "sub_1" });
      }
      return Promise.resolve({});
    });
    const subscription = { endpoint: "https://push.example/1", toJSON: () => ({ endpoint: "https://push.example/1" }) };
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { requestPermission: vi.fn(() => Promise.resolve("granted")) },
    });
    Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: vi.fn(() =>
          Promise.resolve({
            pushManager: {
              getSubscription: vi.fn(() => Promise.resolve(subscription)),
              subscribe: vi.fn(),
            },
          })
        ),
      },
    });

    const result = await registerBrowserPush("token");

    expect(result.status).toBe("granted");
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/push-subscriptions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("https://push.example/1"),
      }),
      "token"
    );
  });
});
