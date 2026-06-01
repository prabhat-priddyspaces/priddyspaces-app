import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewOwnerBookingPage from "../app/owner/bookings/new/page";
import { apiFetch } from "../lib/api";

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../components/app-shell", () => ({
  AppShell: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const locations = [
  {
    public_id: "loc_1",
    organization_public_id: "org_1",
    name: "Austin Hub",
    city: "Austin",
    timezone: "UTC",
  },
];

const organizations = [{ public_id: "org_1", name: "Owner Org" }];
const multiOrgOrganizations = [
  { public_id: "org_1", name: "Owner Org" },
  { public_id: "org_2", name: "Second Org" },
];

const spaces = [
  {
    public_id: "space_1",
    name: "Board Room",
    space_type: "conference_room",
    capacity: 6,
    price_hourly: 50,
    price_daily: 300,
    availability_start_time: "09:00:00",
    availability_end_time: "18:00:00",
  },
];

const secondOrgLocations = [
  {
    public_id: "loc_2",
    organization_public_id: "org_2",
    name: "Dallas Hub",
    city: "Dallas",
    timezone: "UTC",
  },
];

function mockApi() {
  vi.mocked(apiFetch).mockImplementation((path: string, options?: RequestInit) => {
    if (path === "/api/orgs") return Promise.resolve(organizations);
    if (path === "/api/locations?organization_public_id=org_1") return Promise.resolve(locations);
    if (path === "/api/locations/loc_1/spaces") return Promise.resolve(spaces);
    if (path.startsWith("/api/owner/spaces/space_1/availability")) {
      return Promise.resolve({
        space_public_id: "space_1",
        timezone: "UTC",
        granularity_minutes: 60,
        availability_start_time: "09:00:00",
        availability_end_time: "18:00:00",
        days: [{ date: "2026-07-15", busy_intervals: [] }],
      });
    }
    if (path === "/api/owner/members?organization_public_id=org_1&search=case") {
      return Promise.resolve([
        {
          user_public_id: "member_1",
          name: "Casey Customer",
          email: "casey@example.com",
          status: "active",
        },
      ]);
    }
    if (path === "/api/owner/bookings/preview") {
      return Promise.resolve({
        currency: "usd",
        base_amount_cents: 10000,
        discount_amount_cents: 0,
        tax_amount_cents: 0,
        total_amount_cents: 10000,
        original_total_amount_cents: null,
        override_applied: false,
        rate_basis: "hourly",
        units: 2,
        quantity: 1,
      });
    }
    if (path === "/api/owner/bookings") {
      const body = JSON.parse(String(options?.body || "{}"));
      return Promise.resolve({
        request_public_id: "req_1",
        booking_public_id: body.payment_collection_mode === "cash_collected" ? "booking_1" : null,
        status: body.payment_collection_mode === "cash_collected" ? "approved" : "requested",
        payment_status: body.payment_collection_mode === "cash_collected" ? "succeeded" : "payment_link_sent",
        payment_collection_mode: body.payment_collection_mode,
        member_public_id: body.member_public_id || "member_new",
        member_email: body.member?.email || "casey@example.com",
        member_name: body.member?.full_name || "Casey Customer",
        total_amount_cents: 10000,
        payment_link_url:
          body.payment_collection_mode === "payment_link"
            ? "http://localhost:3000/booking-payment/token"
            : null,
        payment_link_expires_at:
          body.payment_collection_mode === "payment_link" ? "2026-07-15T12:30:00.000Z" : null,
        registration_url: body.member ? "/sign-up?email=walkin@example.com" : null,
      });
    }
    return Promise.reject(new Error(`Unhandled API path: ${path}`));
  });
}

