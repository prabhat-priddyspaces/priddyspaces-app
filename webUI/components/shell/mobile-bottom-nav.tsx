"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Calendar,
  Home,
  Inbox,
  LineChart,
  Search,
  Star,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface MobileNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ownerItems: MobileNavItem[] = [
  { href: "/owner", label: "Home", icon: Home },
  { href: "/owner/calendar", label: "Calendar", icon: Calendar },
  { href: "/owner/requests", label: "Inbox", icon: Inbox },
  { href: "/owner/analytics", label: "Insights", icon: LineChart },
];

const customerItems: MobileNavItem[] = [
  { href: "/spaces", label: "Discover", icon: Search },
  { href: "/member/calendar", label: "Bookings", icon: Calendar },
  { href: "/member/subscriptions", label: "Plans", icon: Star },
  { href: "/member/profile", label: "Profile", icon: User },
];

const adminItems: MobileNavItem[] = [
  { href: "/admin", label: "Home", icon: Home },
  { href: "/admin/bookings", label: "Bookings", icon: Inbox },
  { href: "/admin/listings", label: "Listings", icon: Box },
  { href: "/admin/users", label: "Users", icon: Users },
];

export function MobileBottomNav({
  variant = "owner",
}: {
  variant?: "owner" | "customer" | "admin";
}) {
  const pathname = usePathname() ?? "";
  const items =
    variant === "customer"
      ? customerItems
      : variant === "admin"
      ? adminItems
      : ownerItems;
  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-bg-elev border-t border-line pb-[env(safe-area-inset-bottom)]"
      style={{ boxShadow: "0 -4px 20px rgba(16,10,31,.06)" }}
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[10px] font-medium",
                  active ? "text-brand" : "text-text-3"
                )}
              >
                <Icon size={20} strokeWidth={1.6} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
