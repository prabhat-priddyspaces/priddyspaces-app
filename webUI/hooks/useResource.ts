"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useApiToken } from "@/hooks/useApiToken";

/**
 * Shared client-side data-fetching hooks.
 *
 * These replace the hand-rolled `useState(loading/error/data) + useEffect +
 * getApiToken + apiFetch` block repeated across pages. They build on the
 * existing typed client ({@link apiFetch}) and the environment-aware token
 * source ({@link useApiToken}); no new dependencies.
 *
 * Behaviour notes:
 * - Fetching is gated on `isAuthReady` so we never fire before auth resolves.
 * - Pass `path: null` to skip (conditional fetch); `loading` settles to false.
 * - `apiFetch` self-resolves a token, so `requireToken` is opt-in for screens
 *   that want an explicit "please sign in" message instead of a 401 error.
 */

export interface ResourceOptions {
  /** Require a token before fetching; show `unauthenticatedMessage` if absent. */
  requireToken?: boolean;
  /** Message surfaced as `error` when `requireToken` is set and no token exists. */
  unauthenticatedMessage?: string;
}

export interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the fetch (e.g. after a mutation). No-op while `path` is null. */
  reload: () => Promise<void>;
}

export function useResource<T>(path: string | null, options: ResourceOptions = {}): ResourceState<T> {
  const { requireToken = false, unauthenticatedMessage = "Sign in to continue." } = options;
  const { getApiToken, isAuthReady } = useApiToken();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!isAuthReady || path === null) return;
    setLoading(true);
    try {
      const token = (await getApiToken()) ?? undefined;
      if (requireToken && !token) {
        setError(unauthenticatedMessage);
        setData(null);
        return;
      }
      setError(null);
      const result = await apiFetch<T>(path, { method: "GET" }, token);
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [getApiToken, isAuthReady, path, requireToken, unauthenticatedMessage]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (path === null) {
      setLoading(false);
      return;
    }
    reload().catch(() => null);
  }, [isAuthReady, path, reload]);

  return { data, error, loading, reload };
}

export interface ResourceListState<T> {
  items: T[];
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** List variant of {@link useResource}: `items` defaults to `[]` (never null). */
export function useResourceList<T>(path: string | null, options: ResourceOptions = {}): ResourceListState<T> {
  const { data, error, loading, reload } = useResource<T[]>(path, options);
  return { items: data ?? [], error, loading, reload };
}
