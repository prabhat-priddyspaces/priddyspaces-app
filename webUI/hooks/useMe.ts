"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { apiFetch } from "@/lib/api";
import type { MeResponse } from "@/lib/me";

// Module-level singleton so all layout guards share one fetch per TTL window.
// Calling updateMeCache() after onboarding ensures the guard never reads stale data.
let _cache: MeResponse | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 30_000;

export function updateMeCache(me: MeResponse): void {
  _cache = me;
  _cacheTime = Date.now();
}

export function invalidateMeCache(): void {
  _cache = null;
  _cacheTime = 0;
}

type MeState = {
  me: MeResponse | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
};

export function useMe(): MeState {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [me, setMe] = useState<MeResponse | null>(_cache);
  const [loading, setLoading] = useState(_cache === null);
  const [error, setError] = useState(false);

  const doFetch = useCallback(
    async (force = false) => {
      if (!force && _cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
        setMe(_cache);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(false);
      try {
        const token = await getToken();
        const data = await apiFetch<MeResponse>("/api/me", { method: "GET" }, token ?? undefined);
        updateMeCache(data);
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
