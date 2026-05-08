"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { clearAccessToken } from "@/lib/auth";

const nav = [
  { href: "/customer", label: "Marketplace" },
  { href: "/customer/calendar", label: "My Calendar" },
  { href: "/customer/insights", label: "My Insights" },
  { href: "/customer/requests", label: "My Requests" },
  { href: "/customer/subscriptions", label: "Memberships" },
  { href: "/customer/payments", label: "Payments" },
  { href: "/customer/invoices", label: "Invoices" },
  { href: "/customer/profile", label: "Profile" }
];

export function CustomerSideNav() {
  const router = useRouter();

  function handleLogout() {
    clearAccessToken();
    router.replace("/sign-in");
  }

  return (
    <aside className="w-full md:w-64">
      <div className="rounded-md border border-border bg-surface p-4">
        <div className="text-xs font-semibold text-textMuted">Customer</div>
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
