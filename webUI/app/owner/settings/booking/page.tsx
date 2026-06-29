"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { SettingsSection } from "@/app/owner/settings/_components/settings-section";
import { useOwnerOrg } from "@/app/owner/settings/_components/owner-org-provider";

interface BookingSettings {
  public_id: string;
  name: string;
  booking_approval_mode: "manual" | "auto";
  membership_lease_approval_mode: "manual" | "auto";
  payment_failure_hold_minutes: number;
  waitlist_enabled: boolean;
  waitlist_conference_room_enabled: boolean;
  waitlist_private_office_enabled: boolean;
  waitlist_shared_desk_enabled: boolean;
  waitlist_suite_enabled: boolean;
  waitlist_virtual_office_enabled: boolean;
}

interface CancellationPolicy {
  public_id: string;
  space_type: string;
  cancel_window_hours: number;
  refund_percent: number;
  tiers: Array<{
    public_id?: string | null;
    min_hours_before_start: number;
    refund_percent: number;
    sort_order?: number;
  }>;
}

type WaitlistTypeKey =
  | "waitlist_conference_room_enabled"
  | "waitlist_private_office_enabled"
  | "waitlist_shared_desk_enabled"
  | "waitlist_suite_enabled"
  | "waitlist_virtual_office_enabled";

const WAITLIST_TYPE_OPTIONS: Array<{ key: WaitlistTypeKey; label: string; summary: string }> = [
  { key: "waitlist_conference_room_enabled", label: "Conference room", summary: "Conference rooms" },
  { key: "waitlist_private_office_enabled", label: "Private office", summary: "Private offices" },
  { key: "waitlist_shared_desk_enabled", label: "Shared desk", summary: "Shared desks" },
  { key: "waitlist_suite_enabled", label: "Suite", summary: "Suites" },
  { key: "waitlist_virtual_office_enabled", label: "Virtual office", summary: "Virtual offices" },
];

function waitlistSummary(
  settings: (Pick<BookingSettings, WaitlistTypeKey> & { waitlist_enabled?: boolean }) | null
) {
  if (!settings) return "off";
  const enabled = WAITLIST_TYPE_OPTIONS.filter((option) => settings[option.key]).map(
    (option) => option.summary
  );
  if (enabled.length > 0) return enabled.join(", ");
  return settings.waitlist_enabled ? "All space types" : "off";
}

