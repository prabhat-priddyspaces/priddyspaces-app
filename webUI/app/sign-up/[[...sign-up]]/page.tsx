import { SignUp } from "@clerk/nextjs";

// See sign-in/[[...sign-in]]/page.tsx for the rationale — hash routing
// keeps multi-step Clerk navigation in-page so we only need to
// statically render the base path.
export function generateStaticParams() {
  return [{ "sign-up": [] }];
}

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
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
    </div>
  );
}
