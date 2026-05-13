"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Calendar,
  ChevronDown,
  CreditCard,
  FileText,
  Home,
  Inbox,
  LineChart,
  type LucideIcon,
  MapPin,
  Megaphone,
  Search,
  Settings,
  Star,
  User,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { Logo } from "@/components/shell/logo";

export type SidebarVariant = "owner" | "customer";

export interface SidebarItem {
  href: string;
  icon: LucideIcon;
  label: string;
  count?: number;
  countTone?: "default" | "warning";
}

export interface SidebarSection {
  label: string;
  items: SidebarItem[];
}

export interface SidebarProfile {
  name: string;
  email: string;
  workspace: string;
}

export interface SidebarProps {
  variant?: SidebarVariant;
  profile?: SidebarProfile;
  onSearchClick?: () => void;
  onProfileClick?: () => void;
}

const ownerSections: SidebarSection[] = [
  {
    label: "Overview",
    items: [
      { href: "/owner", icon: Home, label: "Dashboard" },
      { href: "/owner/calendar", icon: Calendar, label: "Calendar" },
      { href: "/owner/requests", icon: Inbox, label: "Requests" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/owner/members", icon: Users, label: "Members" },
      { href: "/owner/locations", icon: MapPin, label: "Locations" },
      { href: "/owner/locations/spaces", icon: Box, label: "Inventory" },
      { href: "/owner/team", icon: User, label: "Team" },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/owner/marketing", icon: Megaphone, label: "Marketing" },
      { href: "/owner/loyalty", icon: Star, label: "Loyalty" },
      { href: "/owner/analytics", icon: LineChart, label: "Analytics" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/owner/payments", icon: CreditCard, label: "Payments" },
      { href: "/owner/invoices", icon: FileText, label: "Invoices" },
    ],
  },
];

const customerSections: SidebarSection[] = [
  {
    label: "Workspace",
    items: [
      { href: "/member", icon: Search, label: "Discover" },
      { href: "/member/calendar", icon: Calendar, label: "My calendar" },
      { href: "/member/requests", icon: Inbox, label: "My bookings" },
      { href: "/member/subscriptions", icon: Star, label: "Memberships" },
      { href: "/member/invoices", icon: FileText, label: "Invoices" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/member/profile", icon: User, label: "Profile" },
      { href: "/member/payments", icon: CreditCard, label: "Billing" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/owner" || href === "/member") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  variant = "owner",
  profile,
  onSearchClick,
  onProfileClick,
}: SidebarProps) {
  const pathname = usePathname() ?? "";
  const sections = variant === "customer" ? customerSections : ownerSections;
  const workspaceLabel =
    profile?.workspace ??
    (variant === "customer" ? "Member" : "Workspace");

  return (
    <aside className="hidden lg:flex flex-col gap-1 border-r border-line bg-bg px-3 py-3.5 w-[232px] flex-none overflow-hidden">
      <button
        type="button"
        onClick={onProfileClick}
        className="flex items-center gap-2.5 rounded-[10px] border border-transparent bg-transparent p-1.5 mb-2.5 text-left hover:bg-surface-2 transition-colors"
      >
        <Logo size={28} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold leading-none">
            Priddyspaces
          </div>
          <div className="text-[11px] text-text-3 leading-none mt-1 truncate">
            {workspaceLabel}
          </div>
        </div>
        <ChevronDown size={14} className="text-text-3" />
      </button>

      <button
        type="button"
        onClick={onSearchClick}
        className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 mb-2 text-text-3 text-[13px] hover:border-line-strong transition-colors"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="flex-1 overflow-auto flex flex-col gap-3">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-4 px-2.5 mb-0.5 py-1">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-brand-soft text-brand-strong font-semibold"
                      : "text-text-2 font-medium hover:bg-surface-2"
                  )}
                >
                  <Icon
                    size={15}
                    strokeWidth={1.6}
                    className={active ? "text-brand" : "text-text-3"}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.count != null && (
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-semibold",
                        item.countTone === "warning"
                          ? "bg-warning-soft text-warning"
                          : "bg-surface-2 text-text-2"
                      )}
                    >
                      {item.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {profile && (
        <button
          type="button"
          onClick={onProfileClick}
          className="mt-2 flex items-center gap-2.5 rounded-[10px] bg-surface-2 px-2 py-2 text-left hover:bg-surface-3 transition-colors"
        >
          <Avatar name={profile.name} size={28} />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold leading-none truncate">
              {profile.name}
            </div>
            <div className="text-[11px] text-text-3 leading-none mt-1 truncate">
              {profile.email}
            </div>
          </div>
          <Settings size={14} className="text-text-3" />
        </button>
      )}
    </aside>
  );
}
