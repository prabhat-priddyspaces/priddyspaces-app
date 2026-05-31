import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MemberSubscriptionsPage from "../app/member/subscriptions/page";
import { apiFetch } from "../lib/api";

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("MemberSubscriptionsPage", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue([
      {
        public_id: "sub_1",
        space_public_id: "space_1",
        space_type: "conference_room",
        location_name: "Downtown Hub",
        status: "active",
        start_date: "2026-05-01",
        end_date: null,
      },
    ]);
  });

  it("keeps membership billing actions off the memberships page", async () => {
    render(<MemberSubscriptionsPage />);

    expect(await screen.findByText("Downtown Hub")).toBeInTheDocument();
    expect(screen.getByText("Manage active workspace memberships, billing status, and cancellation timing.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Membership billing" })).not.toBeInTheDocument();
  });
});
