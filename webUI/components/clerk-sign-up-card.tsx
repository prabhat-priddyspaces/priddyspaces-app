"use client";

import { SignUp } from "@clerk/nextjs";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const SIGNUP_ROLE_KEY = "priddyspaces_signup_role";

interface ClerkSignUpCardProps {
  owner?: boolean;
}

export function ClerkSignUpCard({ owner = false }: ClerkSignUpCardProps) {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") ?? undefined;

  useEffect(() => {
    if (owner) {
      window.sessionStorage.setItem(SIGNUP_ROLE_KEY, "owner");
    } else {
      window.sessionStorage.removeItem(SIGNUP_ROLE_KEY);
    }
  }, [owner]);

  return (
    <SignUp
      routing="hash"
      forceRedirectUrl={redirectUrl ?? "/dashboard"}
      signInUrl={
        redirectUrl
          ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
          : "/sign-in"
      }
      appearance={{
        variables: {
          colorPrimary: "#111827",
          colorBackground: "#ffffff",
          colorInputBackground: "#ffffff",
          borderRadius: "10px",
        },
        elements: {
          card: "shadow-none border border-border rounded-md",
          headerTitle: "text-textPrimary font-semibold",
          headerSubtitle: "text-textSecondary",
          formButtonPrimary:
            "bg-accent hover:bg-accentHover text-white rounded-md",
          footerActionLink: "text-accent hover:underline",
        },
      }}
    />
  );
}