export default function OwnerBookingRulesPage() {
  const { orgId } = useOwnerOrg();
  const [message, setMessage] = useState("");
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);

  const [bookingSettingsForm, setBookingSettingsForm] = useState({
    booking_approval_mode: "manual" as "manual" | "auto",
    membership_lease_approval_mode: "manual" as "manual" | "auto",
    payment_failure_hold_minutes: "30",
    waitlist_conference_room_enabled: false,
    waitlist_private_office_enabled: false,
    waitlist_shared_desk_enabled: false,
    waitlist_suite_enabled: false,
    waitlist_virtual_office_enabled: false,
  });
  const [policyForm, setPolicyForm] = useState({
    space_type: "conference_room",
    tiers: [
      { min_hours_before_start: "48", refund_percent: "100" },
      { min_hours_before_start: "24", refund_percent: "50" },
      { min_hours_before_start: "0", refund_percent: "0" },
    ],
  });

  async function loadBookingSettings() {
    if (!orgId) {
      setBookingSettings(null);
      setBookingSettingsForm({
        booking_approval_mode: "manual",
        membership_lease_approval_mode: "manual",
        payment_failure_hold_minutes: "30",
        waitlist_conference_room_enabled: false,
        waitlist_private_office_enabled: false,
        waitlist_shared_desk_enabled: false,
        waitlist_suite_enabled: false,
        waitlist_virtual_office_enabled: false,
      });
      return;
    }
    const token = getAccessToken() ?? undefined;
    const settings = await apiFetch<BookingSettings>(
      `/api/orgs/${orgId}/booking-settings`,
      { method: "GET" },
      token
    );
    setBookingSettings(settings);
    setBookingSettingsForm({
      booking_approval_mode: settings.booking_approval_mode,
      membership_lease_approval_mode: settings.membership_lease_approval_mode ?? "manual",
      payment_failure_hold_minutes: String(settings.payment_failure_hold_minutes),
      waitlist_conference_room_enabled: Boolean(settings.waitlist_conference_room_enabled),
      waitlist_private_office_enabled: Boolean(settings.waitlist_private_office_enabled),
      waitlist_shared_desk_enabled: Boolean(settings.waitlist_shared_desk_enabled),
      waitlist_suite_enabled: Boolean(settings.waitlist_suite_enabled),
      waitlist_virtual_office_enabled: Boolean(settings.waitlist_virtual_office_enabled),
    });
  }

  async function loadPolicies() {
    if (!orgId) {
      setPolicies([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<CancellationPolicy[]>(
      `/api/cancellation-policies?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token
    );
    setPolicies(list);
  }

  useEffect(() => {
    loadBookingSettings().catch(() => null);
    loadPolicies().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function saveBookingSettings() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    const saved = await apiFetch<BookingSettings>(
      `/api/orgs/${orgId}/booking-settings`,
      {
        method: "PATCH",
        body: JSON.stringify({
          booking_approval_mode: bookingSettingsForm.booking_approval_mode,
          membership_lease_approval_mode: bookingSettingsForm.membership_lease_approval_mode,
          payment_failure_hold_minutes: Number(bookingSettingsForm.payment_failure_hold_minutes),
          waitlist_conference_room_enabled: bookingSettingsForm.waitlist_conference_room_enabled,
          waitlist_private_office_enabled: bookingSettingsForm.waitlist_private_office_enabled,
          waitlist_shared_desk_enabled: bookingSettingsForm.waitlist_shared_desk_enabled,
          waitlist_suite_enabled: bookingSettingsForm.waitlist_suite_enabled,
          waitlist_virtual_office_enabled: bookingSettingsForm.waitlist_virtual_office_enabled,
        }),
      },
      token
    );
    setBookingSettings(saved);
    setBookingSettingsForm({
      booking_approval_mode: saved.booking_approval_mode,
      membership_lease_approval_mode: saved.membership_lease_approval_mode ?? "manual",
      payment_failure_hold_minutes: String(saved.payment_failure_hold_minutes),
      waitlist_conference_room_enabled: Boolean(saved.waitlist_conference_room_enabled),
      waitlist_private_office_enabled: Boolean(saved.waitlist_private_office_enabled),
      waitlist_shared_desk_enabled: Boolean(saved.waitlist_shared_desk_enabled),
      waitlist_suite_enabled: Boolean(saved.waitlist_suite_enabled),
      waitlist_virtual_office_enabled: Boolean(saved.waitlist_virtual_office_enabled),
    });
    setMessage("Booking approval settings saved");
  }

  function updatePolicyTier(
    index: number,
    field: "min_hours_before_start" | "refund_percent",
    value: string
  ) {
    setPolicyForm((current) => ({
      ...current,
      tiers: current.tiers.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, [field]: value } : tier
      ),
    }));
  }

  async function createPolicy() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    const tiers = policyForm.tiers
      .map((tier) => ({
        min_hours_before_start: Number(tier.min_hours_before_start || 0),
        refund_percent: Number(tier.refund_percent || 0),
      }))
      .filter((tier) => !Number.isNaN(tier.min_hours_before_start) && !Number.isNaN(tier.refund_percent))
      .sort((a, b) => b.min_hours_before_start - a.min_hours_before_start);
    await apiFetch(
      `/api/cancellation-policies?organization_public_id=${encodeURIComponent(orgId)}`,
      {
        method: "POST",
        body: JSON.stringify({
          space_type: policyForm.space_type,
          cancel_window_hours: tiers[0]?.min_hours_before_start ?? 0,
          refund_percent: tiers[0]?.refund_percent ?? 0,
          tiers,
        }),
      },
      token
    );
    setMessage("Cancellation policy saved");
    await loadPolicies();
  }

  return (
    <div className="grid gap-5">
      {message ? <p className="text-[13px] text-text-3">{message}</p> : null}

      <SettingsSection
        title="Booking approval"
        description="Decide whether booking requests are approved automatically or need your review, and how long to hold a booking when a payment fails."
      >
        <p className="text-[12px] text-text-3">
          Current: Hourly/day-pass{" "}
          {bookingSettings?.booking_approval_mode === "auto" ? "auto approve" : "manual approval"} •
          Membership &amp; lease{" "}
          {bookingSettings?.membership_lease_approval_mode === "auto"
            ? "auto approve"
            : "manual approval"}{" "}
          •{" "}
          {bookingSettings?.payment_failure_hold_minutes === 0
            ? "Cancel failed payments immediately"
            : `${bookingSettings?.payment_failure_hold_minutes ?? 30} min payment recovery hold`}{" "}
          • Waitlist: {waitlistSummary(bookingSettings)}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field
            label="Hourly/day-pass approval"
            htmlFor="booking-approval-mode"
            hint="Auto-approve to confirm short bookings instantly; manual to review each one."
          >
            <select
              id="booking-approval-mode"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-[13px] text-text"
              value={bookingSettingsForm.booking_approval_mode}
              onChange={(event) =>
                setBookingSettingsForm((current) => ({
                  ...current,
                  booking_approval_mode: event.target.value as "manual" | "auto",
                }))
              }
            >
              <option value="manual">Manual approval</option>
              <option value="auto">Auto approve</option>
            </select>
          </Field>
          <Field
            label="Membership & lease approval"
            htmlFor="membership-lease-approval-mode"
            hint="Controls recurring memberships and longer leases separately from short bookings."
          >
            <select
              id="membership-lease-approval-mode"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-[13px] text-text"
              value={bookingSettingsForm.membership_lease_approval_mode}
              onChange={(event) =>
                setBookingSettingsForm((current) => ({
                  ...current,
                  membership_lease_approval_mode: event.target.value as "manual" | "auto",
                }))
              }
            >
              <option value="manual">Manual approval</option>
              <option value="auto">Auto approve</option>
            </select>
          </Field>
          <Field
            label="Payment failure recovery"
            htmlFor="payment-hold-minutes"
            hint="How long to keep a booking reserved while the member retries a failed payment before it's cancelled."
          >
            <select
              id="payment-hold-minutes"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-[13px] text-text"
              value={bookingSettingsForm.payment_failure_hold_minutes}
              onChange={(event) =>
                setBookingSettingsForm((current) => ({
                  ...current,
                  payment_failure_hold_minutes: event.target.value,
                }))
              }
            >
              <option value="0">Cancel immediately</option>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="60">60 min</option>
            </select>
          </Field>
        </div>
        <fieldset className="grid gap-2">
          <legend className="flex items-center gap-1.5 text-[13px] font-medium text-text-2">
            Waitlist by space type
            <InfoHint label="When a space type is full, members can join a waitlist and are notified if a slot opens up. Enable it only for the space types you want to offer this for." />
          </legend>
          <p className="text-[11px] text-text-3">
            Members can join a waitlist for the space types you enable here.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {WAITLIST_TYPE_OPTIONS.map((option) => (
              <label
                key={option.key}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-text"
              >
                <input
                  type="checkbox"
                  checked={bookingSettingsForm[option.key]}
                  onChange={(event) =>
                    setBookingSettingsForm((current) => ({
                      ...current,
                      [option.key]: event.target.checked,
                    }))
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Button type="button" onClick={saveBookingSettings} disabled={!orgId}>
            Save booking approval
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Cancellation policies"
        description="Set refund tiers per space type: how much a member is refunded based on how far ahead of the start time they cancel."
      >
        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-start">
          <Field label="Space type" htmlFor="policy-space-type">
            <select
              id="policy-space-type"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-text"
              value={policyForm.space_type}
              onChange={(event) => setPolicyForm({ ...policyForm, space_type: event.target.value })}
            >
              <option value="conference_room">Conference Room</option>
              <option value="private_office">Private Office</option>
              <option value="shared_desk">Shared Desk</option>
              <option value="virtual_office">Virtual Office</option>
            </select>
          </Field>
          <div className="grid gap-2">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-text-2">
              Refund tiers
              <InfoHint label="Each tier means: if a member cancels at least this many hours before the start time, they get this refund percentage. Tiers are sorted from earliest to latest automatically." />
            </div>
            {policyForm.tiers.map((tier, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={tier.min_hours_before_start}
                  onChange={(event) =>
                    updatePolicyTier(index, "min_hours_before_start", event.target.value)
                  }
                  placeholder="Hours before start"
                />
                <Input
                  value={tier.refund_percent}
                  onChange={(event) => updatePolicyTier(index, "refund_percent", event.target.value)}
                  placeholder="Refund %"
                />
              </div>
            ))}
          </div>
          <Button type="button" onClick={createPolicy} disabled={!orgId}>
            Add policy
          </Button>
        </div>
        <div className="grid gap-2 text-[12px] text-text-3">
          {policies.map((policy) => (
            <div key={policy.public_id}>
              {policy.space_type} •{" "}
              {(policy.tiers?.length
                ? policy.tiers
                : [
                    {
                      min_hours_before_start: policy.cancel_window_hours,
                      refund_percent: policy.refund_percent,
                    },
                  ]
              )
                .slice()
                .sort((a, b) => b.min_hours_before_start - a.min_hours_before_start)
                .map((tier) => `${tier.refund_percent}% at ${tier.min_hours_before_start}+h`)
                .join(" / ")}
            </div>
          ))}
          {policies.length === 0 ? <div>No cancellation policies configured.</div> : null}
        </div>
      </SettingsSection>
    </div>
  );
}
