"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppSignOut } from "@/hooks/useAppSignOut";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Button } from "@/components/ui/button";
import { MobileBottomNav } from "@/components/shell/mobile-bottom-nav";
import { MobileSidebarDrawer } from "@/components/shell/mobile-sidebar-drawer";
import { NotificationDrawer } from "@/components/notifications/notification-drawer";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Topbar } from "@/components/shell/topbar";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MeResponse } from "@/lib/me";

const emptyImpersonation = {
  is_impersonating: false,
  actor_public_id: null,
  actor_email: null,
  actor_platform_role: null,
  target_public_id: null,
  target_email: null,
  reason: null,
};

export interface AdminShellProps {
  children: ReactNode;
  title?: string;
  breadcrumb?: string[];
}

export function AdminShell({
  children,
  title = "Platform",
  breadcrumb,
}: AdminShellProps) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const appSignOut = useAppSignOut();
  const router = useRouter();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token)
      .then(setMe)
      .catch(() => null);
  }, []);

  const profile = me
    ? {
        name:
          [me.first_name, me.last_name].filter(Boolean).join(" ") ||
          me.email ||
          "Admin",
        email: me.email || "",
        workspace: me.platform_role
          ? `Platform · ${me.platform_role}`
          : "Platform",
      }
    : undefined;

  const topbar = (
    <Topbar
      title={title}
      breadcrumb={breadcrumb}
      onMenuClick={() => setMobileNavOpen(true)}
      notification={unreadNotifications > 0}
      onNotificationClick={() => setNotificationsOpen(true)}
      actions={
        <>
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
    <>
      <MobileSidebarDrawer
        open={mobileNavOpen}
        variant="admin"
        profile={profile}
        isSuperadmin={me?.platform_role === "superadmin"}
        onClose={() => setMobileNavOpen(false)}
        onProfileClick={() => router.push("/admin/settings")}
      />
      <NotificationDrawer
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onUnreadCountChange={setUnreadNotifications}
      />
      <WorkspaceShell
        sidebar="admin"
        sidebarProfile={profile}
        isSuperadmin={me?.platform_role === "superadmin"}
        onProfileClick={() => router.push("/admin/settings")}
        topbar={topbar}
        banner={
          <ImpersonationBanner
            impersonation={me?.impersonation ?? emptyImpersonation}
          />
        }
      >
        {children}
        <MobileBottomNav variant="admin" />
      </WorkspaceShell>
    </>
  );
}
