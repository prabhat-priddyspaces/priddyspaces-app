"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BusinessForm {
  name: string;
  display_name: string;
  website: string;
  business_email: string;
  business_phone: string;
  industry: string;
  description: string;
}

const emptyBusinessForm: BusinessForm = {
  name: "",
  display_name: "",
  website: "",
  business_email: "",
  business_phone: "",
  industry: "",
  description: "",
};

export default function OnboardingOwnerPage() {
  const router = useRouter();
  const { fullName, getToken, isLoaded, isSignedIn, reloadUser } = useOnboardingSession();

  const [profile, setProfile] = useState<OnboardingProfileForm>(emptyOnboardingProfileForm);
  const [business, setBusiness] = useState<BusinessForm>(emptyBusinessForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    setProfile((prev) => ({
      ...prev,
      full_name: fullName ?? prev.full_name,
      timezone: detectTimezone(),
    }));
  }, [fullName, isLoaded, isSignedIn, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!profile.terms_accepted || !profile.privacy_policy_accepted) {
      setError("You must agree to the Privacy Policy and Terms and Conditions.");
      return;
    }
    if (!business.name.trim()) {
      setError("Business name is required.");
      return;
    }
    setLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const profileResult = await apiFetch<MeResponse>("/api/onboarding/profile", {
        method: "POST",
        body: JSON.stringify({
          role: "owner",
          full_name: profile.full_name,
          phone: profile.phone || undefined,
          country: profile.country || undefined,
          timezone: profile.timezone || undefined,
          terms_accepted: profile.terms_accepted,
          privacy_policy_accepted: profile.privacy_policy_accepted,
        }),
      }, token ?? undefined);
      updateMeCache(profileResult);
      await reloadUser();

      const orgToken = await getToken({ skipCache: true });
      const me = await apiFetch<MeResponse>("/api/onboarding/organization", {
        method: "POST",
        body: JSON.stringify({
          name: business.name.trim(),
          display_name: business.display_name.trim() || undefined,
          website: business.website.trim() || undefined,
          business_email: business.business_email.trim() || undefined,
          business_phone: business.business_phone.trim() || undefined,
          industry: business.industry.trim() || undefined,
          description: business.description.trim() || undefined,
        }),
      }, orgToken ?? token ?? undefined);
      updateMeCache(me);
      router.replace(me.default_route);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to complete owner setup");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
        Loading owner onboarding...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-2xl space-y-6 rounded-md border border-border bg-surface p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-textPrimary">
            Set up your owner account
          </h1>
          <p className="mt-1 text-sm text-textSecondary">
            Add your profile and business details for marketplace review.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-textPrimary">Your profile</h2>
            <ProfileFields form={profile} onChange={setProfile} />
            <TermsCheckbox form={profile} onChange={setProfile} />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-textPrimary">Business details</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="business-name">
                  Legal business name <span className="text-error">*</span>
                </Label>
                <Input
                  id="business-name"
                  value={business.name}
                  onChange={(e) => setBusiness({ ...business, name: e.target.value })}
                  placeholder="Acme Coworking LLC"
                  required
                  autoComplete="organization"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="display-name">Public display name (optional)</Label>
                <Input
                  id="display-name"
                  value={business.display_name}
                  onChange={(e) => setBusiness({ ...business, display_name: e.target.value })}
                  placeholder="Acme Coworking"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Industry (optional)</Label>
                <Input
                  id="industry"
                  value={business.industry}
                  onChange={(e) => setBusiness({ ...business, industry: e.target.value })}
                  placeholder="Coworking, real estate, hospitality"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-email">Business email (optional)</Label>
                <Input
                  id="business-email"
                  type="email"
                  value={business.business_email}
                  onChange={(e) => setBusiness({ ...business, business_email: e.target.value })}
                  placeholder="hello@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-phone">Business phone (optional)</Label>
                <Input
                  id="business-phone"
                  type="tel"
                  value={business.business_phone}
                  onChange={(e) => setBusiness({ ...business, business_phone: e.target.value })}
                  placeholder="+1 555 000 0000"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="website">Website (optional)</Label>
                <Input
                  id="website"
                  type="url"
                  value={business.website}
                  onChange={(e) => setBusiness({ ...business, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Business description (optional)</Label>
                <textarea
                  id="description"
                  value={business.description}
                  onChange={(e) => setBusiness({ ...business, description: e.target.value })}
                  placeholder="Briefly describe your workspace business and the spaces you plan to list."
                  className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textPrimary"
                />
              </div>
            </div>
          </section>

          {error ? <p className="text-sm text-error">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating owner account..." : "Create owner account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
