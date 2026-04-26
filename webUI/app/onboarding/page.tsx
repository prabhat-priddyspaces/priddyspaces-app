"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface MeResponse {
  public_id: string;
  email: string;
  role: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<"owner" | "customer">("customer");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const agreed = termsAccepted;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token)
      .then((me) => {
        if (me.role != null) {
          router.replace(me.role === "owner" ? "/owner" : "/customer");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!agreed) {
      setError("You must agree to the Privacy Policy and Terms and Conditions.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(
        "/api/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            role,
            terms_accepted: true,
            privacy_policy_accepted: true,
          }),
        },
        token
      );
      router.replace(role === "owner" ? "/owner" : "/customer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-6 rounded-md border border-border bg-surface p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-textPrimary">Complete your profile</h1>
          <p className="mt-1 text-sm text-textSecondary">
            Choose how you&apos;ll use Priddyspaces.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>I am a</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="role"
                  checked={role === "owner"}
                  onChange={() => setRole("owner")}
                  className="rounded border-border"
                />
                Owner
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="role"
                  checked={role === "customer"}
                  onChange={() => setRole("customer")}
                  className="rounded border-border"
                />
                Customer
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 rounded border-border"
              />
              <span className="text-textSecondary">
                I agree to the{" "}
                <Link href="/terms" className="text-accent hover:underline">
                  Terms and Conditions
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-accent hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          </div>
          {error ? (
            <p className="text-sm text-error">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
