"use client";

import { useCallback } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import { invalidateMeCache } from "@/hooks/useMe";
import { clearAccessToken } from "@/lib/auth";
import { getSignOutRedirectTarget } from "@/lib/clerk-urls";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";

interface AppSignOutOptions {
  redirectTo?: string | null;
  onSignedOut?: () => void;
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

      const target = getSignOutRedirectTarget(redirectTo);
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
      const target = getSignOutRedirectTarget(redirectTo);
      let notified = false;
      let finished = false;

      const clearAndNotify = () => {
        clearAppSession();
        if (!notified) {
          notified = true;
          onSignedOut?.();
        }
      };

      const finish = (navigate = true) => {
        clearAndNotify();
        if (finished) return;
        finished = true;
        if (navigate && target) {
          router.replace(target);
        }
      };

      clearAndNotify();

      try {
        if (target) {
          await signOut({ redirectUrl: target });
        } else {
          await signOut();
        }
        finish(false);
      } catch {
        finish();
      }
    },
    [router, signOut],
  );
}

export const useAppSignOut = IS_E2E_BYPASS ? useLocalAppSignOut : useClerkAppSignOut;
