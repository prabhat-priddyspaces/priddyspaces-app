"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface LocationOption {
  public_id: string;
  name: string;
  city: string | null;
}

interface SpaceResponse {
  public_id: string;
}

interface SetupFeeDraftRow {
  label: string;
  amount: string;
}

interface SetupFeeCreateItem {
  label: string;
  amount_cents: number;
  is_active: boolean;
  sort_order: number;
}

interface TermDraftRow {
  commitment_months: string;
  monthly_price: string;
  name: string;
  seats_per_plan: string;
  max_active_subscriptions: string;
}

interface TermCreatePayload {
  booking_mode: string;
  name: string;
  price_cents: number;
  billing_cycle: string;
  commitment_months: number | null;
  seats_per_plan: number;
  max_active_subscriptions: number | null;
  is_active: boolean;
}

interface DiscountDraftRow {
  min_hours: string;
  discount_percent: string;
}

interface DiscountTier {
  min_hours: number;
  discount_percent: number;
  is_active: boolean;
}

type TermManagedSpaceType = "private_office" | "suite" | "shared_desk" | "virtual_office";

function moneyPayload(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function amountToCents(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function typeConfig(spaceType: string) {
  if (spaceType === "conference_room") {
    return {
      capacityLabel: "Room capacity",
      capacityHelp: "Number of people the room can seat.",
      showHourly: true,
      requireHourly: true,
      showDaily: true,
      requireDaily: true,
      dailyLabel: "Day rate price (USD)",
      dailyHelp: "All-day conference room price.",
      showAvailability: true,
      showBuffers: true,
      showVolumeDiscounts: true,
      showTerms: false,
      requireTerm: false,
      termLabel: "",
    };
  }
  if (spaceType === "shared_desk") {
    return {
      capacityLabel: "Desks available per day",
      capacityHelp: "Pooled sellable seats for day passes and coworking memberships.",
      showHourly: false,
      requireHourly: false,
      showDaily: true,
      requireDaily: true,
      dailyLabel: "Day pass price (USD)",
      dailyHelp: "Charged per shared-desk day pass seat.",
      showAvailability: true,
      showBuffers: false,
      showVolumeDiscounts: true,
      showTerms: true,
      requireTerm: false,
      termLabel: "Membership Terms",
    };
  }
  if (spaceType === "virtual_office") {
    return {
      capacityLabel: "",
      capacityHelp: "",
      showHourly: false,
      requireHourly: false,
      showDaily: false,
      requireDaily: false,
      dailyLabel: "",
      dailyHelp: "",
      showAvailability: false,
      showBuffers: false,
      showVolumeDiscounts: false,
      showTerms: true,
      requireTerm: true,
      termLabel: "Virtual Membership Terms",
    };
  }
  return {
    capacityLabel: spaceType === "suite" ? "Suite seats" : "Office seats",
    capacityHelp: "Number of people included in this office or suite.",
    showHourly: false,
    requireHourly: false,
    showDaily: false,
    requireDaily: false,
    dailyLabel: "",
    dailyHelp: "",
    showAvailability: false,
    showBuffers: false,
    showVolumeDiscounts: false,
    showTerms: true,
    requireTerm: true,
    termLabel: "Lease Terms",
  };
}

function isTermManagedSpaceType(spaceType: string): spaceType is TermManagedSpaceType {
  return ["private_office", "suite", "shared_desk", "virtual_office"].includes(spaceType);
}

function bookingModeFor(spaceType: TermManagedSpaceType) {
  if (spaceType === "suite") return "suite_lease";
  if (spaceType === "shared_desk") return "monthly_membership";
  if (spaceType === "virtual_office") return "virtual_membership";
  return "private_office_lease";
}

function defaultTermName(commitmentMonths: number | null) {
  if (commitmentMonths == null) return "Month-to-month";
  return `${commitmentMonths}-month Term`;
}

function emptyTermRow(capacity: string): TermDraftRow {
  return {
    commitment_months: "",
    monthly_price: "",
    name: "",
    seats_per_plan: capacity || "1",
    max_active_subscriptions: "",
  };
}

export default function NewSpacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryLocationId = useMemo(() => searchParams.get("locationId") || "", [searchParams]);

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [form, setForm] = useState({
    location_public_id: queryLocationId,
    name: "",
    space_type: "conference_room",
    capacity: "4",
    price_daily: "",
    price_hourly: "",
    availability_start_time: "",
    availability_end_time: "",
    buffer_before_minutes: "0",
    buffer_after_minutes: "0",
    visibility: "public",
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [setupFeeRows, setSetupFeeRows] = useState<SetupFeeDraftRow[]>([]);
  const [termRows, setTermRows] = useState<TermDraftRow[]>([]);
  const [discountRows, setDiscountRows] = useState<DiscountDraftRow[]>([]);
  const config = typeConfig(form.space_type);

  useEffect(() => {
    async function loadLocations() {
      const token = getAccessToken() ?? undefined;
      try {
        const list = await apiFetch<LocationOption[]>("/api/locations", { method: "GET" }, token);
        setLocations(list);
        if (list.length > 0) {
          setForm((current) => ({
            ...current,
            location_public_id:
              queryLocationId && list.some((location) => location.public_id === queryLocationId)
                ? queryLocationId
                : current.location_public_id || list[0].public_id,
          }));
        }
      } catch (err: unknown) {
        setMessage(err instanceof Error ? err.message : "Failed to load locations");
      } finally {
        setLoadingLocations(false);
      }
    }

    loadLocations().catch(() => null);
  }, [queryLocationId]);

  function handleSpaceTypeChange(nextType: string) {
    setMessage("");
    setForm((current) => ({
      ...current,
      space_type: nextType,
      // Reset type-specific pricing/availability so the form swaps cleanly.
      price_daily: "",
      price_hourly: "",
      availability_start_time: "",
      availability_end_time: "",
      buffer_before_minutes: "0",
      buffer_after_minutes: "0",
    }));
    // Drop drafts that don't apply to the new type.
    const next = typeConfig(nextType);
    if (!next.showTerms) setTermRows([]);
    if (!next.showVolumeDiscounts) setDiscountRows([]);
  }

  // --- Setup fee draft rows -------------------------------------------------
  function addSetupFeeRow() {
    setSetupFeeRows((current) => [...current, { label: "", amount: "" }]);
  }

  function removeSetupFeeRow(index: number) {
    setSetupFeeRows((current) => current.filter((_, i) => i !== index));
  }

  function updateSetupFeeRow(index: number, key: keyof SetupFeeDraftRow, value: string) {
    setSetupFeeRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function buildSetupFeeItems(): SetupFeeCreateItem[] | null {
    const items: SetupFeeCreateItem[] = [];
    const seenLabels = new Set<string>();
    for (const row of setupFeeRows) {
      const label = row.label.trim().replace(/\s+/g, " ");
      const amountText = row.amount.trim();
      if (!label && !amountText) continue;
      if (!label) {
        setMessage("Setup fee line item is required.");
        return null;
      }
      const amount_cents = amountToCents(amountText);
      if (amount_cents <= 0) {
        setMessage("Setup fee amount must be greater than 0.");
        return null;
      }
      const key = label.toLowerCase();
      if (seenLabels.has(key)) {
        setMessage(`Duplicate setup fee label: ${label}`);
        return null;
      }
      seenLabels.add(key);
      items.push({
        label,
        amount_cents,
        is_active: true,
        sort_order: items.length,
      });
    }
    return items;
  }

  // --- Term draft rows ------------------------------------------------------
  function addTermRow() {
    setTermRows((current) => [...current, emptyTermRow(form.capacity)]);
  }

  function removeTermRow(index: number) {
    setTermRows((current) => current.filter((_, i) => i !== index));
  }

  function updateTermRow(index: number, key: keyof TermDraftRow, value: string) {
    setTermRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function buildTermPayloads(): TermCreatePayload[] | null {
    if (!isTermManagedSpaceType(form.space_type)) return [];
    const bookingMode = bookingModeFor(form.space_type);
    const fallbackSeats = form.space_type === "virtual_office" ? 1 : Number(form.capacity || 1);
    const payloads: TermCreatePayload[] = [];
    for (const row of termRows) {
      const hasAnyValue =
        row.commitment_months.trim() ||
        row.monthly_price.trim() ||
        row.name.trim() ||
        row.max_active_subscriptions.trim();
      const monthlyPrice = Number(row.monthly_price);
      if (!row.monthly_price.trim() && !hasAnyValue) continue;
      if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
        setMessage("Each term needs a monthly price greater than zero.");
        return null;
      }
      const commitmentMonths = row.commitment_months.trim() ? Number(row.commitment_months) : null;
      if (commitmentMonths != null && (!Number.isInteger(commitmentMonths) || commitmentMonths < 1)) {
        setMessage("Term length must be a whole number of months.");
        return null;
      }
      const seatsPerPlan = Number(row.seats_per_plan || fallbackSeats || 1);
      if (!Number.isInteger(seatsPerPlan) || seatsPerPlan < 1) {
        setMessage("Seats per plan must be at least 1.");
        return null;
      }
      const maxActiveSubscriptions = row.max_active_subscriptions.trim()
        ? Number(row.max_active_subscriptions)
        : null;
      if (
        maxActiveSubscriptions != null &&
        (!Number.isInteger(maxActiveSubscriptions) || maxActiveSubscriptions < 1)
      ) {
        setMessage("Max active subscriptions must be at least 1.");
        return null;
      }
      payloads.push({
        booking_mode: bookingMode,
        name: row.name.trim() || defaultTermName(commitmentMonths),
        price_cents: Math.round(monthlyPrice * 100),
        billing_cycle: "monthly",
        commitment_months: commitmentMonths,
        seats_per_plan: seatsPerPlan,
        max_active_subscriptions: maxActiveSubscriptions,
        is_active: true,
      });
    }
    if (config.requireTerm && payloads.length === 0) {
      setMessage(`Add at least one ${config.termLabel.toLowerCase()} term before saving.`);
      return null;
    }
    return payloads;
  }

  // --- Volume discount draft rows ------------------------------------------
  function addDiscountRow() {
    setDiscountRows((current) => [...current, { min_hours: "", discount_percent: "" }]);
  }

  function removeDiscountRow(index: number) {
    setDiscountRows((current) => current.filter((_, i) => i !== index));
  }

  function updateDiscountRow(index: number, key: keyof DiscountDraftRow, value: string) {
    setDiscountRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function buildDiscountTiers(): DiscountTier[] {
    return discountRows
      .map((row) => ({
        min_hours: Number(row.min_hours),
        discount_percent: Number(row.discount_percent),
        is_active: true,
      }))
      .filter((t) => t.min_hours > 0 && t.discount_percent > 0 && t.discount_percent < 100);
  }

  // --- Validity gate --------------------------------------------------------
  const isValid = useMemo(() => {
    if (!form.location_public_id) return false;
    if (form.space_type !== "virtual_office") {
      const capacity = Number(form.capacity || 0);
      if (!Number.isFinite(capacity) || capacity < 1) return false;
    }
    if (config.requireHourly && !(Number(form.price_hourly) > 0)) return false;
    if (config.requireDaily && !(Number(form.price_daily) > 0)) return false;
    if (config.requireTerm && !termRows.some((row) => Number(row.monthly_price) > 0)) return false;
    return true;
  }, [
    form.location_public_id,
    form.space_type,
    form.capacity,
    form.price_hourly,
    form.price_daily,
    termRows,
    config.requireHourly,
    config.requireDaily,
    config.requireTerm,
  ]);

  async function handleSave(nextStep: "inventory" | "media") {
    try {
      setSaving(true);
      setMessage("");
      if (!form.location_public_id) {
        setMessage("Choose a location before creating a room.");
        return;
      }
      const capacity = form.space_type === "virtual_office" ? 1 : Number(form.capacity || 1);
      if (Number.isNaN(capacity) || capacity < 1) {
        setMessage("Capacity must be at least 1.");
        return;
      }
      const setupFeeItems = buildSetupFeeItems();
      if (!setupFeeItems) return;
      const termPayloads = buildTermPayloads();
      if (!termPayloads) return;
      const discountTiers = config.showVolumeDiscounts ? buildDiscountTiers() : [];

      const token = getAccessToken() ?? undefined;
      const space = await apiFetch<SpaceResponse>(
        "/api/spaces",
        {
          method: "POST",
          body: JSON.stringify({
            location_public_id: form.location_public_id,
            name: form.name || undefined,
            space_type: form.space_type,
            capacity,
            price_monthly: null,
            price_daily: config.showDaily ? moneyPayload(form.price_daily) : null,
            price_hourly: config.showHourly ? moneyPayload(form.price_hourly) : null,
            availability_start_time: config.showAvailability ? form.availability_start_time || null : null,
            availability_end_time: config.showAvailability ? form.availability_end_time || null : null,
            buffer_before_minutes: config.showBuffers ? Number(form.buffer_before_minutes || 0) : 0,
            buffer_after_minutes: config.showBuffers ? Number(form.buffer_after_minutes || 0) : 0,
            visibility: form.visibility,
            setup_fee_items: setupFeeItems,
          }),
        },
        token
      );

      // Persist inline lease/membership terms, then enable the booking mode.
      if (termPayloads.length > 0 && isTermManagedSpaceType(form.space_type)) {
        for (const payload of termPayloads) {
          await apiFetch(
            "/api/membership-plans",
            {
              method: "POST",
              body: JSON.stringify({ space_public_id: space.public_id, ...payload }),
            },
            token
          );
        }
        await apiFetch(
          `/api/spaces/${space.public_id}/booking-modes`,
          {
            method: "PUT",
            body: JSON.stringify({ booking_mode: bookingModeFor(form.space_type), is_enabled: true }),
          },
          token
        );
      }

      // Persist inline volume discounts.
      if (discountTiers.length > 0) {
        await apiFetch(
          `/api/spaces/${space.public_id}/volume-discounts`,
          { method: "PUT", body: JSON.stringify({ tiers: discountTiers }) },
          token
        );
      }

      if (nextStep === "media") {
        router.push(
          `/owner/spaces/media?spaceId=${encodeURIComponent(space.public_id)}&locationId=${encodeURIComponent(form.location_public_id)}`
        );
      } else {
        router.push(`/owner/locations/spaces?locationId=${encodeURIComponent(form.location_public_id)}`);
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold">Create a Space</h2>
          <p className="text-textSecondary">Add rooms, desks, and bookable spaces for a location.</p>
        </div>
        <Card>
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="location">Location</Label>
              <select
                id="location"
                value={form.location_public_id}
                onChange={(e) => setForm({ ...form, location_public_id: e.target.value })}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                disabled={loadingLocations}
              >
                <option value="">Select a location</option>
                {locations.map((location) => (
                  <option key={location.public_id} value={location.public_id}>
                    {location.name}
                    {location.city ? `, ${location.city}` : ""}
                  </option>
                ))}
              </select>
              {!loadingLocations && locations.length === 0 ? (
                <div className="text-xs text-textMuted">
                  No owner locations are ready yet. Create one first from{" "}
                  <Link href="/owner/locations/new" className="text-accent hover:underline">
                    the location setup page
                  </Link>
                  .
                </div>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Listing name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Conference 14-B"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Space type</Label>
              <select
                id="type"
                value={form.space_type}
                onChange={(e) => handleSpaceTypeChange(e.target.value)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                <option value="conference_room">Conference Room</option>
                <option value="private_office">Private Office</option>
                <option value="shared_desk">Shared Desk</option>
                <option value="virtual_office">Virtual Office</option>
                <option value="suite">Suite</option>
              </select>
            </div>
            {form.space_type !== "virtual_office" ? (
              <div className="grid gap-2">
                <Label htmlFor="capacity">{config.capacityLabel}</Label>
                <Input
                  id="capacity"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                  placeholder="4"
                />
                <div className="text-xs text-textMuted">{config.capacityHelp}</div>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="visibility">Visibility</Label>
              <select
                id="visibility"
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value })}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div className="rounded-md border border-border bg-surface2 p-3 text-sm text-textSecondary">
              Amenities are now managed at the location level. Create or edit them from the
              location form and organization settings.
            </div>
            {config.showHourly || config.showDaily ? (
            <div className="grid gap-2 md:grid-cols-2">
              {config.showHourly ? (
              <div className="space-y-2">
                <Label htmlFor="hourly">Hourly price (USD)*</Label>
                <Input
                  id="hourly"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.price_hourly}
                  onChange={(e) => setForm({ ...form, price_hourly: e.target.value })}
                  placeholder="30"
                />
                <div className="text-xs text-textMuted">
                  Required for conference room bookings. Enter a dollar amount, such as 19.99.
                </div>
              </div>
              ) : null}
              {config.showDaily ? (
              <div className="space-y-2">
                <Label htmlFor="daily">{config.dailyLabel}{config.requireDaily ? "*" : ""}</Label>
                <Input
                  id="daily"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.price_daily}
                  onChange={(e) => setForm({ ...form, price_daily: e.target.value })}
                  placeholder="200"
                />
                <div className="text-xs text-textMuted">{config.dailyHelp}</div>
              </div>
              ) : null}
            </div>
            ) : null}
            {config.showAvailability ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="availability_start">Availability start</Label>
                <Input
                  id="availability_start"
                  type="time"
                  value={form.availability_start_time}
                  onChange={(e) => setForm({ ...form, availability_start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availability_end">Availability end</Label>
                <Input
                  id="availability_end"
                  type="time"
                  value={form.availability_end_time}
                  onChange={(e) => setForm({ ...form, availability_end_time: e.target.value })}
                />
              </div>
            </div>
            ) : null}
            {config.showBuffers ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="buffer_before">Buffer before (minutes)</Label>
                <Input
                  id="buffer_before"
                  type="number"
                  min={0}
                  value={form.buffer_before_minutes}
                  onChange={(e) => setForm({ ...form, buffer_before_minutes: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buffer_after">Buffer after (minutes)</Label>
                <Input
                  id="buffer_after"
                  type="number"
                  min={0}
                  value={form.buffer_after_minutes}
                  onChange={(e) => setForm({ ...form, buffer_after_minutes: e.target.value })}
                  placeholder="15"
                />
              </div>
            </div>
            ) : null}
          </div>
        </Card>

        {config.showTerms ? (
          <Card>
            <div className="grid gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {config.termLabel}
                  {config.requireTerm ? "*" : ""}
                </h3>
                <p className="text-xs text-textMuted">
                  Set the term lengths and monthly prices members can buy. Leave term length blank
                  for month-to-month.
                </p>
              </div>
              <div className="grid gap-3">
                {termRows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-sm text-textMuted">
                    No terms yet.
                  </div>
                ) : null}
                {termRows.map((row, index) => (
                  <div key={index} className="grid gap-3 rounded-md border border-border bg-surface p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`term-months-${index}`}>Term length (months)</Label>
                        <Input
                          id={`term-months-${index}`}
                          inputMode="numeric"
                          placeholder="Blank for month-to-month"
                          value={row.commitment_months}
                          onChange={(e) => updateTermRow(index, "commitment_months", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`term-price-${index}`}>Monthly price ($)*</Label>
                        <Input
                          id={`term-price-${index}`}
                          inputMode="decimal"
                          placeholder="4085"
                          value={row.monthly_price}
                          onChange={(e) => updateTermRow(index, "monthly_price", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`term-seats-${index}`}>Seats per plan</Label>
                        <Input
                          id={`term-seats-${index}`}
                          inputMode="numeric"
                          value={row.seats_per_plan}
                          onChange={(e) => updateTermRow(index, "seats_per_plan", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`term-max-${index}`}>Max active subscriptions</Label>
                        <Input
                          id={`term-max-${index}`}
                          inputMode="numeric"
                          placeholder="Unlimited"
                          value={row.max_active_subscriptions}
                          onChange={(e) =>
                            updateTermRow(index, "max_active_subscriptions", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                      <div className="space-y-1">
                        <Label htmlFor={`term-name-${index}`}>Display name (optional)</Label>
                        <Input
                          id={`term-name-${index}`}
                          placeholder={defaultTermName(
                            row.commitment_months ? Number(row.commitment_months) : null
                          )}
                          value={row.name}
                          onChange={(e) => updateTermRow(index, "name", e.target.value)}
                        />
                      </div>
                      <Button type="button" variant="ghost" onClick={() => removeTermRow(index)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" onClick={addTermRow}>
                  Add term
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {config.showVolumeDiscounts ? (
          <Card>
            <div className="grid gap-4">
              <div>
                <h3 className="text-lg font-semibold">Volume discounts</h3>
                <p className="text-xs text-textMuted">
                  Reward longer hourly bookings. Members booking ≥ Min hours get the discount applied
                  automatically. Discounts only apply to hourly bookings — full day bookings use the
                  day rate.
                </p>
              </div>
              <div className="grid gap-2">
                {discountRows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-sm text-textMuted">
                    No discount tiers yet.
                  </div>
                ) : null}
                {discountRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`discount-min-${index}`}>Min hours</Label>
                      <Input
                        id={`discount-min-${index}`}
                        value={row.min_hours}
                        onChange={(e) => updateDiscountRow(index, "min_hours", e.target.value)}
                        placeholder="4"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`discount-pct-${index}`}>Discount %</Label>
                      <Input
                        id={`discount-pct-${index}`}
                        value={row.discount_percent}
                        onChange={(e) => updateDiscountRow(index, "discount_percent", e.target.value)}
                        placeholder="10"
                      />
                    </div>
                    <Button type="button" variant="ghost" onClick={() => removeDiscountRow(index)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" onClick={addDiscountRow}>
                  Add tier
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="grid gap-4">
            <div>
              <h3 className="text-lg font-semibold">One-time setup fees</h3>
              <p className="text-xs text-textMuted">
                Mandatory setup costs shown before checkout and charged once per booking request.
              </p>
            </div>
            <div className="grid gap-2">
              {setupFeeRows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-3 text-sm text-textMuted">
                  No setup fees yet.
                </div>
              ) : null}
              {setupFeeRows.map((row, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_140px_auto] items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`new-setup-fee-label-${index}`}>Line item</Label>
                    <Input
                      id={`new-setup-fee-label-${index}`}
                      value={row.label}
                      onChange={(event) => updateSetupFeeRow(index, "label", event.target.value)}
                      placeholder="Room setup"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`new-setup-fee-amount-${index}`}>Amount ($)</Label>
                    <Input
                      id={`new-setup-fee-amount-${index}`}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(event) => updateSetupFeeRow(index, "amount", event.target.value)}
                      placeholder="75"
                    />
                  </div>
                  <Button type="button" variant="ghost" onClick={() => removeSetupFeeRow(index)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" onClick={addSetupFeeRow}>
                Add fee
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => handleSave("media")} disabled={saving || !isValid}>
            {saving ? "Saving..." : "Save And Add Photos"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleSave("inventory")}
            disabled={saving || !isValid}
          >
            Save Space
          </Button>
          <Link href={form.location_public_id ? `/owner/locations/spaces?locationId=${form.location_public_id}` : "/owner/locations"}>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
        </div>
        {message ? <div className="text-sm text-textMuted">{message}</div> : null}
      </div>
    </AppShell>
  );
}
