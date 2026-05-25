"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/shell/logo";
import {
  getSidebarSections,
  isActive,
  type SidebarProfile,
  type SidebarVariant,
} from "@/components/shell/sidebar";

interface MobileSidebarDrawerProps {
  open: boolean;
  variant?: SidebarVariant;
  profile?: SidebarProfile;
  isSuperadmin?: boolean;
  onClose: () => void;
  onProfileClick?: () => void;
}

export function MobileSidebarDrawer({
  open,
  variant = "owner",
  profile,
  isSuperadmin = false,
  onClose,
  onProfileClick,
}: MobileSidebarDrawerProps) {
  const pathname = usePathname() ?? "";
  const sections = getSidebarSections(variant, isSuperadmin);
  const workspaceLabel =
    profile?.workspace ??
    (variant === "customer"
      ? "Member"
      : variant === "admin"
      ? "Platform"
      : "Workspace");

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  React.useEffect(() => {
    if (open) onClose();
    // Close only after route changes; onClose is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      data-testid="mobile-sidebar-drawer"
    >
      <button
        type="button"
        aria-label="Close navigation menu"
        className="absolute inset-0 h-full w-full bg-black/35"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-[min(86vw,320px)] flex-col border-r border-line bg-bg px-3 py-3.5 shadow-xl">
        <div className="mb-3 flex items-center gap-2.5 rounded-[10px] p-1.5">
          <Logo size={28} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-none">
              Priddyspaces
            </div>
            <div className="mt-1 truncate text-[11px] leading-none text-text-3">
              {workspaceLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-ring"
          >
            <X size={17} strokeWidth={1.8} />
          </button>
        </div>

        <nav className="flex-1 overflow-auto">
          <div className="flex flex-col gap-3">
            {sections.map((section) => (
              <div key={section.label}>
                <div className="mb-0.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-4">
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] transition-colors",
                        active
                          ? "bg-brand-soft font-semibold text-brand-strong"
                          : "font-medium text-text-2 hover:bg-surface-2"
                      )}
                    >
                      <Icon
                        size={16}
                        strokeWidth={1.7}
                        className={active ? "text-brand" : "text-text-3"}
                      />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        {profile ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onProfileClick?.();
            }}
            aria-label="Open account settings"
            className="mt-3 flex items-center gap-2.5 rounded-[10px] bg-surface-2 px-2 py-2 text-left transition-colors hover:bg-surface-3"
          >
            <Avatar name={profile.name} size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold leading-none">
                {profile.name}
              </div>
              <div className="mt-1 truncate text-[11px] leading-none text-text-3">
                {profile.email}
              </div>
            </div>
          </button>
        ) : null}
      </aside>
    </div>
  );
}
