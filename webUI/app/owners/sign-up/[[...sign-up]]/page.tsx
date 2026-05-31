import { Suspense } from "react";

import { ClerkSignUpCard } from "@/components/clerk-sign-up-card";

export function generateStaticParams() {
  return [{ "sign-up": [] }];
}

export default function OwnerSignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <Suspense fallback={null}>
        <ClerkSignUpCard owner />
      </Suspense>
    </div>
  );
}
