"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";

import { CustomerSideNav } from "@/components/customer-side-nav";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { getDefaultRoute } from "@/lib/me";
import { useMe } from "@/hooks/useMe";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { me, loading, error } = useMe();

  useEffect(() => {
    if (!isLoaded || loading) return;
    if (!isSignedIn || error) {
      router.replace("/sign-in");
      return;
    }
    if (!me) return;
    const customerAllowed =
      me.app_role === "customer" && (!me.platform_role || me.impersonation.is_impersonating);
    if (!customerAllowed) router.replace(getDefaultRoute(me));
  }, [isLoaded, isSignedIn, loading, error, me, router]);

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner
        impersonation={
          me?.impersonation ?? {
            is_impersonating: false,
            actor_public_id: null,
            actor_email: null,
            actor_platform_role: null,
            target_public_id: null,
            target_email: null,
            reason: null,
          }
        }
      />
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <div>
          <div className="text-sm text-textMuted">Priddyspaces</div>
          <h1 className="text-lg font-semibold text-textPrimary">Customer Workspace</h1>
        </div>
        <button
          type="button"
          onClick={() => signOut(() => router.replace("/sign-in"))}
          className="text-sm text-textSecondary hover:underline"
        >
          Logout
        </button>
      </div>
      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-8">
        <CustomerSideNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
