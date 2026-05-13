"use client";

/**
 * Bridges Clerk auth state into the legacy localStorage access-token slot
 * (`priddyspaces_access_token`) so the components that still read auth via
 * `getAccessToken()` recognize a signed-in user.
 *
 * Clerk JWTs are short-lived (~60 s by default), so we refresh on every
 * session-state change and on a periodic interval. The backend
 * (`app/core/auth.py`) verifies the RS256 token via Clerk's JWKS, so
 * dropping the Clerk-issued token into the same slot keeps every API
 * call working without per-component changes.
 *
 * The long-term fix is for components to call `useAuth().getToken()`
 * directly instead of reading localStorage, but bridging here lets us
 * unblock the deployed app immediately.
 */

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

import { clearAccessToken, getActiveImpersonationToken, setAccessToken } from "@/lib/auth";

const REFRESH_INTERVAL_MS = 30_000;

export function ClerkTokenSync() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      clearAccessToken();
      return;
    }

    let cancelled = false;

    const sync = async () => {
      try {
        if (getActiveImpersonationToken()) return;
        const token = await getToken();
        if (!cancelled) {
          if (token) setAccessToken(token);
          else clearAccessToken();
        }
      } catch {
        // Token fetch can fail transiently (network, expired session).
        // Leave whatever's in localStorage; next interval will retry.
      }
    };

    void sync();
    const id = window.setInterval(sync, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isLoaded, isSignedIn, getToken]);

  return null;
}
