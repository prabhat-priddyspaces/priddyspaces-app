"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";

import { apiFetch } from "@/lib/api";
import { consumeOauthNext } from "@/lib/auth-redirect";
import { COUNTRIES } from "@/lib/countries";
import { type MeResponse } from "@/lib/me";
import { updateMeCache } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TIMEZONES = Intl.supportedValuesOf
  ? Intl.supportedValuesOf("timeZone")
  : [];
const SIGNUP_ROLE_KEY = "priddyspaces_signup_role";

export default function OnboardingPersonalPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [form, setForm] = useState({
    role: "member" as "owner" | "member",
    full_name: "",
    phone: "",
    country: "US",
    timezone: "",
    terms_accepted: false,
    privacy_policy_accepted: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-fill name from Clerk and detect timezone
  useEffect(() => {
    if (!isLoaded) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const requestedRole =
      params.get("role") === "owner" ||
      (typeof window !== "undefined" && window.sessionStorage.getItem(SIGNUP_ROLE_KEY) === "owner")
        ? "owner"
        : "member";
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SIGNUP_ROLE_KEY);
    }
    setForm((prev) => ({
      ...prev,
      role: requestedRole,
      full_name: user?.fullName ?? prev.full_name,
      timezone: detected,
    }));
  }, [isLoaded, user]);

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
          role: form.role,
          full_name: form.full_name,
          phone: form.phone || undefined,
          country: form.country || undefined,
          timezone: form.timezone || undefined,
          terms_accepted: form.terms_accepted,
          privacy_policy_accepted: form.privacy_policy_accepted,
        }),
      }, token ?? undefined);
      // Prime the shared cache so layout guards read fresh data on redirect
      updateMeCache(me);
      // Reload Clerk session so new publicMetadata.role is reflected in the JWT
      await user?.reload();
      const next = consumeOauthNext();
      router.replace(next ?? me.default_route);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to save profile setup");
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
            Complete your profile
          </h1>
          <p className="mt-1 text-sm text-textSecondary">
            {form.role === "owner"
              ? "Set up your owner profile before creating your organization."
              : "Set up your member profile to book spaces and manage memberships."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Jane Doe"
              required
              autoComplete="name"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 000 0000"
              autoComplete="tel"
            />
          </div>

          {/* Country */}
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <select
              id="country"
              className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[13px] text-text"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              required
              autoComplete="country"
            >
              {COUNTRIES.map(({ code, name }) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Timezone */}
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            {TIMEZONES.length > 0 ? (
              <select
                id="timezone"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textPrimary"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                required
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="timezone"
                value={form.timezone}
                onChange={(e) =>
                  setForm({ ...form, timezone: e.target.value })
                }
                placeholder="America/New_York"
                required
              />
            )}
          </div>

          {/* Terms */}
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.terms_accepted && form.privacy_policy_accepted}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm({
                    ...form,
                    terms_accepted: checked,
                    privacy_policy_accepted: checked,
                  });
                }}
                className="mt-1 rounded border-border"
                required
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

          {error ? <p className="text-sm text-error">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving profile..." : "Continue profile setup"}
          </Button>
        </form>
      </div>
    </div>
  );
}
