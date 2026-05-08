"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { API_BASE_URL } from "@/lib/api";
import { type MeResponse } from "@/lib/me";
import { updateMeCache } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ORG_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;

export default function OnboardingOrganizationPage() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [form, setForm] = useState({
    name: "",
    industry: "",
    size: "" as "" | (typeof ORG_SIZES)[number],
    website: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Auth guard — if not signed in redirect to sign-in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Business name is required.");
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/onboarding/organization`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          industry: form.industry || undefined,
          size: form.size || undefined,
          website: form.website || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Organization creation failed");
      }
      const me: MeResponse = await res.json();
      updateMeCache(me);
      router.replace("/owner");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Creation failed");
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
            Set up your business
          </h1>
          <p className="mt-1 text-sm text-textSecondary">
            Create your organization to start managing spaces.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business name — required, no default */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Business name <span className="text-error">*</span>
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Acme Inc."
              required
            />
          </div>

          {/* Industry */}
          <div className="space-y-2">
            <Label htmlFor="industry">Industry (optional)</Label>
            <Input
              id="industry"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              placeholder="Technology, Healthcare, Finance…"
            />
          </div>

          {/* Size */}
          <div className="space-y-2">
            <Label htmlFor="size">Company size (optional)</Label>
            <select
              id="size"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-textPrimary"
              value={form.size}
              onChange={(e) =>
                setForm({
                  ...form,
                  size: e.target.value as typeof form.size,
                })
              }
            >
              <option value="">Select…</option>
              {ORG_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} employees
                </option>
              ))}
            </select>
          </div>

          {/* Website */}
          <div className="space-y-2">
            <Label htmlFor="website">Website (optional)</Label>
            <Input
              id="website"
              type="url"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://example.com"
            />
          </div>

          {error ? <p className="text-sm text-error">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </div>
    </div>
  );
}
