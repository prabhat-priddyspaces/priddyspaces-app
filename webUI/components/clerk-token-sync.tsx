"use client";

/**
 * Bridges Clerk auth state into the legacy access-token helper so components
 * that still read auth via `getAccessToken()` recognize a signed-in user.
 *
 * Clerk JWTs are short-lived (~60 s by default), so we refresh on every
 * session-state change and on a periodic interval. The backend
 * (`app/core/auth.py`) verifies the RS256 token via Clerk's JWKS, so
 * dropping the Clerk-issued token into the same slot keeps every API
 * call working without per-component changes.
 *
 * Production tokens are kept in module memory, not localStorage. The
 * localStorage path remains only for the explicit Playwright bypass build.
 */

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

import {
  clearAccessToken,
  getActiveImpersonationToken,
  registerAccessTokenProvider,
  setAccessToken,
} from "@/lib/auth";

const REFRESH_INTERVAL_MS = 30_000;

export function ClerkTokenSync() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      registerAccessTokenProvider(null);
      clearAccessToken();
      return;
    }

    registerAccessTokenProvider((options) => getToken(options));

    let cancelled = false;

    const sync = async () => {
      try {
        if (getActiveImpersonationToken()) return;
        const token = await getToken({ skipCache: true });
        if (!cancelled) {
          if (token) setAccessToken(token);
          else clearAccessToken();
        }
      } catch {
        // Token fetch can fail transiently (network, expired session).
        // Leave the in-memory token alone; next interval will retry.
      }
    };

    void sync();
    const id = window.setInterval(sync, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      registerAccessTokenProvider(null);
      window.clearInterval(id);
    };
  }, [isLoaded, isSignedIn, getToken]);

  return null;
}
