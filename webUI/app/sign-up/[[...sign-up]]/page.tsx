import { Suspense } from "react";

import { AuthNextStash } from "@/components/auth-next-stash";
import { ClerkSignUpCard } from "@/components/clerk-sign-up-card";

// See sign-in/[[...sign-in]]/page.tsx for the rationale — hash routing
// keeps multi-step Clerk navigation in-page so we only need to
// statically render the base path.
export function generateStaticParams() {
  return [{ "sign-up": [] }];
}

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <Suspense fallback={null}>
        <AuthNextStash />
      </Suspense>
      <ClerkSignUpCard />
    </div>
  );
}
