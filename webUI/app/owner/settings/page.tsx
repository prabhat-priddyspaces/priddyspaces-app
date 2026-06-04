"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { OrganizationAmenitiesManager } from "@/components/organization-amenities-manager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Organization {
  public_id: string;
  name: string;
  branding: string | null;
  review_status: string;
  review_notes: string | null;
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

interface PromoCode {
  public_id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  expires_at: string | null;
  max_redemptions: number | null;
  max_redemptions_per_member: number | null;
  total_redemptions: number;
  is_active: boolean;
  total_discount_granted_cents: number;
  revenue_impacted_cents: number;
  status: string | null;
}

interface TaxConfig {
  public_id: string;
  rate_percent: number;
}

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

function waitlistSummary(settings: (Pick<BookingSettings, WaitlistTypeKey> & { waitlist_enabled?: boolean }) | null) {
  if (!settings) return "off";
  const enabled = WAITLIST_TYPE_OPTIONS.filter((option) => settings[option.key]).map((option) => option.summary);
  if (enabled.length > 0) return enabled.join(", ");
  return settings.waitlist_enabled ? "All space types" : "off";
}

const centsFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatCents(cents: number | null | undefined) {
  return centsFormatter.format((cents || 0) / 100);
}

export default function OwnerSettingsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [taxConfig, setTaxConfig] = useState<TaxConfig | null>(null);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);
  const [orgProfileForm, setOrgProfileForm] = useState({ name: "", branding: "" });

  const [promoForm, setPromoForm] = useState({
    code: "",
    discount_type: "percent",
    discount_value: "",
    description: "",
    expires_at: "",
    max_redemptions: "",
    max_redemptions_per_member: "",
    is_active: true,
  });
  const [taxRate, setTaxRate] = useState("");
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

  useEffect(() => {
    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      try {
        const list = await apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token);
        setOrgs(list);
        if (list.length > 0) {
          setOrgId((current) => current || list[0].public_id);
        }
      } catch (err: unknown) {
        setMessage(err instanceof Error ? err.message : "Failed to load organizations");
      } finally {
        setLoading(false);
      }
    }

    loadOrgs().catch(() => null);
  }, []);

  async function loadPromoCodes() {
    if (!orgId) {
      setPromoCodes([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<PromoCode[]>(
      `/api/promo-codes?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token
    );
    setPromoCodes(list);
  }

  async function loadTaxConfig() {
    if (!orgId) {
      setTaxConfig(null);
      return;
    }
    const token = getAccessToken() ?? undefined;
    try {
      const cfg = await apiFetch<TaxConfig>(
        `/api/tax-config?organization_public_id=${encodeURIComponent(orgId)}`,
        { method: "GET" },
        token
      );
      setTaxConfig(cfg);
      setTaxRate(String(cfg.rate_percent));
    } catch {
      setTaxConfig(null);
      setTaxRate("");
    }
  }

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

  async function saveOrganizationProfile() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/orgs/${orgId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: orgProfileForm.name,
          branding: orgProfileForm.branding,
        }),
      },
      token
    );
    setMessage("Organization profile saved");
    const refreshed = await apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token);
    setOrgs(refreshed);
  }

  async function resubmitOrganization() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/orgs/${orgId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: orgProfileForm.name,
          branding: orgProfileForm.branding,
          resubmit_for_review: true,
        }),
      },
      token
    );
    setMessage("Organization resubmitted for review");
    const refreshed = await apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token);
    setOrgs(refreshed);
  }

  useEffect(() => {
    loadPromoCodes().catch(() => null);
    loadTaxConfig().catch(() => null);
    loadBookingSettings().catch(() => null);
    loadPolicies().catch(() => null);
  }, [orgId]);

  async function createPromoCode() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/promo-codes?organization_public_id=${encodeURIComponent(orgId)}`,
      {
        method: "POST",
        body: JSON.stringify({
          code: promoForm.code,
          discount_type: promoForm.discount_type,
          discount_value: Number(promoForm.discount_value),
          description: promoForm.description || null,
          expires_at: promoForm.expires_at ? new Date(promoForm.expires_at).toISOString() : null,
          max_redemptions: promoForm.max_redemptions ? Number(promoForm.max_redemptions) : null,
          max_redemptions_per_member: promoForm.max_redemptions_per_member
            ? Number(promoForm.max_redemptions_per_member)
            : null,
          is_active: promoForm.is_active,
        }),
      },
      token
    );
    setMessage("Promo code created");
    setPromoForm({
      code: "",
      discount_type: "percent",
      discount_value: "",
      description: "",
      expires_at: "",
      max_redemptions: "",
      max_redemptions_per_member: "",
      is_active: true,
    });
    await loadPromoCodes();
  }

  async function saveTaxConfig() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/tax-config?organization_public_id=${encodeURIComponent(orgId)}`,
      {
        method: "POST",
        body: JSON.stringify({ rate_percent: Number(taxRate) }),
      },
      token
    );
    setMessage("Tax config saved");
    await loadTaxConfig();
  }

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
    value: string,
  ) {
    setPolicyForm((current) => ({
      ...current,
      tiers: current.tiers.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, [field]: value } : tier,
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

  const selectedOrg = useMemo(() => orgs.find((org) => org.public_id === orgId) || null, [orgId, orgs]);

  useEffect(() => {
    if (!selectedOrg) {
      setOrgProfileForm({ name: "", branding: "" });
      return;
    }
    setOrgProfileForm({
      name: selectedOrg.name,
      branding: selectedOrg.branding ?? "",
    });
  }, [selectedOrg]);

  return (
    <AppShell title="Organization settings" breadcrumb={["Owner", "Organization"]}>
      <div className="grid gap-6">
        <p className="text-[13px] text-text-3 max-w-xl">
          Promotions, tax, cancellation rules, and booking approval settings.
        </p>

        {message ? <div className="text-[13px] text-text-3">{message}</div> : null}

        <Card className="grid gap-4 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="org">Organization</Label>
              <select
                id="org"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                disabled={loading}
              >
                <option value="">Select an organization</option>
                {orgs.map((org) => (
                  <option key={org.public_id} value={org.public_id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Current scope</Label>
              <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-textSecondary">
                Organization-wide settings
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 text-xs text-textMuted">
            <div>Promo codes: {promoCodes.length}</div>
            <div>Cancellation policies: {policies.length}</div>
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Organization profile</div>
              <div className="text-xs text-textMuted">
                Review status: {selectedOrg?.review_status || "not available"}
                {selectedOrg?.review_notes ? ` • ${selectedOrg.review_notes}` : ""}
              </div>
            </div>
            {selectedOrg?.review_status === "rejected" ? (
              <Button type="button" variant="secondary" onClick={resubmitOrganization}>
                Resubmit for review
              </Button>
            ) : null}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              value={orgProfileForm.name}
              onChange={(e) => setOrgProfileForm((current) => ({ ...current, name: e.target.value }))}
              placeholder="Organization name"
            />
            <Input
              value={orgProfileForm.branding}
              onChange={(e) => setOrgProfileForm((current) => ({ ...current, branding: e.target.value }))}
              placeholder="Branding URL or notes"
            />
          </div>
          <div>
            <Button type="button" onClick={saveOrganizationProfile} disabled={!orgId}>
              Save organization profile
            </Button>
          </div>
        </Card>

        <OrganizationAmenitiesManager orgId={orgId} />

        <Card className="grid gap-4 p-4">
          <div className="text-sm font-semibold">Promo codes</div>
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              value={promoForm.code}
              onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
              placeholder="CODE"
            />
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              value={promoForm.discount_type}
              onChange={(e) => setPromoForm({ ...promoForm, discount_type: e.target.value })}
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed</option>
            </select>
            <Input
              value={promoForm.discount_value}
              onChange={(e) => setPromoForm({ ...promoForm, discount_value: e.target.value })}
              placeholder={promoForm.discount_type === "fixed" ? "Fixed amount ($)" : "Percent"}
            />
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              value={promoForm.is_active ? "active" : "inactive"}
              onChange={(e) => setPromoForm({ ...promoForm, is_active: e.target.value === "active" })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <Input
              value={promoForm.description}
              onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })}
              placeholder="Description"
            />
            <Input
              type="date"
              value={promoForm.expires_at}
              onChange={(e) => setPromoForm({ ...promoForm, expires_at: e.target.value })}
            />
            <Input
              value={promoForm.max_redemptions}
              onChange={(e) => setPromoForm({ ...promoForm, max_redemptions: e.target.value })}
              placeholder="Max redemptions"
            />
            <Input
              value={promoForm.max_redemptions_per_member}
              onChange={(e) => setPromoForm({ ...promoForm, max_redemptions_per_member: e.target.value })}
              placeholder="Max per member"
            />
            <Button type="button" onClick={createPromoCode} disabled={!orgId}>
              Add promo
            </Button>
          </div>
          <div className="grid gap-2 text-xs text-textMuted">
            {promoCodes.map((promo) => (
              <div key={promo.public_id} className="rounded-md border border-border p-3">
                <div className="font-semibold text-textPrimary">
                  {promo.code} • {promo.discount_type === "fixed" ? `$${promo.discount_value}` : `${promo.discount_value}%`} •{" "}
                  {promo.status || (promo.is_active ? "active" : "inactive")}
                </div>
                {promo.description ? <div>{promo.description}</div> : null}
                <div>
                  Used {promo.total_redemptions || 0}
                  {promo.max_redemptions ? ` / ${promo.max_redemptions}` : ""} • Per member{" "}
                  {promo.max_redemptions_per_member || "unlimited"} • Expires{" "}
                  {promo.expires_at ? new Date(promo.expires_at).toLocaleDateString() : "never"}
                </div>
                <div>
                  Discounts {formatCents(promo.total_discount_granted_cents)} • Revenue impacted{" "}
                  {formatCents(promo.revenue_impacted_cents)}
                </div>
              </div>
            ))}
            {promoCodes.length === 0 ? <div>No promo codes configured.</div> : null}
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="text-sm font-semibold">Tax configuration</div>
          <div className="grid gap-2 md:grid-cols-3">
            <Input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="Rate %" />
            <Button type="button" onClick={saveTaxConfig} disabled={!orgId}>
              Save tax
            </Button>
          </div>
          <div className="text-xs text-textMuted">
            Current: {taxConfig ? `${taxConfig.rate_percent}%` : "Not set"}
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Booking approval</div>
              <div className="text-xs text-textMuted">
                Current: Hourly/day-pass{" "}
                {bookingSettings?.booking_approval_mode === "auto" ? "auto approve" : "manual approval"} • Membership &amp; lease{" "}
                {bookingSettings?.membership_lease_approval_mode === "auto" ? "auto approve" : "manual approval"} •{" "}
                {bookingSettings?.payment_failure_hold_minutes === 0
                  ? "Cancel failed payments immediately"
                  : `${bookingSettings?.payment_failure_hold_minutes ?? 30} min payment recovery hold`}{" "}
                • Waitlist: {waitlistSummary(bookingSettings)}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="booking-approval-mode">Hourly/day-pass approval</Label>
              <select
                id="booking-approval-mode"
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                value={bookingSettingsForm.booking_approval_mode}
                onChange={(e) =>
                  setBookingSettingsForm((current) => ({
                    ...current,
                    booking_approval_mode: e.target.value as "manual" | "auto",
                  }))
                }
              >
                <option value="manual">Manual approval</option>
                <option value="auto">Auto approve</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="membership-lease-approval-mode">Membership &amp; lease approval</Label>
              <select
                id="membership-lease-approval-mode"
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                value={bookingSettingsForm.membership_lease_approval_mode}
                onChange={(e) =>
                  setBookingSettingsForm((current) => ({
                    ...current,
                    membership_lease_approval_mode: e.target.value as "manual" | "auto",
                  }))
                }
              >
                <option value="manual">Manual approval</option>
                <option value="auto">Auto approve</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-hold-minutes">Payment failure recovery</Label>
              <select
                id="payment-hold-minutes"
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                value={bookingSettingsForm.payment_failure_hold_minutes}
                onChange={(e) =>
                  setBookingSettingsForm((current) => ({
                    ...current,
                    payment_failure_hold_minutes: e.target.value,
                  }))
                }
              >
                <option value="0">Cancel immediately</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">60 min</option>
              </select>
            </div>
            <fieldset className="grid gap-2 md:col-span-3 xl:col-span-4">
              <legend className="text-sm font-medium text-textPrimary">Waitlist by space type</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {WAITLIST_TYPE_OPTIONS.map((option) => (
                  <label
                    key={option.key}
                    className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-textPrimary"
                  >
                    <input
                      type="checkbox"
                      checked={bookingSettingsForm[option.key]}
                      onChange={(e) =>
                        setBookingSettingsForm((current) => ({
                          ...current,
                          [option.key]: e.target.checked,
                        }))
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-end md:col-span-3 xl:col-span-4">
              <Button type="button" onClick={saveBookingSettings} disabled={!orgId}>
                Save booking approval
              </Button>
            </div>
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="text-sm font-semibold">Cancellation policies</div>
          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-start">
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              value={policyForm.space_type}
              onChange={(e) => setPolicyForm({ ...policyForm, space_type: e.target.value })}
            >
              <option value="conference_room">Conference Room</option>
              <option value="private_office">Private Office</option>
              <option value="shared_desk">Shared Desk</option>
              <option value="virtual_office">Virtual Office</option>
            </select>
            <div className="grid gap-2">
              {policyForm.tiers.map((tier, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={tier.min_hours_before_start}
                    onChange={(e) => updatePolicyTier(index, "min_hours_before_start", e.target.value)}
                    placeholder="Hours before start"
                  />
                  <Input
                    value={tier.refund_percent}
                    onChange={(e) => updatePolicyTier(index, "refund_percent", e.target.value)}
                    placeholder="Refund %"
                  />
                </div>
              ))}
            </div>
            <Button type="button" onClick={createPolicy} disabled={!orgId}>
              Add policy
            </Button>
          </div>
          <div className="grid gap-2 text-xs text-textMuted">
            {policies.map((policy) => (
              <div key={policy.public_id}>
                {policy.space_type} •{" "}
                {(policy.tiers?.length ? policy.tiers : [
                  {
                    min_hours_before_start: policy.cancel_window_hours,
                    refund_percent: policy.refund_percent,
                  },
                ])
                  .slice()
                  .sort((a, b) => b.min_hours_before_start - a.min_hours_before_start)
                  .map((tier) => `${tier.refund_percent}% at ${tier.min_hours_before_start}+h`)
                  .join(" / ")}
              </div>
            ))}
            {policies.length === 0 ? <div>No cancellation policies configured.</div> : null}
          </div>
        </Card>

      </div>
    </AppShell>
  );
}
