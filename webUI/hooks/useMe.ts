"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { apiFetch } from "@/lib/api";
import { getAccessToken, getActiveImpersonationToken } from "@/lib/auth";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";
import type { MeResponse } from "@/lib/me";

// Module-level singleton so all layout guards share one fetch per TTL window.
// Calling updateMeCache() after onboarding ensures the guard never reads stale data.
let _cache: MeResponse | null = null;
let _cacheTime = 0;
let _cacheToken: string | null = null;
const CACHE_TTL_MS = 30_000;

export function updateMeCache(me: MeResponse, token?: string | null): void {
  _cache = me;
  _cacheTime = Date.now();
  _cacheToken = token ?? null;
}

export function invalidateMeCache(): void {
  _cache = null;
  _cacheTime = 0;
  _cacheToken = null;
}

type MeState = {
  me: MeResponse | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
};

function useMeClerk(): MeState {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const initialImpersonationToken = getActiveImpersonationToken();
  const initialMe =
    initialImpersonationToken && _cacheToken !== initialImpersonationToken ? null : _cache;

  const [me, setMe] = useState<MeResponse | null>(initialMe);
  const [loading, setLoading] = useState(initialMe === null);
  const [error, setError] = useState(false);

  const doFetch = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(false);
      try {
        const token = getActiveImpersonationToken() ?? await getToken();
        if (!force && token && _cache && _cacheToken === token && Date.now() - _cacheTime < CACHE_TTL_MS) {
          setMe(_cache);
          setLoading(false);
          return;
        }
        const data = await apiFetch<MeResponse>("/api/me", { method: "GET" }, token ?? undefined);
        updateMeCache(data, token);
        setMe(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      invalidateMeCache();
      setMe(null);
      setLoading(false);
      return;
    }
    doFetch();
  }, [isLoaded, isSignedIn, doFetch]);

  return { me, loading, error, refresh: () => doFetch(true) };
}

function useMeLocal(): MeState {
  const initialToken = getAccessToken();
  const initialMe = initialToken && _cacheToken !== initialToken ? null : _cache;
  const [me, setMe] = useState<MeResponse | null>(initialMe);
  const [loading, setLoading] = useState(initialMe === null);
  const [error, setError] = useState(false);

  const doFetch = useCallback(async (force = false) => {
    setLoading(true);
    setError(false);
    try {
      const token = getAccessToken();
      if (!force && token && _cache && _cacheToken === token && Date.now() - _cacheTime < CACHE_TTL_MS) {
        setMe(_cache);
        setLoading(false);
        return;
      }
      const data = await apiFetch<MeResponse>("/api/me", { method: "GET" }, token ?? undefined);
      updateMeCache(data, token);
      setMe(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return { me, loading, error, refresh: () => doFetch(true) };
}

// IS_E2E_BYPASS is a build-time constant (NEXT_PUBLIC_E2E_BYPASS_CLERK).
// Aliasing to one implementation keeps rules-of-hooks happy.
export const useMe: () => MeState = IS_E2E_BYPASS ? useMeLocal : useMeClerk;
