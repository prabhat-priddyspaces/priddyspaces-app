"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  CreditCard,
  Mail,
  Palette,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface SubNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const SETTINGS_TABS: SubNavItem[] = [
  { href: "/owner/settings", label: "Business profile", icon: Building2 },
  { href: "/owner/settings/booking", label: "Booking rules", icon: CalendarCheck },
  { href: "/owner/settings/pricing", label: "Pricing & promotions", icon: Tag },
  { href: "/owner/settings/payments", label: "Payments", icon: CreditCard },
  { href: "/owner/settings/marketing", label: "Email sender", icon: Mail },
  { href: "/owner/settings/assistant-policies", label: "AI assistant", icon: Sparkles },
  { href: "/owner/settings/appearance", label: "Appearance", icon: Palette },
];

function isTabActive(pathname: string, href: string): boolean {
  // The landing tab must match exactly so it doesn't stay active on child routes.
  if (href === "/owner/settings") return pathname === "/owner/settings";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SettingsSubNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {SETTINGS_TABS.map((tab) => {
        const active = isTabActive(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors",
              active
                ? "border-brand text-brand-strong font-semibold"
                : "border-transparent text-text-2 font-medium hover:text-text hover:border-line-strong"
            )}
          >
            <Icon
              size={15}
              strokeWidth={1.6}
              className={active ? "text-brand" : "text-text-3"}
            />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
