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

const DEFAULT_SIGN_OUT_REDIRECT = "/coworking";

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
      let notified = false;
      let finished = false;

      const clearAndNotify = () => {
        clearAppSession();
        if (!notified) {
          notified = true;
          onSignedOut?.();
        }
      };

      const finish = () => {
        clearAndNotify();
        if (finished) return;
        finished = true;
        if (target) {
          router.replace(target);
        }
      };

      clearAndNotify();

      try {
        await signOut(finish);
        finish();
      } catch {
        finish();
      }
    },
    [router, signOut],
  );
}

export const useAppSignOut = IS_E2E_BYPASS ? useLocalAppSignOut : useClerkAppSignOut;
