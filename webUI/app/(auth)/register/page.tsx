"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { API_BASE_URL, apiFetch } from "@/lib/api";
import { setAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MeResponse {
  public_id: string;
  email: string;
  role: string | null;
}

function redirectByRole(role: string | null) {
  if (role === "owner") return "/owner";
  if (role === "customer") return "/customer";
  return "/owner";
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "customer" as "owner" | "customer",
    terms_accepted: false,
    privacy_policy_accepted: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.terms_accepted || !form.privacy_policy_accepted) {
      setError("You must agree to the Privacy Policy and Terms and Conditions.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          terms_accepted: form.terms_accepted,
          privacy_policy_accepted: form.privacy_policy_accepted,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Registration failed");
      }
      const { access_token } = await res.json();
      setAccessToken(access_token);
      const me = await apiFetch<MeResponse>("/api/me", { method: "GET" }, access_token);
      router.push(redirectByRole(me.role));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md space-y-6 rounded-md border border-border bg-surface p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-textPrimary">Create an account</h1>
          <p className="mt-1 text-sm text-textSecondary">
            Enter your details and choose owner or customer.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="Jane"
                required
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Doe"
                required
                autoComplete="family-name"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>
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
                Owner
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
            {loading ? "Creating account..." : "Register"}
          </Button>
        </form>
        <p className="text-center text-sm text-textSecondary">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
