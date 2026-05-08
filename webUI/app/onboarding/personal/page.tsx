"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";

import { API_BASE_URL } from "@/lib/api";
import { type MeResponse } from "@/lib/me";
import { updateMeCache } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TIMEZONES = Intl.supportedValuesOf
  ? Intl.supportedValuesOf("timeZone")
  : [];

export default function OnboardingPersonalPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const [form, setForm] = useState({
    role: "customer" as "owner" | "customer",
    full_name: "",
    phone: "",
    country: "",
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
    setForm((prev) => ({
      ...prev,
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
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/onboarding/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: form.role,
          full_name: form.full_name,
          phone: form.phone || undefined,
          country: form.country || undefined,
          timezone: form.timezone || undefined,
          terms_accepted: form.terms_accepted,
          privacy_policy_accepted: form.privacy_policy_accepted,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Profile update failed");
      }
      const me: MeResponse = await res.json();
      // Prime the shared cache so layout guards read fresh data on redirect
      updateMeCache(me);
      // Reload Clerk session so new publicMetadata.role is reflected in the JWT
      await user?.reload();
      router.replace(me.default_route);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textSecondary">
        Loading...
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
            Tell us how you&apos;ll use Priddyspaces.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role */}
          <div className="space-y-2">
            <Label>I am a</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="role"
                  checked={form.role === "owner"}
                  onChange={() => setForm({ ...form, role: "owner" })}
                  className="rounded border-border"
                />
                Space Owner
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="role"
                  checked={form.role === "customer"}
                  onChange={() => setForm({ ...form, role: "customer" })}
                  className="rounded border-border"
                />
                Customer
              </label>
            </div>
          </div>

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
            <Input
              id="country"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="US"
              maxLength={2}
              required
              autoComplete="country"
            />
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
            {loading ? "Saving..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
