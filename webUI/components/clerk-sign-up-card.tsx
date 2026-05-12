"use client";

import { SignUp } from "@clerk/nextjs";
import { useEffect } from "react";

const SIGNUP_ROLE_KEY = "priddyspaces_signup_role";

interface ClerkSignUpCardProps {
  owner?: boolean;
}

export function ClerkSignUpCard({ owner = false }: ClerkSignUpCardProps) {
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
