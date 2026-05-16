import { ClerkSignInCard } from "@/components/clerk-sign-in-card";

// `output: export` requires every catch-all route to declare its static
// params upfront. Clerk's <SignIn routing="hash"> handles all internal
// navigation in-page via the URL hash, so we only need the base path.
export function generateStaticParams() {
  return [{ "sign-in": [] }];
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <ClerkSignInCard />
    </div>
  );
}
