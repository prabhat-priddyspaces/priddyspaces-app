import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-textPrimary">Terms and Conditions</h1>
        <p className="mt-4 text-sm text-textSecondary">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <div className="mt-6 space-y-4 text-sm text-textSecondary">
          <p>
            Welcome to Priddyspaces. By using this platform you agree to these terms.
          </p>
          <p>
            Priddyspaces provides a multi-location coworking management platform for owners
            and customers. Owners can list locations and spaces; customers can discover
            and request bookings.
          </p>
          <p>
            You are responsible for the accuracy of your account information and for
            complying with applicable laws. We reserve the right to suspend or terminate
            accounts that violate these terms.
          </p>
          <p>
            For questions, please contact support.
          </p>
        </div>
        <Link href="/sign-in" className="mt-8 inline-block text-sm text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
