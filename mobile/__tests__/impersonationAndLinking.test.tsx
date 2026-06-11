import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { ImpersonationBanner } from "../src/components/ImpersonationBanner";
import { linking } from "../src/navigation/linking";
import { apiFetch } from "../src/lib/api";

const mockRefreshMe = jest.fn();
let mockMe: Record<string, unknown> | null = null;

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token", me: mockMe, refreshMe: mockRefreshMe }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

describe("ImpersonationBanner", () => {
  beforeEach(() => {
    mockRefreshMe.mockReset();
    (apiFetch as jest.Mock).mockReset();
  });

  it("renders nothing when not impersonating", () => {
    mockMe = { impersonation: { is_impersonating: false } };
    const { toJSON } = render(<ImpersonationBanner />);
    expect(toJSON()).toBeNull();
  });

  it("shows context and stops impersonation like web", async () => {
    mockMe = {
      impersonation: {
        is_impersonating: true,
        target_email: "customer@test.com",
        actor_email: "admin@test.com",
        reason: "Support ticket 42",
      },
    };
    (apiFetch as jest.Mock).mockResolvedValue({});

    const { getByText, getByLabelText } = render(<ImpersonationBanner />);

    expect(
      getByText("Impersonating customer@test.com as admin@test.com. Reason: Support ticket 42"),
    ).toBeTruthy();

    fireEvent.press(getByLabelText("Stop impersonating"));
    await waitFor(() => expect(mockRefreshMe).toHaveBeenCalled());
    expect(
      (apiFetch as jest.Mock).mock.calls.some(
        ([path, options]) => path === "/api/admin/impersonation/stop" && options?.method === "POST",
      ),
    ).toBe(true);
  });
});

describe("deep linking config", () => {
  it("maps the priddyspaces scheme to key screens", () => {
    expect(linking.prefixes).toEqual(["priddyspaces://"]);
    const screens = linking.config.screens.Main.screens as Record<string, string>;
    expect(screens.BookingDetail).toBe("booking/:bookingId");
    expect(screens.Notifications).toBe("notifications");
    expect(screens.OwnerCalendar).toBe("owner/calendar");
  });
});
