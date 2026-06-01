"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMe } from "@/hooks/useMe";
import { useAppSignOut } from "@/hooks/useAppSignOut";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { MobileBottomNav } from "@/components/shell/mobile-bottom-nav";
import { MobileSidebarDrawer } from "@/components/shell/mobile-sidebar-drawer";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { NotificationDrawer } from "@/components/notifications/notification-drawer";
import { Topbar } from "@/components/shell/topbar";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

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

interface MarketplaceReadiness {
  organization_public_id: string;
  organization_name: string;
  provider: string | null;
  status: string;
  blockers: string[];
  public_listing_count: number;
  marketplace_visible_listing_count: number;
  payment_hidden_listing_count: number;
}

export function AppShell({
  children,
  title = "Workspace",
  breadcrumb,
}: AppShellProps) {
  const { me } = useMe();
  const appSignOut = useAppSignOut();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [readiness, setReadiness] = useState<MarketplaceReadiness[]>([]);

  useEffect(() => {
    if (me?.app_role !== "owner") {
      setReadiness([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    apiFetch<MarketplaceReadiness[]>("/api/owner/marketplace-readiness", { method: "GET" }, token)
      .then((items) => setReadiness(Array.isArray(items) ? items : []))
      .catch(() => setReadiness([]));
  }, [me?.app_role]);

  const hiddenListings = readiness.reduce(
    (total, item) => total + Math.max(0, item.payment_hidden_listing_count || 0),
    0
  );

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
      onMenuClick={() => setMobileNavOpen(true)}
      notification={unreadNotifications > 0}
      onNotificationClick={() => setNotificationsOpen(true)}
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
    <>
      <MobileSidebarDrawer
        open={mobileNavOpen}
        variant="owner"
        profile={profile}
        onClose={() => setMobileNavOpen(false)}
        onProfileClick={() => router.push("/owner/account")}
      />
      <NotificationDrawer
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onUnreadCountChange={setUnreadNotifications}
      />
      <WorkspaceShell
        sidebar="owner"
        sidebarProfile={profile}
        onProfileClick={() => router.push("/owner/account")}
        topbar={topbar}
        banner={
          <>
            <ImpersonationBanner
              impersonation={me?.impersonation ?? EMPTY_IMPERSONATION}
            />
            {hiddenListings > 0 ? (
              <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning sm:px-6 lg:px-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Payment setup required.</span>
                  <span>Your listings are hidden from search until payments are configured.</span>
                  <Link href="/owner/settings/payments" className="font-semibold underline underline-offset-2">
                    Fix payment settings
                  </Link>
                </div>
              </div>
            ) : null}
          </>
        }
      >
        {children}
        <MobileBottomNav variant="owner" />
      </WorkspaceShell>
    </>
  );
}
