"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Sidebar, type SidebarProps } from "@/components/shell/sidebar";

export interface WorkspaceShellProps {
  sidebar?: SidebarProps["variant"];
  sidebarProfile?: SidebarProps["profile"];
  isSuperadmin?: boolean;
  topbar?: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  onSearchClick?: () => void;
  onProfileClick?: () => void;
  onWorkspaceClick?: () => void;
}

export function WorkspaceShell({
  sidebar = "owner",
  sidebarProfile,
  isSuperadmin,
  topbar,
  banner,
  children,
  className,
  contentClassName,
  onSearchClick,
  onProfileClick,
  onWorkspaceClick,
}: WorkspaceShellProps) {
  return (
    <div className={cn("h-screen overflow-hidden flex flex-col bg-bg text-text", className)}>
      {banner}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          variant={sidebar}
          profile={sidebarProfile}
          isSuperadmin={isSuperadmin}
          onSearchClick={onSearchClick}
          onProfileClick={onProfileClick}
          onWorkspaceClick={onWorkspaceClick}
        />
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {topbar ? <div className="flex-none">{topbar}</div> : null}
          <main
            data-testid="workspace-main"
            className={cn(
              // Extra bottom padding on mobile so content clears the fixed
              // MobileBottomNav (and the device safe-area); reset at lg where
              // the bottom nav is hidden.
              "flex-1 min-h-0 overflow-auto px-4 pt-6 pb-[calc(64px+env(safe-area-inset-bottom)+1rem)] sm:px-6 lg:px-8 lg:pt-7 lg:pb-7",
              contentClassName
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
