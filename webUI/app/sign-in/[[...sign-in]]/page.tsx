import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

import { AuthNextStash } from "@/components/auth-next-stash";

// `output: export` requires every catch-all route to declare its static
// params upfront. Clerk's <SignIn routing="hash"> handles all internal
// navigation in-page via the URL hash, so we only need the base path.
export function generateStaticParams() {
  return [{ "sign-in": [] }];
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <Suspense fallback={null}>
        <AuthNextStash />
      </Suspense>
      <SignIn
        routing="hash"
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
    </div>
  );
}
