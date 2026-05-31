"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LeaseSpaceType = "private_office" | "suite" | "shared_desk" | "virtual_office";
type LeaseBookingMode = "private_office_lease" | "suite_lease" | "monthly_membership" | "virtual_membership";

interface OwnerMembershipPlan {
  public_id: string;
  booking_mode: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_cycle: string;
  commitment_months: number | null;
  auto_renew: boolean;
  included_meeting_room_hours_per_month: number;
  overage_hourly_rate_cents: number | null;
  seats_per_plan: number;
  max_active_subscriptions: number | null;
  is_active: boolean;
  sort_order: number;
}

interface FormState {
  commitment_months: string;
  monthly_price: string;
  name: string;
  seats_per_plan: string;
  max_active_subscriptions: string;
}

interface LeaseTermsManagerProps {
  spacePublicId: string;
  spaceType: LeaseSpaceType;
  spaceCapacity: number;
}

function bookingModeFor(spaceType: LeaseSpaceType): LeaseBookingMode {
  if (spaceType === "suite") return "suite_lease";
  if (spaceType === "shared_desk") return "monthly_membership";
  if (spaceType === "virtual_office") return "virtual_membership";
  return "private_office_lease";
}

function defaultName(commitmentMonths: number | null) {
  if (commitmentMonths == null) return "Month-to-month";
  return `${commitmentMonths}-month Term`;
}

function emptyForm(spaceCapacity: number): FormState {
  return {
    commitment_months: "",
    monthly_price: "",
    name: "",
    seats_per_plan: String(spaceCapacity || 1),
    max_active_subscriptions: "",
  };
}

