import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewSpacePage from "../app/owner/spaces/new/page";
import { EditSpaceClient } from "../app/owner/spaces/[spaceId]/edit/client";

const { apiFetchMock, backMock, pushMock, routeParams, searchParams } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  backMock: vi.fn(),
  pushMock: vi.fn(),
  routeParams: { value: { spaceId: "space_1" } },
  searchParams: { value: "" },
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/lease-terms-manager", () => ({
  LeaseTermsManager: () => <div />,
}));

vi.mock("@/components/volume-discount-manager", () => ({
  VolumeDiscountManager: () => <div />,
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("next/navigation", () => ({
  useParams: () => routeParams.value,
  useRouter: () => ({ back: backMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams(searchParams.value),
}));

describe("owner space reward controls", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    backMock.mockReset();
    pushMock.mockReset();
    routeParams.value = { spaceId: "space_1" };
    searchParams.value = "";
  });

  it("does not render or send reward fields from space creation", async () => {
    apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/locations" && init?.method === "GET") {
        return Promise.resolve([{ public_id: "loc_1", name: "Main", city: "Austin" }]);
      }
      if (url === "/api/spaces" && init?.method === "POST") {
        return Promise.resolve({ public_id: "space_1" });
      }
      return Promise.resolve([]);
    });

    render(<NewSpacePage />);

    expect(await screen.findByText("Main, Austin")).toBeInTheDocument();
    expect(screen.queryByLabelText("Priddy Points")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Owner points")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Space" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/spaces",
        expect.objectContaining({ method: "POST" }),
        "token",
      );
    });
    const createCall = apiFetchMock.mock.calls.find(([url]) => url === "/api/spaces");
    const body = JSON.parse(createCall?.[1]?.body as string);
    expect(body).not.toHaveProperty("priddy_points_enabled");
    expect(body).not.toHaveProperty("owner_points_enabled");
  });

  it("does not render or send reward fields from space editing", async () => {
    apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/spaces/space_1" && init?.method === "GET") {
        return Promise.resolve({
          public_id: "space_1",
          name: "Conference 1",
          space_type: "conference_room",
          capacity: 8,
          price_monthly: null,
          price_daily: 200,
          price_hourly: 50,
          availability_status: "available",
          availability_start_time: "09:00",
          availability_end_time: "17:00",
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          visibility: "public",
          priddy_points_enabled: false,
          owner_points_enabled: false,
        });
      }
      if (url === "/api/spaces/space_1" && init?.method === "PATCH") {
        return Promise.resolve({});
      }
      return Promise.resolve([]);
    });

    render(<EditSpaceClient />);

    expect(await screen.findByDisplayValue("Conference 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Priddy Points")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Owner points")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/spaces/space_1",
        expect.objectContaining({ method: "PATCH" }),
        "token",
      );
    });
    const updateCall = apiFetchMock.mock.calls.find(
      ([url, init]) => url === "/api/spaces/space_1" && init?.method === "PATCH",
    );
    const body = JSON.parse(updateCall?.[1]?.body as string);
    expect(body).not.toHaveProperty("priddy_points_enabled");
    expect(body).not.toHaveProperty("owner_points_enabled");
  });
});
