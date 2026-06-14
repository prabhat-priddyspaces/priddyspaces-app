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
          colorPrimary: "#2F5D50",
          colorBackground: "#FFFCF8",
          colorInputBackground: "#FFFFFF",
          colorText: "#1F2320",
          colorTextSecondary: "#5E625B",
          borderRadius: "12px",
        },
        elements: {
          card: "shadow-none border border-line rounded-2xl bg-surface",
          headerTitle: "text-text font-semibold",
          headerSubtitle: "text-text-2",
          formButtonPrimary:
            "bg-brand hover:bg-brand-hover text-white rounded-xl",
          footerActionLink: "text-brand hover:underline",
        },
      }}
    />
  );
}
