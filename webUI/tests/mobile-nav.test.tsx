import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../components/app-shell";
import { MobileSidebarDrawer } from "../components/shell/mobile-sidebar-drawer";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => null),
  getActiveImpersonationToken: vi.fn(() => null),
  clearAccessToken: vi.fn(),
}));

describe("owner AppShell mobile navigation", () => {
  it("exposes a mobile menu button that opens the full navigation drawer", () => {
    render(
      <AppShell title="Dashboard">
        <div>Owner content</div>
      </AppShell>
    );

    // The drawer is closed by default.
    expect(
      screen.queryByTestId("mobile-sidebar-drawer")
    ).not.toBeInTheDocument();

    // The mobile-only hamburger button is wired up.
    const menuButton = screen.getByTestId("mobile-menu-button");
    expect(menuButton).toBeInTheDocument();

    fireEvent.click(menuButton);

    const drawer = screen.getByTestId("mobile-sidebar-drawer");
    expect(drawer).toBeInTheDocument();

    // Drawer gives access to owner nav items that the 4-item bottom nav omits,
    // achieving parity with the desktop sidebar.
    const links = within(drawer);
    expect(links.getByText("Scanner")).toBeInTheDocument();
    expect(links.getByText("Attendance")).toBeInTheDocument();
    expect(links.getByText("Locations")).toBeInTheDocument();
    expect(links.getByText("Invoices")).toBeInTheDocument();
    expect(links.getByText("Members")).toBeInTheDocument();
  });
});

describe("MobileSidebarDrawer customer variant", () => {
  it("renders the full member navigation when open", () => {
    render(
      <MobileSidebarDrawer
        open
        variant="customer"
        onClose={() => {}}
      />
    );

    const drawer = screen.getByTestId("mobile-sidebar-drawer");
    const links = within(drawer);
    expect(links.getByText("Access passes")).toBeInTheDocument();
    expect(links.getByText("My Space QR")).toBeInTheDocument();
    expect(links.getByText("Directory")).toBeInTheDocument();
    expect(links.getByText("Memberships")).toBeInTheDocument();
    expect(links.getByText("Rewards")).toBeInTheDocument();
    expect(links.getByText("Invoices")).toBeInTheDocument();
    expect(links.getByText("Billing")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <MobileSidebarDrawer
        open={false}
        variant="customer"
        onClose={() => {}}
      />
    );
    expect(
      screen.queryByTestId("mobile-sidebar-drawer")
    ).not.toBeInTheDocument();
  });
});