export function LeaseTermsManager({ spacePublicId, spaceType, spaceCapacity }: LeaseTermsManagerProps) {
  const bookingMode = bookingModeFor(spaceType);
  const recurringLabel =
    spaceType === "shared_desk"
      ? "Membership Terms"
      : spaceType === "virtual_office"
        ? "Virtual Membership Terms"
        : "Lease Terms";
  const itemLabel =
    spaceType === "suite"
      ? "suite"
      : spaceType === "private_office"
        ? "office"
        : spaceType === "virtual_office"
          ? "virtual office"
          : "shared desk membership";
  const [plans, setPlans] = useState<OwnerMembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(spaceCapacity));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPlans() {
    const token = getAccessToken() ?? undefined;
    setLoading(true);
    try {
      const list = await apiFetch<OwnerMembershipPlan[]>(
        `/api/membership-plans?space_public_id=${encodeURIComponent(spacePublicId)}`,
        { method: "GET" },
        token,
      );
      setPlans(list.filter((p) => p.booking_mode === bookingMode));
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to load lease terms");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!spacePublicId) return;
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spacePublicId, bookingMode]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm(spaceCapacity));
    setShowForm(true);
    setMessage("");
  }

  function startEdit(plan: OwnerMembershipPlan) {
    setEditingId(plan.public_id);
    setForm({
      commitment_months: plan.commitment_months != null ? String(plan.commitment_months) : "",
      monthly_price: String(Math.round(plan.price_cents / 100)),
      name: plan.name,
      seats_per_plan: String(plan.seats_per_plan),
      max_active_subscriptions:
        plan.max_active_subscriptions != null ? String(plan.max_active_subscriptions) : "",
    });
    setShowForm(true);
    setMessage("");
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setMessage("");
  }

  async function handleSubmit() {
    const token = getAccessToken() ?? undefined;
    const monthlyPrice = Number(form.monthly_price);
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
      setMessage("Monthly price must be greater than zero.");
      return;
    }
    const commitmentMonths = form.commitment_months.trim()
      ? Number(form.commitment_months)
      : null;
    if (commitmentMonths != null && (!Number.isInteger(commitmentMonths) || commitmentMonths < 1)) {
      setMessage("Term length must be a whole number of months.");
      return;
    }
    const seatsPerPlan = Number(form.seats_per_plan || spaceCapacity || 1);
    if (!Number.isInteger(seatsPerPlan) || seatsPerPlan < 1) {
      setMessage("Seats per plan must be at least 1.");
      return;
    }
    const maxActiveSubscriptions = form.max_active_subscriptions.trim()
      ? Number(form.max_active_subscriptions)
      : null;
    if (
      maxActiveSubscriptions != null &&
      (!Number.isInteger(maxActiveSubscriptions) || maxActiveSubscriptions < 1)
    ) {
      setMessage("Max active subscriptions must be at least 1.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      if (editingId) {
        await apiFetch(
          `/api/membership-plans/${editingId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: form.name.trim() || defaultName(commitmentMonths),
              price_cents: Math.round(monthlyPrice * 100),
              commitment_months: commitmentMonths,
              seats_per_plan: seatsPerPlan,
              max_active_subscriptions: maxActiveSubscriptions,
            }),
          },
          token,
        );
      } else {
        const isFirstPlan = plans.length === 0;
        await apiFetch(
          "/api/membership-plans",
          {
            method: "POST",
            body: JSON.stringify({
              space_public_id: spacePublicId,
              booking_mode: bookingMode,
              name: form.name.trim() || defaultName(commitmentMonths),
              price_cents: Math.round(monthlyPrice * 100),
              billing_cycle: "monthly",
              commitment_months: commitmentMonths,
              seats_per_plan: seatsPerPlan,
              max_active_subscriptions: maxActiveSubscriptions,
              is_active: true,
            }),
          },
          token,
        );
        if (isFirstPlan) {
          await apiFetch(
            `/api/spaces/${spacePublicId}/booking-modes`,
            {
              method: "PUT",
              body: JSON.stringify({ booking_mode: bookingMode, is_enabled: true }),
            },
            token,
          );
        }
      }
      setShowForm(false);
      setEditingId(null);
      await loadPlans();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to save lease term");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(plan: OwnerMembershipPlan) {
    const token = getAccessToken() ?? undefined;
    setMessage("");
    try {
      if (plan.is_active) {
        await apiFetch(
          `/api/membership-plans/${plan.public_id}`,
          { method: "DELETE" },
          token,
        );
      } else {
        await apiFetch(
          `/api/membership-plans/${plan.public_id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ is_active: true }),
          },
          token,
        );
      }
      await loadPlans();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to update lease term");
    }
  }

  return (
    <div className="grid gap-4 rounded-md border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{recurringLabel}</h3>
          <p className="text-sm text-textSecondary">
            Configure the term lengths and monthly prices members can buy for this {itemLabel}.
          </p>
        </div>
        {!showForm ? (
          <Button type="button" size="sm" onClick={startCreate}>
            Add term
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="text-sm text-textMuted">Loading lease terms...</div>
      ) : plans.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-textSecondary">
          No lease terms yet. Add one to publish monthly pricing on the public listing.
        </div>
      ) : (
        <div className="grid gap-2">
          {plans.map((plan) => (
            <div
              key={plan.public_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-white p-3"
            >
              <div className="grid gap-1">
                <div className="text-sm font-semibold text-textPrimary">
                  {plan.commitment_months != null
                    ? `${plan.commitment_months}-month`
                    : "Month-to-month"}
                  <span className="ml-2 text-textSecondary">— {plan.name}</span>
                </div>
                <div className="text-xs text-textMuted">
                  ${(plan.price_cents / 100).toLocaleString()}/mo • {plan.seats_per_plan}{" "}
                  seat{plan.seats_per_plan === 1 ? "" : "s"} per plan
                  {plan.max_active_subscriptions != null
                    ? ` • cap ${plan.max_active_subscriptions}`
                    : ""}
                  {plan.is_active ? "" : " • inactive"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => startEdit(plan)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant={plan.is_active ? "destructive" : "secondary"}
                  size="sm"
                  onClick={() => handleToggleActive(plan)}
                >
                  {plan.is_active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="grid gap-4 rounded-md border border-border bg-white p-4">
          <div className="text-sm font-semibold">{editingId ? "Edit lease term" : "New lease term"}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="commitment_months">Term length (months)</Label>
              <Input
                id="commitment_months"
                inputMode="numeric"
                placeholder="Leave blank for month-to-month"
                value={form.commitment_months}
                onChange={(e) => setForm({ ...form, commitment_months: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="monthly_price">Monthly price ($)</Label>
              <Input
                id="monthly_price"
                inputMode="decimal"
                placeholder="4085"
                value={form.monthly_price}
                onChange={(e) => setForm({ ...form, monthly_price: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="seats_per_plan">Seats per plan</Label>
              <Input
                id="seats_per_plan"
                inputMode="numeric"
                value={form.seats_per_plan}
                onChange={(e) => setForm({ ...form, seats_per_plan: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="max_active_subscriptions">Max active subscriptions</Label>
              <Input
                id="max_active_subscriptions"
                inputMode="numeric"
                placeholder="Unlimited"
                value={form.max_active_subscriptions}
                onChange={(e) => setForm({ ...form, max_active_subscriptions: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lease_name">Display name (optional)</Label>
            <Input
              id="lease_name"
              placeholder={defaultName(form.commitment_months ? Number(form.commitment_months) : null)}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          {message ? <div className="text-sm text-error">{message}</div> : null}
          <div className="flex gap-2">
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving…" : editingId ? "Save changes" : "Add term"}
            </Button>
            <Button type="button" variant="secondary" onClick={cancelForm} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {!showForm && message ? <div className="text-sm text-error">{message}</div> : null}
    </div>
  );
}
