"use client";

import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const APPEARANCE = {
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
    formButtonPrimary: "bg-accent hover:bg-accentHover text-white rounded-md",
    footerActionLink: "text-accent hover:underline",
  },
};

function SignInInner() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") ?? undefined;

  return (
    <SignIn
      routing="hash"
      forceRedirectUrl={redirectUrl ?? "/dashboard"}
      signUpUrl={
        redirectUrl
          ? `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`
          : "/sign-up"
      }
      appearance={APPEARANCE}
    />
  );
}

export function ClerkSignInCard() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
