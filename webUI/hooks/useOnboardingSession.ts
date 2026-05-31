"use client";

import { useAuth, useUser } from "@clerk/nextjs";

import { getAccessToken } from "@/lib/auth";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";

interface TokenOptions {
  skipCache?: boolean;
}

interface OnboardingSession {
  fullName: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: (options?: TokenOptions) => Promise<string | null>;
  reloadUser: () => Promise<void>;
}

function useClerkOnboardingSession(): OnboardingSession {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuth();

  return {
    fullName: user?.fullName ?? null,
    isLoaded: isUserLoaded && isAuthLoaded,
    isSignedIn: Boolean(isSignedIn),
    getToken,
    reloadUser: async () => {
      await user?.reload();
    },
  };
}

function useLocalOnboardingSession(): OnboardingSession {
  const token = getAccessToken();
  return {
    fullName: null,
    isLoaded: true,
    isSignedIn: Boolean(token),
    getToken: async () => getAccessToken(),
    reloadUser: async () => undefined,
  };
}

export const useOnboardingSession: () => OnboardingSession = IS_E2E_BYPASS
  ? useLocalOnboardingSession
  : useClerkOnboardingSession;
