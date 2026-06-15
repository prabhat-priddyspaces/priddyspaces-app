"use client";

import * as React from "react";
import { Bell, ChevronRight, Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";

export interface TopbarBadge {
  label: string;
  variant?: BadgeProps["variant"];
}

export interface TopbarProps {
  title?: React.ReactNode;
  breadcrumb?: React.ReactNode[];
  badge?: TopbarBadge;
  actions?: React.ReactNode;
  notification?: boolean;
  onNotificationClick?: () => void;
  onMenuClick?: () => void;
  className?: string;
}

export function Topbar({
  title,
  breadcrumb,
  badge,
  actions,
  notification = false,
  onNotificationClick,
  onMenuClick,
  className,
}: TopbarProps) {
  return (
    <header
      className={cn(
        "flex min-h-[64px] items-center gap-3 border-b border-line bg-bg-elev px-4 sm:gap-4 sm:px-7",
        className
      )}
    >
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          data-testid="mobile-menu-button"
          className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl text-text-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-ring lg:hidden"
        >
          <Menu size={18} strokeWidth={1.8} />
        </button>
      ) : null}
      <div className="flex-1 min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="flex items-center gap-1.5 text-[12px] text-text-3 mb-0.5">
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={11} />}
                <span>{b}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        {title && (
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-semibold">
              {title}
            </h1>
            {badge && <Badge variant={badge.variant ?? "mint"}>{badge.label}</Badge>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <button
          type="button"
          onClick={onNotificationClick}
          aria-label="Notifications"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:shadow-ring"
        >
          <Bell size={16} strokeWidth={1.6} />
          {notification && (
            <span
              aria-hidden
              className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-warning ring-2 ring-bg"
            />
          )}
        </button>
      </div>
    </header>
  );
}
