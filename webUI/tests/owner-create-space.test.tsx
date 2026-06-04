import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewSpacePage from "../app/owner/spaces/new/page";

const { apiFetchMock, pushMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function findPostBody(path: string) {
  const call = apiFetchMock.mock.calls.find(
    ([url, init]) => url === path && init?.method === "POST",
  );
  return call ? JSON.parse(String(call[1].body)) : null;
}

function findPutBody(path: string) {
  const call = apiFetchMock.mock.calls.find(
    ([url, init]) => url === path && init?.method === "PUT",
  );
  return call ? JSON.parse(String(call[1].body)) : null;
}

describe("NewSpacePage single-form create", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    pushMock.mockReset();
    apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/locations") {
        return Promise.resolve([{ public_id: "loc_1", name: "Austin Hub", city: "Austin" }]);
      }
      if (path === "/api/spaces" && init?.method === "POST") {
        return Promise.resolve({ public_id: "space_1" });
      }
      if (path === "/api/membership-plans" && init?.method === "POST") {
        return Promise.resolve({ public_id: "plan_1" });
      }
      if (path.endsWith("/booking-modes") && init?.method === "PUT") {
        return Promise.resolve({});
      }
      if (path.endsWith("/volume-discounts") && init?.method === "PUT") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unhandled API call: ${path}`));
    });
  });

  it("disables save until conference room hourly and day rate are set, then posts both", async () => {
    render(<NewSpacePage />);
    // Wait for locations to load and default-select.
    await screen.findByRole("option", { name: "Austin Hub, Austin" });

    const saveButton = screen.getByRole("button", { name: "Save Space" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Hourly price (USD)*"), { target: { value: "30" } });
    // Still disabled: day rate is now also required.
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Day rate price (USD)*"), { target: { value: "200" } });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      const body = findPostBody("/api/spaces");
      expect(body).toMatchObject({
        space_type: "conference_room",
        price_hourly: "30",
        price_daily: "200",
        location_public_id: "loc_1",
      });
    });
    expect(pushMock).toHaveBeenCalled();
  });

  it("clears price fields when switching space type", async () => {
    render(<NewSpacePage />);
    await screen.findByRole("option", { name: "Austin Hub, Austin" });

    fireEvent.change(screen.getByLabelText("Hourly price (USD)*"), { target: { value: "30" } });
    expect(screen.getByLabelText("Hourly price (USD)*")).toHaveValue(30);

    // Switch to suite: hourly field disappears, terms section appears.
    fireEvent.change(screen.getByLabelText("Space type"), { target: { value: "suite" } });
    expect(screen.queryByLabelText("Hourly price (USD)*")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lease Terms*" })).toBeInTheDocument();

    // Switch back to conference room: prior hourly value was cleared.
    fireEvent.change(screen.getByLabelText("Space type"), { target: { value: "conference_room" } });
    expect(screen.getByLabelText("Hourly price (USD)*")).toHaveValue(null);
  });

  it("requires a lease term for term-managed types and persists it on save", async () => {
    render(<NewSpacePage />);
    await screen.findByRole("option", { name: "Austin Hub, Austin" });

    fireEvent.change(screen.getByLabelText("Space type"), { target: { value: "suite" } });
    const saveButton = screen.getByRole("button", { name: "Save Space" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add term" }));
    fireEvent.change(screen.getByLabelText("Monthly price ($)*"), { target: { value: "4085" } });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      const planBody = findPostBody("/api/membership-plans");
      expect(planBody).toMatchObject({
        space_public_id: "space_1",
        booking_mode: "suite_lease",
        price_cents: 408500,
        billing_cycle: "monthly",
      });
    });
    const modeBody = findPutBody("/api/spaces/space_1/booking-modes");
    expect(modeBody).toMatchObject({ booking_mode: "suite_lease", is_enabled: true });
  });

  it("persists inline volume discount tiers for shared desk", async () => {
    render(<NewSpacePage />);
    await screen.findByRole("option", { name: "Austin Hub, Austin" });

    fireEvent.change(screen.getByLabelText("Space type"), { target: { value: "shared_desk" } });
    fireEvent.change(screen.getByLabelText("Day pass price (USD)*"), { target: { value: "200" } });

    fireEvent.click(screen.getByRole("button", { name: "Add tier" }));
    fireEvent.change(screen.getByLabelText("Min hours"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Discount %"), { target: { value: "10" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Space" }));

    await waitFor(() => {
      const body = findPutBody("/api/spaces/space_1/volume-discounts");
      expect(body).toEqual({ tiers: [{ min_hours: 4, discount_percent: 10, is_active: true }] });
    });
  });
});
