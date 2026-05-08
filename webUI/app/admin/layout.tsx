"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { getDefaultRoute } from "@/lib/me";
import { useMe } from "@/hooks/useMe";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { me, loading, error } = useMe();

  useEffect(() => {
    if (!isLoaded || loading) return;
    if (!isSignedIn || error) {
      router.replace("/sign-in");
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
