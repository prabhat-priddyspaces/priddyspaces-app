import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import LocationSpaces from "../app/owner/locations/spaces/page";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("locationId=loc_1"),
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

vi.mock("../components/space-list", () => ({
  SpaceList: ({ locationPublicId }: { locationPublicId: string }) => (
    <div data-testid="space-list">{locationPublicId}</div>
  ),
}));

describe("LocationSpaces", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/locations") {
        return Promise.resolve([{ public_id: "loc_1", name: "Austin Hub", city: "Austin" }]);
      }
      return Promise.reject(new Error(`Unhandled path: ${path}`));
    });
  });

  it("links back to location settings while managing inventory", async () => {
    render(<LocationSpaces />);

    expect(await screen.findByText("Austin Hub")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Location settings" })).toHaveAttribute(
      "href",
      "/owner/locations/loc_1/edit",
    );
    expect(screen.getByRole("link", { name: "Edit location settings" })).toHaveAttribute(
      "href",
      "/owner/locations/loc_1/edit",
    );
  });
});
