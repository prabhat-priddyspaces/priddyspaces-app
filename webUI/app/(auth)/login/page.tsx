"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { sanitizeNext } from "@/lib/auth-redirect";

function LoginRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = sanitizeNext(searchParams.get("next"));
    const target = next
      ? `/sign-in?redirect_url=${encodeURIComponent(next)}`
      : "/sign-in";
    router.replace(target);
  }, [router, searchParams]);

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-textSecondary">
      Redirecting to sign in…
    </div>
  );
}

export default function LegacyLoginRedirect() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-sm text-textSecondary">
          Redirecting…
        </div>
      }
    >
      <LoginRedirectInner />
    </Suspense>
  );
}
