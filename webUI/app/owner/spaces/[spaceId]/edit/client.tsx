"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeaseTermsManager } from "@/components/lease-terms-manager";
import { VolumeDiscountManager } from "@/components/volume-discount-manager";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import type { MoneyValue } from "@/lib/money";

interface Space {
  public_id: string;
  name: string;
  space_type: string;
  capacity: number;
  price_monthly: MoneyValue | null;
  price_daily: MoneyValue | null;
  price_hourly: MoneyValue | null;
  availability_status: string;
  availability_start_time: string | null;
  availability_end_time: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  visibility: string;
  priddy_points_enabled: boolean | null;
  owner_points_enabled: boolean | null;
}

function pointsFormValue(value: boolean | null) {
  if (value === true) return "enabled";
  if (value === false) return "disabled";
  return "inherit";
}

function pointsPayload(value: string) {
  if (value === "enabled") return true;
  if (value === "disabled") return false;
  return null;
}

export function EditSpaceClient() {
  const params = useParams<{ spaceId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeSpaceId = params?.spaceId || "";
  const spaceId =
    searchParams.get("spaceId") ||
    (routeSpaceId === "_" || routeSpaceId === "_.html" ? "" : routeSpaceId);
  const [form, setForm] = useState({
    name: "",
    space_type: "conference_room",
    capacity: "1",
    price_monthly: "",
    price_daily: "",
    price_hourly: "",
    availability_status: "available",
    availability_start_time: "",
    availability_end_time: "",
    buffer_before_minutes: "0",
    buffer_after_minutes: "0",
    visibility: "public",
    priddy_points_enabled: "inherit",
    owner_points_enabled: "inherit"
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spaceId) return;
    const token = getAccessToken() ?? undefined;
    setLoading(true);
    apiFetch<Space>(`/api/spaces/${spaceId}`, { method: "GET" }, token)
      .then((space) => {
        setForm({
          name: space.name || "",
          space_type: space.space_type,
          capacity: String(space.capacity),
          price_monthly: space.price_monthly != null ? String(space.price_monthly) : "",
          price_daily: space.price_daily != null ? String(space.price_daily) : "",
          price_hourly: space.price_hourly != null ? String(space.price_hourly) : "",
          availability_status: space.availability_status,
          availability_start_time: space.availability_start_time || "",
          availability_end_time: space.availability_end_time || "",
          buffer_before_minutes: String(space.buffer_before_minutes ?? 0),
          buffer_after_minutes: String(space.buffer_after_minutes ?? 0),
          visibility: space.visibility || "public",
          priddy_points_enabled: pointsFormValue(space.priddy_points_enabled),
          owner_points_enabled: pointsFormValue(space.owner_points_enabled)
        });
      })
      .catch((err: any) => setMessage(err?.message || "Failed to load space"))
      .finally(() => setLoading(false));
  }, [spaceId]);

  function moneyPayload(value: string) {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  async function handleSave() {
    try {
      const token = getAccessToken() ?? undefined;
      await apiFetch(
        `/api/spaces/${spaceId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            space_type: form.space_type,
            capacity: Number(form.capacity || 1),
            price_monthly: moneyPayload(form.price_monthly),
            price_daily: moneyPayload(form.price_daily),
            price_hourly: moneyPayload(form.price_hourly),
            availability_status: form.availability_status,
            availability_start_time: form.availability_start_time || null,
            availability_end_time: form.availability_end_time || null,
            buffer_before_minutes: Number(form.buffer_before_minutes || 0),
            buffer_after_minutes: Number(form.buffer_after_minutes || 0),
            visibility: form.visibility,
            priddy_points_enabled: pointsPayload(form.priddy_points_enabled),
            owner_points_enabled: pointsPayload(form.owner_points_enabled)
          })
        },
        token
      );
      setMessage("Space updated");
      router.back();
    } catch (err: any) {
      setMessage(err?.message || "Failed to update space");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="text-sm text-textMuted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold">Edit Space</h2>
          <p className="text-textSecondary">Update space type, pricing, and availability.</p>
        </div>
        <Card>
          <div className="grid gap-5">
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
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                placeholder="4"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
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
                  Required for hourly meeting-room bookings. Enter a dollar amount, such as 19.99.
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily">Daily price (USD)</Label>
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
                <div className="text-xs text-textMuted">
                  Used for "Full day". Hourly bookings auto-cap to this amount.
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly">Monthly price (USD)</Label>
                <Input
                  id="monthly"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.price_monthly}
                  onChange={(e) => setForm({ ...form, price_monthly: e.target.value })}
                  placeholder="1200"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="availability">Availability</Label>
              <select
                id="availability"
                value={form.availability_status}
                onChange={(e) => setForm({ ...form, availability_status: e.target.value })}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
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
              Amenities are now assigned on the location. Update them from the location editor if
              this room should expose different amenities.
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <PointsSelect
                id="priddy-points"
                label="Priddy Points"
                value={form.priddy_points_enabled}
                onChange={(value) => setForm({ ...form, priddy_points_enabled: value })}
              />
              <PointsSelect
                id="owner-points"
                label="Owner points"
                value={form.owner_points_enabled}
                onChange={(value) => setForm({ ...form, owner_points_enabled: value })}
              />
            </div>
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
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="buffer_before">Buffer before (minutes)</Label>
                <Input
                  id="buffer_before"
                  type="number"
                  min={0}
                  value={form.buffer_before_minutes}
                  onChange={(e) => setForm({ ...form, buffer_before_minutes: e.target.value })}
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
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" onClick={handleSave}>
                Save Changes
              </Button>
              <Link href="/owner/locations/spaces">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
            </div>
            {message ? <div className="text-sm text-textMuted">{message}</div> : null}
          </div>
        </Card>
        {form.space_type === "private_office" || form.space_type === "suite" ? (
          <LeaseTermsManager
            spacePublicId={spaceId}
            spaceType={form.space_type as "private_office" | "suite"}
            spaceCapacity={Number(form.capacity || 1)}
          />
        ) : null}
        {form.space_type === "conference_room" || form.space_type === "shared_desk" ? (
          <VolumeDiscountManager spacePublicId={spaceId} />
        ) : null}
      </div>
    </AppShell>
  );
}

function PointsSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
      >
        <option value="inherit">Use organization setting</option>
        <option value="enabled">Allow on this space</option>
        <option value="disabled">Exclude this space</option>
      </select>
    </div>
  );
}
