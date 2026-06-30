"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAppSignOut } from "@/hooks/useAppSignOut";

const baseNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/owner-companies", label: "Owner Companies" },
  { href: "/admin/owner-users", label: "Owner Users" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/assistant-quality", label: "Assistant Quality" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
];

export function AdminSideNav({ platformRole }: { platformRole: string | null }) {
  const pathname = usePathname();
  const appSignOut = useAppSignOut();
  const nav = [...baseNav];
  if (platformRole === "superadmin" || platformRole === "admin") {
    nav.push({ href: "/admin/space-types", label: "Space Types" });
  }
  if (platformRole === "superadmin") {
    nav.push({ href: "/admin/platform-team", label: "Platform Team" });
    nav.push({ href: "/admin/settings", label: "Settings" });
  }

  return (
    <aside className="w-full md:w-64">
      <div className="rounded-md border border-border bg-surface p-4">
        <div className="text-xs font-semibold text-textMuted">Platform</div>
        <nav className="mt-4 space-y-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-sm px-3 py-2 text-sm ${
                pathname === item.href ? "bg-surface2 text-textPrimary" : "text-textSecondary hover:bg-surface2"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => void appSignOut()}
            className="w-full rounded-sm px-3 py-2 text-left text-sm text-textSecondary hover:bg-surface2"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
