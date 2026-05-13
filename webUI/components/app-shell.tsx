"use client";

import { ReactNode } from "react";
import Link from "next/link";

import { useMe } from "@/hooks/useMe";
import { useAppSignOut } from "@/hooks/useAppSignOut";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { MobileBottomNav } from "@/components/shell/mobile-bottom-nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/shell/topbar";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

const EMPTY_IMPERSONATION = {
  is_impersonating: false,
  actor_public_id: null,
  actor_email: null,
  actor_platform_role: null,
  target_public_id: null,
  target_email: null,
  reason: null,
};

export interface AppShellProps {
  children: ReactNode;
  title?: string;
  breadcrumb?: string[];
}

export function AppShell({
  children,
  title = "Workspace",
  breadcrumb,
}: AppShellProps) {
  const { me } = useMe();
  const appSignOut = useAppSignOut();

  const profile = me
    ? {
        name:
          [me.first_name, me.last_name].filter(Boolean).join(" ") ||
          me.email ||
          "Owner",
        email: me.email || "",
        workspace: me.company_name || "Workspace",
      }
    : undefined;

  const topbar = (
    <Topbar
      title={title}
      breadcrumb={breadcrumb}
      actions={
        <>
          {me?.platform_role ? (
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                Platform Console
              </Button>
            </Link>
          ) : null}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void appSignOut()}
            aria-label="Sign out"
          >
            Logout
          </Button>
        </>
      }
    />
  );

  return (
    <WorkspaceShell
      sidebar="owner"
      sidebarProfile={profile}
      topbar={topbar}
      banner={
        <ImpersonationBanner
          impersonation={me?.impersonation ?? EMPTY_IMPERSONATION}
        />
      }
    >
      {children}
      <MobileBottomNav variant="owner" />
    </WorkspaceShell>
  );
}
