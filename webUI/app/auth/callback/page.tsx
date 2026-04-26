"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { setAccessToken } from "@/lib/auth";
import { getDefaultRoute, type MeResponse } from "@/lib/me";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    setAccessToken(token);
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token)
      .then((me) => {
        router.replace(getDefaultRoute(me));
      })
      .catch(() => {
        setError("Sign-in failed. Please try again.");
      });
  }, [router, token]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-error">{error}</p>
        <a href="/login" className="text-sm text-accent hover:underline">
          Back to login
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
      Completing sign-in...
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
          Completing sign-in...
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
