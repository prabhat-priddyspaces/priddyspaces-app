"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { apiFetch } from "@/lib/api";

export interface CheckoutSummaryPayload {
  space_public_id?: string;
  start_datetime?: string;
  end_datetime?: string;
  booking_mode?: "hourly" | "day_pass";
  full_day?: boolean;
  seats_requested?: number;
  membership_plan_public_id?: string;
  desired_start_date?: string;
}

interface PreviewLineItem {
  label: string;
  amount_cents: number;
}

interface CheckoutPreview {
  currency: string;
  base_amount_cents: number;
  setup_fee_amount_cents: number;
  discount_amount_cents: number;
  tax_amount_cents: number;
  total_amount_cents: number;
  line_items: PreviewLineItem[];
}

interface CheckoutSummaryModalProps {
  open: boolean;
  payload: CheckoutSummaryPayload | null;
  title?: string;
  confirmLabel?: string;
  rewardsDiscountCents?: number;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.abs(cents) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function CheckoutSummaryModal({
  open,
  payload,
  title = "Checkout summary",
  confirmLabel = "Continue",
  rewardsDiscountCents = 0,
  submitting = false,
  onClose,
  onConfirm,
}: CheckoutSummaryModalProps) {
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const payloadKey = useMemo(() => (payload ? JSON.stringify(payload) : ""), [payload]);

  useEffect(() => {
    if (!open || !payloadKey) {
      setPreview(null);
      setError("");
      return;
    }
    const requestPayload = JSON.parse(payloadKey) as CheckoutSummaryPayload;
    let active = true;
    setLoading(true);
    setError("");
    apiFetch<CheckoutPreview>("/api/booking-requests/preview", {
      method: "POST",
      body: JSON.stringify(requestPayload),
    })
      .then((response) => {
        if (active) setPreview(response);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load checkout summary");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, payloadKey]);

  const finalTotal = useMemo(
    () => Math.max(0, (preview?.total_amount_cents ?? 0) - Math.max(0, rewardsDiscountCents)),
    [preview?.total_amount_cents, rewardsDiscountCents],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            <p className="mt-1 text-sm text-text-3">Review the full amount before checkout.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-line text-text-3 transition hover:text-text"
            aria-label="Close checkout summary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 min-h-[140px]">
          {loading ? <div className="text-sm text-text-3">Loading checkout summary...</div> : null}
          {error ? <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div> : null}
          {preview && !loading ? (
            <div className="space-y-3 text-sm">
              {preview.line_items.map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-4 text-text-2">
                  <span>{item.label}</span>
                  <span className="font-medium text-text">{formatCents(item.amount_cents)}</span>
                </div>
              ))}
              {preview.discount_amount_cents < 0 ? (
                <div className="flex items-center justify-between gap-4 text-success">
                  <span>Discount</span>
                  <span>-{formatCents(Math.abs(preview.discount_amount_cents))}</span>
                </div>
              ) : null}
              {rewardsDiscountCents > 0 ? (
                <div className="flex items-center justify-between gap-4 text-success">
                  <span>Rewards</span>
                  <span>-{formatCents(rewardsDiscountCents)}</span>
                </div>
              ) : null}
              {preview.tax_amount_cents > 0 ? (
                <div className="flex items-center justify-between gap-4 text-text-2">
                  <span>Tax</span>
                  <span className="font-medium text-text">{formatCents(preview.tax_amount_cents)}</span>
                </div>
              ) : null}
              <div className="border-t border-line pt-3">
                <div className="flex items-center justify-between gap-4 text-base font-semibold text-text">
                  <span>Total due</span>
                  <span>{formatCents(finalTotal)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full border border-line px-5 text-sm font-semibold text-text"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!preview || loading || Boolean(error) || submitting}
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Continuing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
