"use client";

import Link from "next/link";
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

interface LocationOption {
  public_id: string;
  name: string;
}

interface SpaceOption {
  public_id: string;
  space_type: string;
  location_name: string;
}

interface PricingRule {
  public_id: string;
  rate_type: string;
  rate_amount: number;
}

interface PromoCode {
  public_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
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

interface SubscriptionPlan {
  public_id: string;
  name: string;
  space_type: string;
  billing_cycle: string;
  price: number;
  stripe_price_id: string | null;
  is_active: boolean;
}

interface SpaceResponse {
  public_id: string;
  space_type: string;
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

export default function OwnerSettingsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [taxConfig, setTaxConfig] = useState<TaxConfig | null>(null);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [connectStatus, setConnectStatus] = useState("");
  const [orgProfileForm, setOrgProfileForm] = useState({ name: "", branding: "" });

  const [pricingForm, setPricingForm] = useState({ rate_type: "daily", rate_amount: "" });
  const [promoForm, setPromoForm] = useState({
    code: "",
    discount_type: "percent",
    discount_value: "",
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
  const [planForm, setPlanForm] = useState({
    name: "",
    space_type: "shared_desk",
    billing_cycle: "monthly",
    price: "",
    stripe_price_id: "",
    is_active: true,
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

  useEffect(() => {
    async function loadOrgContext() {
      if (!orgId) {
        setLocations([]);
        setSpaces([]);
        return;
      }
      const token = getAccessToken() ?? undefined;
      const locationList = await apiFetch<LocationOption[]>(
        `/api/locations?organization_public_id=${encodeURIComponent(orgId)}`,
        { method: "GET" },
        token
      );
      setLocations(locationList);

      const spacesByLocation = await Promise.all(
        locationList.map(async (location) => {
          const list = await apiFetch<SpaceResponse[]>(
            `/api/locations/${location.public_id}/spaces`,
            { method: "GET" },
            token
          ).catch(() => []);
          return list.map((space) => ({
            public_id: space.public_id,
            space_type: space.space_type,
            location_name: location.name,
          }));
        })
      );
      const flattened = spacesByLocation.flat();
      setSpaces(flattened);
      if (flattened.length > 0) {
        setSpaceId((current) => current || flattened[0].public_id);
      } else {
        setSpaceId("");
      }
    }

    loadOrgContext().catch((err) =>
      setMessage(err instanceof Error ? err.message : "Failed to load organization settings context")
    );
  }, [orgId]);

  async function loadPricingRules() {
    if (!spaceId) {
      setPricingRules([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<PricingRule[]>(
      `/api/pricing-rules?space_public_id=${encodeURIComponent(spaceId)}`,
      { method: "GET" },
      token
    );
    setPricingRules(list);
  }

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

  async function loadPlans() {
    if (!orgId) {
      setPlans([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<SubscriptionPlan[]>(
      `/api/subscription-plans?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token
    );
    setPlans(list);
  }

  async function loadConnectStatus() {
    if (!orgId) {
      setConnectStatus("");
      return;
    }
    const token = getAccessToken() ?? undefined;
    const status = await apiFetch<{ connected: boolean }>(
      `/api/stripe/connect/status?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token
    );
    setConnectStatus(status.connected ? "Connected" : "Not connected");
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
    loadPricingRules().catch(() => null);
  }, [spaceId]);

  useEffect(() => {
    loadPromoCodes().catch(() => null);
    loadTaxConfig().catch(() => null);
    loadBookingSettings().catch(() => null);
    loadPolicies().catch(() => null);
    loadPlans().catch(() => null);
    loadConnectStatus().catch(() => null);
  }, [orgId]);

  async function createPricingRule() {
    if (!spaceId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      "/api/pricing-rules",
      {
        method: "POST",
        body: JSON.stringify({
          space_public_id: spaceId,
          rate_type: pricingForm.rate_type,
          rate_amount: Number(pricingForm.rate_amount),
        }),
      },
      token
    );
    setMessage("Pricing rule created");
    await loadPricingRules();
  }

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
          is_active: true,
        }),
      },
      token
    );
    setMessage("Promo code created");
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

  async function createPlan() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/subscription-plans?organization_public_id=${encodeURIComponent(orgId)}`,
      {
        method: "POST",
        body: JSON.stringify({
          name: planForm.name,
          space_type: planForm.space_type,
          billing_cycle: planForm.billing_cycle,
          price: Number(planForm.price),
          stripe_price_id: planForm.stripe_price_id || null,
          is_active: planForm.is_active,
        }),
      },
      token
    );
    setMessage("Subscription plan saved");
    await loadPlans();
  }

  async function startConnect() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    const res = await apiFetch<{ url: string }>(
      `/api/stripe/connect/onboard?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "POST" },
      token
    );
    window.location.href = res.url;
  }

  const selectedSpace = useMemo(
    () => spaces.find((space) => space.public_id === spaceId) || null,
    [spaceId, spaces]
  );
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
          Pricing, promotions, tax, cancellation rules, plans, and payouts.
        </p>

        {message ? <div className="text-[13px] text-text-3">{message}</div> : null}

        <Card className="grid gap-4 p-4">
          <div className="grid gap-4 md:grid-cols-3">
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
              <Label htmlFor="space">Space</Label>
              <select
                id="space"
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                <option value="">Select a space</option>
                {spaces.map((space) => (
                  <option key={space.public_id} value={space.public_id}>
                    {space.location_name} • {space.space_type}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Current scope</Label>
              <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-textSecondary">
                {selectedSpace ? `${selectedSpace.location_name} • ${selectedSpace.space_type}` : "Organization-wide settings"}
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4 text-xs text-textMuted">
            <div>Locations: {locations.length}</div>
            <div>Spaces: {spaces.length}</div>
            <div>Promo codes: {promoCodes.length}</div>
            <div>Plans: {plans.length}</div>
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

        <Card className="grid gap-3 p-4">
          <div>
            <div className="text-sm font-semibold">Rewards configuration</div>
            <div className="text-xs text-textMuted">
              Configure Priddy Points acceptance and workspace reward eligibility from the loyalty page.
            </div>
          </div>
          <div>
            <Link href="/owner/loyalty">
              <Button type="button" variant="secondary">
                Open loyalty settings
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="text-sm font-semibold">Pricing rules</div>
          <div className="grid gap-2 md:grid-cols-3">
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              value={pricingForm.rate_type}
              onChange={(e) => setPricingForm({ ...pricingForm, rate_type: e.target.value })}
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </select>
            <Input
              value={pricingForm.rate_amount}
              onChange={(e) => setPricingForm({ ...pricingForm, rate_amount: e.target.value })}
              placeholder="Amount"
            />
            <Button type="button" onClick={createPricingRule} disabled={!spaceId}>
              Add rule
            </Button>
          </div>
          <div className="grid gap-2 text-xs text-textMuted">
            {pricingRules.map((rule) => (
              <div key={rule.public_id}>
                {rule.rate_type} • {rule.rate_amount}
              </div>
            ))}
            {pricingRules.length === 0 ? <div>No rules configured for this space.</div> : null}
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="text-sm font-semibold">Promo codes</div>
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              value={promoForm.code}
              onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })}
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
              placeholder="Value"
            />
            <Button type="button" onClick={createPromoCode} disabled={!orgId}>
              Add promo
            </Button>
          </div>
          <div className="grid gap-2 text-xs text-textMuted">
            {promoCodes.map((promo) => (
              <div key={promo.public_id}>
                {promo.code} • {promo.discount_type} • {promo.discount_value}
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

        <Card className="grid gap-4 p-4">
          <div className="text-sm font-semibold">Membership plans</div>
          <div className="grid gap-2 md:grid-cols-6">
            <Input
              value={planForm.name}
              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              placeholder="Plan name"
            />
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              value={planForm.space_type}
              onChange={(e) => setPlanForm({ ...planForm, space_type: e.target.value })}
            >
              <option value="conference_room">Conference Room</option>
              <option value="private_office">Private Office</option>
              <option value="shared_desk">Shared Desk</option>
              <option value="virtual_office">Virtual Office</option>
            </select>
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              value={planForm.billing_cycle}
              onChange={(e) => setPlanForm({ ...planForm, billing_cycle: e.target.value })}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="six_month">6 Months</option>
              <option value="yearly">Yearly</option>
            </select>
            <Input
              value={planForm.price}
              onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
              placeholder="Price"
            />
            <Input
              value={planForm.stripe_price_id}
              onChange={(e) => setPlanForm({ ...planForm, stripe_price_id: e.target.value })}
              placeholder="Stripe price id"
            />
            <div className="flex gap-2">
              <select
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                value={planForm.is_active ? "true" : "false"}
                onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.value === "true" })}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              <Button type="button" onClick={createPlan} disabled={!orgId}>
                Add
              </Button>
            </div>
          </div>
          <div className="grid gap-2 text-xs text-textMuted">
            {plans.map((plan) => (
              <div key={plan.public_id}>
                {plan.name} • {plan.space_type} • {plan.billing_cycle} • {plan.price}
              </div>
            ))}
            {plans.length === 0 ? <div>No membership plans configured.</div> : null}
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="text-sm font-semibold">Stripe Connect</div>
          <div className="text-xs text-textMuted">Status: {connectStatus || "Unknown"}</div>
          <Button type="button" onClick={startConnect} disabled={!orgId}>
            Start onboarding
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