describe("NewOwnerBookingPage", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.mocked(apiFetch).mockReset();
    mockApi();
  });

  it("keeps submit disabled until member details are valid", async () => {
    render(<NewOwnerBookingPage />);

    await screen.findByText("Create booking");

    const submit = screen.getByTestId("owner-booking-submit-button");
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByTestId("owner-booking-member-new"));
    fireEvent.change(screen.getByTestId("owner-booking-new-name"), {
      target: { value: "Walk In" },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId("owner-booking-new-email"), {
      target: { value: "walkin@example.com" },
    });

    await waitFor(() => expect(submit).not.toBeDisabled());
  });

  it("supports member search and submits a cash booking for an existing member", async () => {
    render(<NewOwnerBookingPage />);

    await screen.findByText("Create booking");
    fireEvent.change(screen.getByTestId("owner-booking-date"), {
      target: { value: "2026-07-15" },
    });
    fireEvent.change(screen.getByTestId("owner-booking-member-search"), {
      target: { value: "case" },
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/owner/members?organization_public_id=org_1&search=case",
      { method: "GET" },
      "token",
    );
    fireEvent.click(await screen.findByTestId("owner-booking-member-option-member_1"));

    fireEvent.click(screen.getByTestId("owner-booking-preview-button"));
    await waitFor(() => expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByTestId("owner-booking-submit-button"));

    expect(await screen.findByText("Cash booking confirmed")).toBeInTheDocument();
    const createCall = vi
      .mocked(apiFetch)
      .mock.calls.find(([path]) => path === "/api/owner/bookings");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      member_public_id: "member_1",
      payment_collection_mode: "cash_collected",
    });
  });

  it("scopes locations and member search to the selected organization", async () => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve(multiOrgOrganizations);
      if (path === "/api/locations?organization_public_id=org_1") return Promise.resolve(locations);
      if (path === "/api/locations?organization_public_id=org_2") return Promise.resolve(secondOrgLocations);
      if (path === "/api/locations/loc_1/spaces" || path === "/api/locations/loc_2/spaces") {
        return Promise.resolve(spaces);
      }
      if (path.startsWith("/api/owner/spaces/space_1/availability")) {
        return Promise.resolve({
          space_public_id: "space_1",
          timezone: "UTC",
          granularity_minutes: 60,
          availability_start_time: "09:00:00",
          availability_end_time: "18:00:00",
          days: [{ date: "2026-07-15", busy_intervals: [] }],
        });
      }
      if (path === "/api/owner/members?organization_public_id=org_2&search=case") {
        return Promise.resolve([
          {
            user_public_id: "member_2",
            name: "Casey Dallas",
            email: "casey.dallas@example.com",
            status: "active",
          },
        ]);
      }
      return Promise.reject(new Error(`Unhandled API path: ${path}`));
    });

    render(<NewOwnerBookingPage />);

    const organizationSelect = await screen.findByTestId("owner-booking-organization");
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/locations?organization_public_id=org_1",
        { method: "GET" },
        "token",
      ),
    );

    fireEvent.change(organizationSelect, { target: { value: "org_2" } });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/locations?organization_public_id=org_2",
        { method: "GET" },
        "token",
      ),
    );

    fireEvent.change(screen.getByTestId("owner-booking-member-search"), {
      target: { value: "case" },
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/owner/members?organization_public_id=org_2&search=case",
      { method: "GET" },
      "token",
    );
  });

  it("submits a new member payment-link booking and shows link state", async () => {
    render(<NewOwnerBookingPage />);

    await screen.findByText("Create booking");
    fireEvent.change(screen.getByTestId("owner-booking-date"), {
      target: { value: "2026-07-15" },
    });
    fireEvent.click(screen.getByTestId("owner-booking-member-new"));
    fireEvent.change(screen.getByTestId("owner-booking-new-name"), {
      target: { value: "Walk In" },
    });
    fireEvent.change(screen.getByTestId("owner-booking-new-email"), {
      target: { value: "walkin@example.com" },
    });
    fireEvent.click(screen.getByTestId("owner-booking-payment-link"));
    fireEvent.click(screen.getByTestId("owner-booking-submit-button"));

    expect(await screen.findByText("Payment link sent")).toBeInTheDocument();
    const createCall = vi
      .mocked(apiFetch)
      .mock.calls.find(([path]) => path === "/api/owner/bookings");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      member: { email: "walkin@example.com", full_name: "Walk In" },
      payment_collection_mode: "payment_link",
    });
  });
});
