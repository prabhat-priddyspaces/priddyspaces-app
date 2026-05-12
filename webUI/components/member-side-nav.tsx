"use client";

import Link from "next/link";

import { useAppSignOut } from "@/hooks/useAppSignOut";

const nav = [
  { href: "/member", label: "Marketplace" },
  { href: "/member/calendar", label: "My Calendar" },
  { href: "/member/insights", label: "My Insights" },
  { href: "/member/requests", label: "My Requests" },
  { href: "/member/subscriptions", label: "Memberships" },
  { href: "/member/rewards", label: "Rewards" },
  { href: "/member/payments", label: "Payments" },
  { href: "/member/invoices", label: "Invoices" },
  { href: "/member/profile", label: "Profile" }
];

export function MemberSideNav() {
  const appSignOut = useAppSignOut();

  function handleLogout() {
    void appSignOut();
  }

  return (
    <aside className="w-full md:w-64">
      <div className="rounded-md border border-border bg-surface p-4">
        <div className="text-xs font-semibold text-textMuted">Member</div>
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
