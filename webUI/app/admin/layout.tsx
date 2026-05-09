"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { getDefaultRoute } from "@/lib/me";
import { useMe } from "@/hooks/useMe";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";

function ClerkAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { me, loading, error } = useMe();

  useEffect(() => {
    if (!isLoaded || loading) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    if (error) {
      router.replace("/dashboard");
      return;
    }
    if (!me) return;
    if (me.impersonation.is_impersonating || !me.platform_role) {
      router.replace(getDefaultRoute(me));
    }
  }, [isLoaded, isSignedIn, loading, error, me, router]);

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}

function BypassAdminLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  if (IS_E2E_BYPASS) {
    return <BypassAdminLayout>{children}</BypassAdminLayout>;
  }
  return <ClerkAdminLayout>{children}</ClerkAdminLayout>;
}
