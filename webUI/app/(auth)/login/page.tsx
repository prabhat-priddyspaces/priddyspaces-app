"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { API_BASE_URL, apiFetch } from "@/lib/api";
import { setAccessToken } from "@/lib/auth";
import {
  buildLoginHref,
  sanitizeNext,
  stashOauthNext,
} from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDefaultRoute, type MeResponse } from "@/lib/me";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const enableOauth = process.env.NEXT_PUBLIC_ENABLE_OAUTH === "true";
  const loginUrl = `${API_BASE_URL}/auth/login/google`;
  const appleUrl = `${API_BASE_URL}/auth/login/apple`;
  const registerHref = next ? buildRegisterHref(next) : "/register";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Login failed");
      }
      const { access_token } = await res.json();
      setAccessToken(access_token);
      const me = await apiFetch<MeResponse>("/api/me", { method: "GET" }, access_token);
      router.push(next ?? getDefaultRoute(me));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function handleOauthClick() {
    stashOauthNext(next);
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-6 rounded-md border border-border bg-surface p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-textPrimary">Sign in</h1>
          <p className="mt-1 text-sm text-textSecondary">
            Use your email or continue with Google or Apple.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error ? (
            <p className="text-sm text-error">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Log in"}
          </Button>
        </form>
        {enableOauth ? (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs text-textMuted">
                <span className="bg-surface px-2">or continue with</span>
              </div>
            </div>
            <div className="grid gap-2">
              <a href={loginUrl} onClick={handleOauthClick}>
                <Button type="button" variant="secondary" className="w-full">
                  Continue with Google
                </Button>
              </a>
              <a href={appleUrl} onClick={handleOauthClick}>
                <Button type="button" variant="secondary" className="w-full">
                  Continue with Apple
                </Button>
              </a>
            </div>
          </>
        ) : null}
        <p className="text-center text-sm text-textSecondary">
          Don&apos;t have an account?{" "}
          <Link href={registerHref} className="font-medium text-accent hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

function buildRegisterHref(next: string): string {
  return `/register?next=${encodeURIComponent(next)}`;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
          Loading…
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
