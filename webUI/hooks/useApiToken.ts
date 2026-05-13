"use client";

import { useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/auth";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";

type ApiTokenState = {
  getApiToken: () => Promise<string | null>;
  isAuthReady: boolean;
};

function useClerkApiToken(): ApiTokenState {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const getApiToken = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return null;
    const token = await getToken({ skipCache: true });
    if (token) {
      setAccessToken(token);
    } else {
      clearAccessToken();
    }
    return token;
  }, [getToken, isLoaded, isSignedIn]);

  return { getApiToken, isAuthReady: isLoaded };
}

function useLocalApiToken(): ApiTokenState {
  const getApiToken = useCallback(async () => getAccessToken(), []);
  return { getApiToken, isAuthReady: true };
}

export const useApiToken: () => ApiTokenState = IS_E2E_BYPASS
  ? useLocalApiToken
  : useClerkApiToken;
