"use client";

import { SignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { stashOauthNext } from "@/lib/auth-redirect";

interface ClerkSignUpCardProps {
  owner?: boolean;
}

export function ClerkSignUpCard({ owner = false }: ClerkSignUpCardProps) {
  const searchParams = useSearchParams();
  const role = owner ? "owner" : "member";
  const onboardingUrl = owner ? "/onboarding/owner" : "/onboarding/member";
  const email = searchParams.get("email")?.trim().toLowerCase();
  const redirectUrl = searchParams.get("redirect_url");
  const initialValues = email && email.includes("@") ? { emailAddress: email } : undefined;

  useEffect(() => {
    if (!owner) stashOauthNext(redirectUrl);
  }, [owner, redirectUrl]);

  return (
    <SignUp
      routing="hash"
      forceRedirectUrl={onboardingUrl}
      fallbackRedirectUrl={onboardingUrl}
      unsafeMetadata={{ signup_role: role }}
      initialValues={initialValues}
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
