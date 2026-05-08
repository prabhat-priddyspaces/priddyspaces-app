"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { sanitizeNext } from "@/lib/auth-redirect";

function RegisterRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = sanitizeNext(searchParams.get("next"));
    const target = next
      ? `/sign-up?redirect_url=${encodeURIComponent(next)}`
      : "/sign-up";
    router.replace(target);
  }, [router, searchParams]);

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-textSecondary">
      Redirecting to sign up…
    </div>
  );
}

export default function LegacyRegisterRedirect() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-sm text-textSecondary">
          Redirecting…
        </div>
      }
    >
      <RegisterRedirectInner />
    </Suspense>
  );
}
