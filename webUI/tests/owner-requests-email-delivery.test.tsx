import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OwnerRequestsPage from "../app/owner/requests/page";

const { apiFetchMock, getApiTokenMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  getApiTokenMock: vi.fn(),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useApiToken", () => ({
  useApiToken: () => ({
    getApiToken: getApiTokenMock,
    isAuthReady: true,
  }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

const failedRequest = {
  public_id: "req_1",
  booking_id: null,
  booking_public_id: null,
  start_datetime: "2026-06-01T14:00:00Z",
  end_datetime: "2026-06-01T16:00:00Z",
  status: "requested",
  payment_status: null,
  payment_provider: null,
  cancellation_deadline_at: null,
  estimated_amount: 120,
  operator_notes: null,
  failure_reason: null,
  is_guest_checkout: true,
  guest_email: "customer11@mailinator.com",
  guest_full_name: "Customer Eleven",
  guest_phone: null,
  guest_company_name: null,
  guest_notes: null,
  email_delivery_summary: [
    {
      notification_type: "request_submitted",
      label: "Request submitted",
      status: "failed",
      attempt_count: 1,
      recipient_count: 1,
      failed_count: 1,
      last_attempt_at: "2026-05-14T10:00:00Z",
      last_error: "Email provider is not configured",
      recipients: ["customer11@mailinator.com"],
    },
  ],
};

describe("OwnerRequestsPage email delivery", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    getApiTokenMock.mockReset();
    getApiTokenMock.mockResolvedValue("token");
    apiFetchMock.mockImplementation((url: string) => {
      if (url === "/api/booking-requests") {
        return Promise.resolve([failedRequest]);
      }
      if (url === "/api/booking-waitlist") {
        return Promise.resolve([]);
      }
      if (url === "/api/booking-requests/req_1/emails/resend") {
        return Promise.resolve([]);
      }
      return Promise.resolve(null);
    });
  });

  it("renders failed booking email status and resends the selected notification", async () => {
    render(<OwnerRequestsPage />);

    expect(await screen.findByText("Request submitted")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getAllByText("customer11@mailinator.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Email provider is not configured")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resend/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/booking-requests/req_1/emails/resend",
        {
          method: "POST",
          body: JSON.stringify({ notification_type: "request_submitted" }),
        },
        "token"
      );
    });
  });
});
