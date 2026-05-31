"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { consumeOauthNext } from "@/lib/auth-redirect";
import { type MeResponse } from "@/lib/me";
import { updateMeCache } from "@/hooks/useMe";
import { useOnboardingSession } from "@/hooks/useOnboardingSession";
import {
  detectTimezone,
  emptyOnboardingProfileForm,
  ProfileFields,
  TermsCheckbox,
  type OnboardingProfileForm,
} from "@/components/onboarding/profile-fields";
import { Button } from "@/components/ui/button";

export default function OnboardingMemberPage() {
  const router = useRouter();
  const { fullName, getToken, isLoaded, isSignedIn, reloadUser } = useOnboardingSession();

  const [form, setForm] = useState<OnboardingProfileForm>(emptyOnboardingProfileForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    setForm((prev) => ({
      ...prev,
      full_name: fullName ?? prev.full_name,
      timezone: detectTimezone(),
    }));
  }, [fullName, isLoaded, isSignedIn, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.terms_accepted || !form.privacy_policy_accepted) {
      setError("You must agree to the Privacy Policy and Terms and Conditions.");
      return;
    }
    setLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const me = await apiFetch<MeResponse>("/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          role: "member",
          full_name: form.full_name,
          phone: form.phone || undefined,
          country: form.country || undefined,
          timezone: form.timezone || undefined,
          terms_accepted: form.terms_accepted,
          privacy_policy_accepted: form.privacy_policy_accepted,
        }),
      }, token ?? undefined);
      updateMeCache(me);
      await reloadUser();
      const next = consumeOauthNext();
      router.replace(next ?? me.default_route);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to save member profile");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
        Loading your Priddyspaces profile...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md space-y-6 rounded-md border border-border bg-surface p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-textPrimary">
            Complete your member profile
          </h1>
          <p className="mt-1 text-sm text-textSecondary">
            Set up your member profile to book spaces and manage memberships.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <ProfileFields form={form} onChange={setForm} />
          <TermsCheckbox form={form} onChange={setForm} />

          {error ? <p className="text-sm text-error">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving member profile..." : "Continue member setup"}
          </Button>
        </form>
      </div>
    </div>
  );
}
