"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { apiFetch } from "@/lib/api";
import { getDefaultRoute, type MeResponse } from "@/lib/me";

export default function DashboardPage() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    getToken()
      .then((token) => apiFetch<MeResponse>("/api/me", { method: "GET" }, token ?? undefined))
      .then((me) => router.replace(getDefaultRoute(me)))
      .catch(() => router.replace("/sign-in"));
  }, [isLoaded, isSignedIn, getToken, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
      Redirecting…
    </div>
  );
}
