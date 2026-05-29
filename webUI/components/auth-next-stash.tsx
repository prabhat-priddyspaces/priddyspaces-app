"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { stashOauthNext } from "@/lib/auth-redirect";

export function AuthNextStash() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = searchParams.get("redirect_url");
    stashOauthNext(next);
  }, [searchParams]);

  return null;
}
