import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <SignIn
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
