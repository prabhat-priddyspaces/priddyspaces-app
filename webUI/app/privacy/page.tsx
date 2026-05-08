import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-textPrimary">Privacy Policy</h1>
        <p className="mt-4 text-sm text-textSecondary">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <div className="mt-6 space-y-4 text-sm text-textSecondary">
          <p>
            Priddyspaces respects your privacy. This policy describes how we collect,
            use, and protect your information.
          </p>
          <p>
            We collect information you provide when registering (email, name, role)
            and when using the platform (e.g. booking requests, location searches).
            We use this to provide the service, improve the platform, and communicate
            with you.
          </p>
          <p>
            We do not sell your personal information. We may share data with service
            providers (e.g. hosting) as needed to operate the platform.
          </p>
          <p>
            You may request access to or deletion of your data by contacting support.
          </p>
        </div>
        <Link href="/sign-in" className="mt-8 inline-block text-sm text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
