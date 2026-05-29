"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { useAppSignOut } from "@/hooks/useAppSignOut";
import { consumeOauthNext } from "@/lib/auth-redirect";
import { getDefaultRoute } from "@/lib/me";
import { useMe } from "@/hooks/useMe";

export default function DashboardPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const appSignOut = useAppSignOut();
  const { me, loading, error, refresh } = useMe();

  useEffect(() => {
    if (!isLoaded || loading) return;
    // Only bounce to /sign-in when we're genuinely signed out. If Clerk says
    // we're signed in but /api/me failed, redirecting causes a loop because
    // signInForceRedirectUrl sends us right back to /dashboard.
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    if (!error && me) {
      const defaultRoute = getDefaultRoute(me);
      if (defaultRoute.startsWith("/onboarding")) {
        // New user — leave stash intact for onboarding to consume
        router.replace(defaultRoute);
      } else {
        // Returning user — consume stash and redirect to original destination
        const next = consumeOauthNext();
        router.replace(next ?? defaultRoute);
      }
    }
  }, [isLoaded, isSignedIn, loading, error, me, router]);

  if (isLoaded && isSignedIn && error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-md border border-border bg-surface p-6 text-center">
          <h1 className="text-lg font-semibold text-textPrimary">
            Couldn&apos;t load your account
          </h1>
          <p className="mt-2 text-sm text-textSecondary">
            We signed you in successfully, but the backend couldn&apos;t verify
            your session. This is usually a temporary configuration issue.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => refresh()}
              className="rounded-sm border border-border bg-white px-3 py-1.5 text-sm text-textSecondary hover:bg-surface2"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => void appSignOut()}
              className="rounded-sm border border-border bg-white px-3 py-1.5 text-sm text-textSecondary hover:bg-surface2"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
      Redirecting…
    </div>
  );
}
