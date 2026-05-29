"use client";

import { useCallback } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import { invalidateMeCache } from "@/hooks/useMe";
import { clearAccessToken } from "@/lib/auth";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";

interface AppSignOutOptions {
  redirectTo?: string | null;
  onSignedOut?: () => void;
}

const DEFAULT_SIGN_OUT_REDIRECT = "/spaces";

function getRedirectTarget(redirectTo: AppSignOutOptions["redirectTo"]) {
  return typeof redirectTo === "undefined" ? DEFAULT_SIGN_OUT_REDIRECT : redirectTo;
}

function clearAppSession() {
  clearAccessToken();
  invalidateMeCache();
}

function useLocalAppSignOut() {
  const router = useRouter();

  return useCallback(
    async ({ redirectTo, onSignedOut }: AppSignOutOptions = {}) => {
      clearAppSession();
      onSignedOut?.();

      const target = getRedirectTarget(redirectTo);
      if (target) {
        router.replace(target);
      }
    },
    [router],
  );
}

function useClerkAppSignOut() {
  const router = useRouter();
  const { signOut } = useClerk();

  return useCallback(
    async ({ redirectTo, onSignedOut }: AppSignOutOptions = {}) => {
      const target = getRedirectTarget(redirectTo);

      // Tear down our own session bridge before Clerk clears its cookie so the
      // access-token helpers and /api/me cache don't outlive the session.
      clearAppSession();
      onSignedOut?.();

      try {
        if (target) {
          // Let Clerk own the post-sign-out navigation. Without redirectUrl,
          // clearing the session re-renders the current protected route and the
          // middleware bounces to Clerk's hosted Account Portal (accounts.dev)
          // before any client-side redirect of ours can run.
          await signOut({ redirectUrl: target });
        } else {
          // No redirect requested (e.g. signing out from a public page): pass a
          // no-op callback so Clerk stays put instead of using its default
          // afterSignOutUrl.
          await signOut(() => {});
        }
      } catch {
        if (target) {
          router.replace(target);
        }
      }
    },
    [router, signOut],
  );
}

export const useAppSignOut = IS_E2E_BYPASS ? useLocalAppSignOut : useClerkAppSignOut;
