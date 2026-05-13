"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Tag, TriangleAlert } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatUsd, type MoneyValue } from "@/lib/money";
import { buildLoginHref } from "@/lib/auth-redirect";
import {
  computeMonthlySavingsPercent,
  findBaselinePlan,
  formatLeasePrice,
  LeaseBookingMode,
  MembershipPlanPublic,
  termLabel,
} from "@/lib/public-marketplace";
import { PaymentMethodModal } from "@/components/payment-method-modal";

const DATE_INPUT_FALLBACK = () => new Date().toISOString().slice(0, 10);

interface PaymentMethodResolve {
  is_configured: boolean;
  has_payment_method: boolean;
  payment_method_public_id: string | null;
  message: string | null;
}

export interface LeaseBookingWidgetProps {
  spacePublicId: string;
  spaceType: "private_office" | "suite";
  spaceCapacity: number;
  bookingMode: LeaseBookingMode;
  spaceMonthlyPrice: MoneyValue | null;
  buildLoginNextHref: (params: { planPublicId: string | null; moveInDate: string }) => string;
  initialPlanPublicId?: string;
  initialMoveInDate?: string;
}

export function LeaseBookingWidget({
  spacePublicId,
  spaceType,
  spaceCapacity,
  bookingMode,
  spaceMonthlyPrice,
  buildLoginNextHref,
  initialPlanPublicId,
  initialMoveInDate,
}: LeaseBookingWidgetProps) {
  const router = useRouter();
  const isAuthenticated = Boolean(getAccessToken());
  const [plans, setPlans] = useState<MembershipPlanPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [moveInDate, setMoveInDate] = useState<string>(initialMoveInDate || DATE_INPUT_FALLBACK());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch<MembershipPlanPublic[]>(
      `/api/membership-plans/public?space_public_id=${encodeURIComponent(spacePublicId)}&booking_mode=${bookingMode}`,
      { method: "GET" },
    )
      .then((response) => {
        const sorted = [...response].sort((a, b) => {
          const aMonths = a.commitment_months ?? 0;
          const bMonths = b.commitment_months ?? 0;
          return aMonths - bMonths;
        });
        setPlans(sorted);
        if (initialPlanPublicId && sorted.some((p) => p.public_id === initialPlanPublicId)) {
          setSelectedPlanId(initialPlanPublicId);
        } else {
          const longest = sorted[sorted.length - 1];
          setSelectedPlanId(longest?.public_id ?? "");
        }
      })
      .catch(() => {
        setPlans([]);
        setSelectedPlanId("");
      })
      .finally(() => setLoading(false));
  }, [spacePublicId, bookingMode, initialPlanPublicId]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.public_id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );
  const baselinePlan = useMemo(() => findBaselinePlan(plans), [plans]);
  const savingsPercent = useMemo(
    () => (selectedPlan ? computeMonthlySavingsPercent(selectedPlan, baselinePlan) : null),
    [selectedPlan, baselinePlan],
  );

  const availableSeats = selectedPlan?.available_seats ?? null;
  const isFullyLeased = availableSeats === 0;
  const seatNoun = spaceType === "suite" ? "suite" : "office";

  async function submitLeaseRequest(paymentMethodPublicId: string) {
    if (!selectedPlan) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(
        "/api/booking-requests",
        {
          method: "POST",
          body: JSON.stringify({
            membership_plan_public_id: selectedPlan.public_id,
            desired_start_date: moveInDate,
            seats_requested: 1,
            member_owner_payment_method_public_id: paymentMethodPublicId,
            payment_authorization_consent: true,
          }),
        },
        getAccessToken() ?? undefined,
      );
      router.push("/member/requests");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lease request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContinue() {
    if (!selectedPlan) {
      setError("Choose a term before continuing.");
      return;
    }
    if (!moveInDate) {
      setError("Choose a move-in date.");
      return;
    }
    setError("");

    if (!isAuthenticated) {
      router.push(
        buildLoginHref(
          buildLoginNextHref({
            planPublicId: selectedPlan.public_id,
            moveInDate,
          }),
        ),
      );
      return;
    }

    setSubmitting(true);
    try {
      const token = getAccessToken() ?? undefined;
      const resolved = await apiFetch<PaymentMethodResolve>(
        `/api/payment-methods/resolve?space_public_id=${encodeURIComponent(spacePublicId)}`,
        { method: "GET" },
        token,
      );
      if (!resolved.is_configured) {
        throw new Error(resolved.message || "This owner has not configured payments.");
      }
      if (!resolved.has_payment_method) {
        setPaymentMethodOpen(true);
        return;
      }
      await submitLeaseRequest(resolved.payment_method_public_id!);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lease request failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[24px] border border-slate-200 p-5 text-sm text-slate-500">
        Loading lease terms…
      </div>
    );
  }

  if (plans.length === 0) {
    const fallback = spaceMonthlyPrice != null ? formatUsd(spaceMonthlyPrice, "/mo") : "Contact for pricing";
    return (
      <div className="rounded-[24px] border border-slate-200 p-5">
        <div className="text-center text-3xl font-semibold text-slate-900">{fallback}</div>
        <p className="mt-3 text-sm text-slate-600">
          Lease terms haven’t been published yet for this {seatNoun}.
        </p>
        <button
          type="button"
          disabled
          className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-slate-200 px-6 text-sm font-semibold text-slate-500"
        >
          Contact owner for pricing
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-slate-200 p-5">
      {isFullyLeased ? (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700">
          <TriangleAlert className="h-4 w-4" />
          Currently leased ({spaceCapacity}-seat {seatNoun})
        </div>
      ) : (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
          Available ({spaceCapacity}-seat {seatNoun})
        </div>
      )}

      <label className="mb-3 grid gap-1">
        <span className="sr-only">Term</span>
        <div className="relative">
          <Tag className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <select
            value={selectedPlanId}
            onChange={(event) => setSelectedPlanId(event.target.value)}
            className="h-12 w-full appearance-none rounded-full border border-slate-200 bg-white pl-11 pr-10 text-sm font-semibold text-slate-900 outline-none"
          >
            {plans.map((plan) => (
              <option key={plan.public_id} value={plan.public_id}>
                {termLabel(plan.commitment_months)}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className="mb-4 grid gap-1">
        <span className="sr-only">Move-in date</span>
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="date"
            value={moveInDate}
            min={DATE_INPUT_FALLBACK()}
            onChange={(event) => setMoveInDate(event.target.value)}
            className="h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none"
          />
        </div>
      </label>

      {selectedPlan ? (
        <div className="mb-5 rounded-[20px] border border-slate-100 bg-white px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-900">Monthly price</span>
                {savingsPercent != null ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    Save {savingsPercent}%
                  </span>
                ) : null}
              </div>
              {savingsPercent != null && baselinePlan ? (
                <div className="mt-1 text-xs text-slate-500">Month-to-month price</div>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold text-slate-900">
                {formatLeasePrice(selectedPlan.price_cents, selectedPlan.billing_cycle)}
              </div>
              {savingsPercent != null && baselinePlan ? (
                <div className="mt-1 text-sm text-slate-400 line-through">
                  {formatLeasePrice(baselinePlan.price_cents, baselinePlan.billing_cycle)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}

      <button
        type="button"
        onClick={handleContinue}
        disabled={submitting || !selectedPlan || isFullyLeased}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-teal-900 px-6 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? "Submitting…"
          : isFullyLeased
            ? "Currently leased"
            : isAuthenticated
              ? "Continue to Checkout Summary"
              : "Sign in to continue"}
      </button>

      <PaymentMethodModal
        open={paymentMethodOpen}
        spacePublicId={spacePublicId}
        onClose={() => setPaymentMethodOpen(false)}
        onSaved={(paymentMethodPublicId) => {
          setPaymentMethodOpen(false);
          submitLeaseRequest(paymentMethodPublicId);
        }}
      />
    </div>
  );
}
