"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { clearAccessToken } from "@/lib/auth";

const nav = [
  { href: "/owner", label: "Dashboard" },
  { href: "/owner/analytics", label: "Analytics" },
  { href: "/owner/locations", label: "Locations" },
  { href: "/owner/locations/spaces", label: "Inventory" },
  { href: "/owner/spaces/new", label: "New Space" },
  { href: "/owner/locations/new", label: "New Location" },
  { href: "/owner/requests", label: "Requests" },
  { href: "/owner/team", label: "Team" },
  { href: "/owner/payments", label: "Payments" },
  { href: "/owner/invoices", label: "Invoices" },
  { href: "/owner/settings", label: "Settings" },
];

export function SideNav() {
  const router = useRouter();

  function handleLogout() {
    clearAccessToken();
    router.replace("/login");
  }

  return (
    <aside className="w-full md:w-64">
      <div className="rounded-md border border-border bg-surface p-4">
        <div className="text-xs font-semibold text-textMuted">Owner</div>
        <nav className="mt-4 space-y-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-sm px-3 py-2 text-sm text-textPrimary hover:bg-surface2"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-sm px-3 py-2 text-left text-sm text-textSecondary hover:bg-surface2"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
