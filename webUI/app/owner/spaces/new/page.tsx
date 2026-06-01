"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { LeaseTermsManager } from "@/components/lease-terms-manager";
import { SetupFeeManager } from "@/components/setup-fee-manager";
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
      showDaily: true,
      dailyLabel: "Day rate price (USD)",
      dailyHelp: "Optional all-day conference room price.",
      showAvailability: true,
      showBuffers: true,
    };
  }
  if (spaceType === "shared_desk") {
    return {
      capacityLabel: "Desks available per day",
      capacityHelp: "Pooled sellable seats for day passes and coworking memberships.",
      showHourly: false,
      showDaily: true,
      dailyLabel: "Day pass price (USD)",
      dailyHelp: "Charged per shared-desk day pass seat.",
      showAvailability: true,
      showBuffers: false,
    };
  }
  if (spaceType === "virtual_office") {
    return {
      capacityLabel: "",
      capacityHelp: "",
      showHourly: false,
      showDaily: false,
      dailyLabel: "",
      dailyHelp: "",
      showAvailability: false,
      showBuffers: false,
    };
  }
  return {
    capacityLabel: spaceType === "suite" ? "Suite seats" : "Office seats",
    capacityHelp: "Number of people included in this office or suite.",
    showHourly: false,
    showDaily: false,
    dailyLabel: "",
    dailyHelp: "",
    showAvailability: false,
    showBuffers: false,
  };
}

function isTermManagedSpaceType(spaceType: string): spaceType is TermManagedSpaceType {
  return ["private_office", "suite", "shared_desk", "virtual_office"].includes(spaceType);
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
    price_monthly: "",
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
  const [createdSpace, setCreatedSpace] = useState<{
    public_id: string;
    space_type: TermManagedSpaceType;
    capacity: number;
  } | null>(null);
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

  async function handleSave(nextStep: "inventory" | "media") {
    try {
      setSaving(true);
      setMessage("");
      if (!form.location_public_id) {
        setMessage("Choose a location before creating a room.");
        return;
      }
      if (createdSpace?.space_type === form.space_type) {
        if (nextStep === "media") {
          router.push(
            `/owner/spaces/media?spaceId=${encodeURIComponent(createdSpace.public_id)}&locationId=${encodeURIComponent(form.location_public_id)}`
          );
        } else {
          router.push(`/owner/locations/spaces?locationId=${encodeURIComponent(form.location_public_id)}`);
        }
        return;
      }
      const capacity = form.space_type === "virtual_office" ? 1 : Number(form.capacity || 1);
      if (Number.isNaN(capacity) || capacity < 1) {
        setMessage("Capacity must be at least 1.");
        return;
      }
      const setupFeeItems = buildSetupFeeItems();
      if (!setupFeeItems) return;

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

      if (nextStep === "media") {
        router.push(
          `/owner/spaces/media?spaceId=${encodeURIComponent(space.public_id)}&locationId=${encodeURIComponent(form.location_public_id)}`
        );
      } else if (isTermManagedSpaceType(form.space_type)) {
        setCreatedSpace({
          public_id: space.public_id,
          space_type: form.space_type,
          capacity,
        });
        setMessage("Space saved. Add terms below, or return to inventory when finished.");
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
          <p className="text-textSecondary">Add product-specific inventory for a location.</p>
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
                  No owner locations are ready for inventory yet. Create one first from{" "}
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
                onChange={(e) => setForm({ ...form, space_type: e.target.value })}
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
                <Label htmlFor="hourly">Hourly price (USD)</Label>
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
                <Label htmlFor="daily">{config.dailyLabel}</Label>
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
        {createdSpace?.space_type === form.space_type ? (
          <SetupFeeManager spacePublicId={createdSpace.public_id} />
        ) : (
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
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => handleSave("media")} disabled={saving}>
            {saving ? "Saving..." : "Save And Add Photos"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleSave("inventory")}
            disabled={saving}
          >
            {createdSpace?.space_type === form.space_type ? "Done" : "Save Space"}
          </Button>
          <Link href={form.location_public_id ? `/owner/locations/spaces?locationId=${form.location_public_id}` : "/owner/locations"}>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
        </div>
        {message ? <div className="text-sm text-textMuted">{message}</div> : null}
        {isTermManagedSpaceType(form.space_type) ? (
          createdSpace?.space_type === form.space_type ? (
            <LeaseTermsManager
              spacePublicId={createdSpace.public_id}
              spaceType={createdSpace.space_type}
              spaceCapacity={createdSpace.space_type === "virtual_office" ? 1 : createdSpace.capacity}
            />
          ) : (
            <Card>
              <div className="grid gap-1">
                <h3 className="text-lg font-semibold">
                  {form.space_type === "shared_desk"
                    ? "Membership Terms"
                    : form.space_type === "virtual_office"
                      ? "Virtual Membership Terms"
                      : "Lease Terms"}
                </h3>
                <p className="text-sm text-textSecondary">
                  Save this space to add the term lengths and monthly prices members can buy.
                </p>
              </div>
            </Card>
          )
        ) : null}
      </div>
    </AppShell>
  );
}
