"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Button } from "@/components/ui/button";
import { MobileBottomNav } from "@/components/shell/mobile-bottom-nav";
import { MobileSidebarDrawer } from "@/components/shell/mobile-sidebar-drawer";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Topbar } from "@/components/shell/topbar";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { useAppSignOut } from "@/hooks/useAppSignOut";
import { getDefaultRoute, type MeResponse } from "@/lib/me";
import { useMe } from "@/hooks/useMe";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";

const EMPTY_IMPERSONATION = {
  is_impersonating: false,
  actor_public_id: null,
  actor_email: null,
  actor_platform_role: null,
  target_public_id: null,
  target_email: null,
  reason: null,
};

function Shell({
  me,
  onSignOut,
  children,
}: {
  me: MeResponse;
  onSignOut?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const profile = {
    name:
      [me.first_name, me.last_name].filter(Boolean).join(" ") ||
      me.email ||
      "Member",
    email: me.email || "",
    workspace: "Member",
  };
  const topbar = (
    <Topbar
      title="Workspace"
      onMenuClick={() => setMobileNavOpen(true)}
      actions={
        <>
          <ThemeToggle />
          {onSignOut ? (
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              Logout
            </Button>
          ) : null}
        </>
      }
    />
  );
  return (
    <>
      <MobileSidebarDrawer
        open={mobileNavOpen}
        variant="customer"
        profile={profile}
        onClose={() => setMobileNavOpen(false)}
        onProfileClick={() => router.push("/member/profile")}
      />
      <WorkspaceShell
        sidebar="customer"
        sidebarProfile={profile}
        onProfileClick={() => router.push("/member/profile")}
        topbar={topbar}
        banner={
          <ImpersonationBanner
            impersonation={me?.impersonation ?? EMPTY_IMPERSONATION}
          />
        }
      >
        {children}
        <MobileBottomNav variant="customer" />
      </WorkspaceShell>
    </>
  );
}

function ClerkMemberLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const appSignOut = useAppSignOut();
  const { me, loading, error } = useMe();

  useEffect(() => {
    if (!isLoaded || loading) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    // /api/me failed while Clerk says we're signed in — bounce to /dashboard
    // which renders an error UI instead of looping through /sign-in.
    if (error) {
      router.replace("/dashboard");
      return;
    }
    if (!me) return;
    const memberAllowed =
      me.app_role === "member" && (!me.platform_role || me.impersonation.is_impersonating);
    if (!memberAllowed) router.replace(getDefaultRoute(me));
  }, [isLoaded, isSignedIn, loading, error, me, router]);

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-text-3">
        Loading...
      </div>
    );
  }

  return (
    <Shell me={me} onSignOut={() => void appSignOut()}>
      {children}
    </Shell>
  );
}

function BypassMemberLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-text-3">
        Loading...
      </div>
    );
  }

  return <Shell me={me}>{children}</Shell>;
}

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  if (IS_E2E_BYPASS) {
    return <BypassMemberLayout>{children}</BypassMemberLayout>;
  }
  return <ClerkMemberLayout>{children}</ClerkMemberLayout>;
}
