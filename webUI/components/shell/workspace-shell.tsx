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
}: WorkspaceShellProps) {
  return (
    <div className={cn("min-h-screen flex flex-col bg-bg text-text", className)}>
      {banner}
      <div className="flex flex-1 min-h-0">
        <Sidebar
          variant={sidebar}
          profile={sidebarProfile}
          isSuperadmin={isSuperadmin}
          onSearchClick={onSearchClick}
        />
        <div className="flex flex-col flex-1 min-w-0">
          {topbar}
          <main
            className={cn(
              "flex-1 min-h-0 overflow-auto px-6 py-7 lg:px-8",
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
