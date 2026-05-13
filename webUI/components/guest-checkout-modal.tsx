"use client";

import { useState } from "react";
import { X, CheckCircle2, User, Mail, Phone, Building2, MessageSquare } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatUsd, type MoneyValue } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GuestCheckoutPayload {
  space_public_id: string;
  start_datetime: string;
  end_datetime: string;
  booking_mode: "hourly" | "day_pass";
  full_day: boolean;
}

interface GuestBookingOut {
  public_id: string;
  status: string;
  start_datetime: string;
  end_datetime: string;
  space_public_id: string | null;
  estimated_amount: MoneyValue | null;
  message: string;
}

interface GuestCheckoutModalProps {
  /** If null, this is a membership/lease inquiry — guest form is not available. */
  payload: GuestCheckoutPayload | null;
  onClose: () => void;
  onSignIn: () => void;
}

type Step = "choice" | "form" | "success";

interface FormState {
  guest_full_name: string;
  guest_email: string;
  guest_phone: string;
  guest_company_name: string;
  guest_notes: string;
}

export function GuestCheckoutModal({ payload, onClose, onSignIn }: GuestCheckoutModalProps) {
  const isMembershipOnly = payload === null;
  const [step, setStep] = useState<Step>("choice");
  const [form, setForm] = useState<FormState>({
    guest_full_name: "",
    guest_email: "",
    guest_phone: "",
    guest_company_name: "",
    guest_notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GuestBookingOut | null>(null);

  function handleField(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.guest_full_name.trim() || !form.guest_email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch<GuestBookingOut>(
        "/api/guest/booking-requests",
        {
          method: "POST",
          body: JSON.stringify({
            ...(payload as GuestCheckoutPayload),
            guest_full_name: form.guest_full_name.trim(),
            guest_email: form.guest_email.trim(),
            guest_phone: form.guest_phone.trim() || undefined,
            guest_company_name: form.guest_company_name.trim() || undefined,
            guest_notes: form.guest_notes.trim() || undefined,
          }),
        }
      );
      setResult(data);
      setStep("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-surface shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-text-4 hover:bg-surface-2 hover:text-text-2"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {step === "choice" && (
          <div className="p-8">
            <h2 className="text-2xl font-semibold text-text">Book this space</h2>
            <p className="mt-1 text-sm text-text-3">
              How would you like to continue?
            </p>
            <div className="mt-6 grid gap-3">
              {isMembershipOnly ? (
                <div className="rounded-[16px] border border-line bg-surface-2 px-5 py-4">
                  <div className="font-semibold text-text-2">Memberships require an account</div>
                  <div className="mt-1 text-sm text-text-3">
                    To book a membership or lease, please create a free account. It only takes a minute.
                  </div>
                  <button
                    onClick={onSignIn}
                    className="mt-3 text-sm font-medium text-success hover:underline"
                  >
                    Create a free account →
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setStep("form")}
                  className="flex items-start gap-4 rounded-[16px] border-2 border-brand bg-brand-soft px-5 py-4 text-left transition hover:bg-brand-soft"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft0 text-white">
                    <User className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="font-semibold text-text">Continue as guest</div>
                    <div className="mt-0.5 text-sm text-text-3">
                      No account needed — fill in your contact info and submit a request. The owner will review it and get back to you.
                    </div>
                  </div>
                </button>
              )}

              <button
                onClick={onSignIn}
                className="flex items-start gap-4 rounded-[16px] border border-line bg-surface px-5 py-4 text-left transition hover:border-line-strong hover:bg-surface-2"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-2">
                  <Mail className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-semibold text-text">Sign in or create account</div>
                  <div className="mt-0.5 text-sm text-text-3">
                    Track all your bookings, access invoices, and book faster next time.
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === "form" && (
          <form onSubmit={handleSubmit} className="p-8">
            <button
              type="button"
              onClick={() => setStep("choice")}
              className="mb-4 text-sm text-success hover:underline"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-semibold text-text">Your details</h2>
            <p className="mt-1 text-sm text-text-3">
              The owner will contact you at the email you provide.
            </p>

            <div className="mt-6 grid gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-2">
                  Full name <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-4" />
                  <Input
                    required
                    placeholder="Jane Smith"
                    value={form.guest_full_name}
                    onChange={handleField("guest_full_name")}
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-2">
                  Email address <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-4" />
                  <Input
                    required
                    type="email"
                    placeholder="jane@example.com"
                    value={form.guest_email}
                    onChange={handleField("guest_email")}
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-2">
                  Phone number <span className="text-text-4 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-4" />
                  <Input
                    type="tel"
                    placeholder="+1 555 000 0000"
                    value={form.guest_phone}
                    onChange={handleField("guest_phone")}
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-2">
                  Company <span className="text-text-4 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-4" />
                  <Input
                    placeholder="Acme Inc."
                    value={form.guest_company_name}
                    onChange={handleField("guest_company_name")}
                    className="pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-2">
                  Message to owner <span className="text-text-4 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-text-4" />
                  <textarea
                    rows={3}
                    placeholder="Any special requirements or questions?"
                    value={form.guest_notes}
                    onChange={handleField("guest_notes")}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <div className="mt-6">
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Submitting request…" : "Submit booking request"}
              </Button>
              <p className="mt-3 text-center text-xs text-text-4">
                No payment required now. The owner will review your request and contact you.
              </p>
            </div>
          </form>
        )}

        {step === "success" && result && (
          <div className="p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-text">Request submitted!</h2>
            <p className="mt-2 text-sm text-text-3">
              We've sent a confirmation to <span className="font-medium text-text-2">{form.guest_email}</span>.
              The owner will review your request and get back to you.
            </p>

            <div className="mt-5 rounded-[16px] border border-line bg-surface-2 px-5 py-4 text-left">
              <div className="text-xs font-semibold uppercase tracking-widest text-text-4">
                Reference
              </div>
              <div className="mt-1 font-mono text-sm font-medium text-text-2">
                {result.public_id}
              </div>
              {result.estimated_amount != null ? (
                <div className="mt-3 text-sm text-text-2">
                  Estimated amount: <span className="font-semibold text-text">{formatUsd(result.estimated_amount)}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-6 grid gap-3">
              <Button onClick={onSignIn} className="w-full">
                Create a free account to track your booking
              </Button>
              <Button variant="secondary" onClick={onClose} className="w-full">
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
