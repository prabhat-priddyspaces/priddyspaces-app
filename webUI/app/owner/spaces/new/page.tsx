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

  async function handleSave(nextStep: "inventory" | "media") {
    try {
      setSaving(true);
      setMessage("");
      if (!form.location_public_id) {
        setMessage("Choose a location before creating a room.");
        return;
      }
      const capacity = Number(form.capacity || 1);
      if (Number.isNaN(capacity) || capacity < 1) {
        setMessage("Capacity must be at least 1.");
        return;
      }

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
            price_monthly: form.price_monthly ? Number(form.price_monthly) : null,
            price_daily: form.price_daily ? Number(form.price_daily) : null,
            price_hourly: form.price_hourly ? Number(form.price_hourly) : null,
            availability_start_time: form.availability_start_time || null,
            availability_end_time: form.availability_end_time || null,
            buffer_before_minutes: Number(form.buffer_before_minutes || 0),
            buffer_after_minutes: Number(form.buffer_after_minutes || 0),
            visibility: form.visibility,
          }),
        },
        token
      );

      if (nextStep === "media") {
        router.push(
          `/owner/spaces/${space.public_id}/media?locationId=${encodeURIComponent(form.location_public_id)}`
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
          <h2 className="text-2xl font-semibold">Create a Room</h2>
          <p className="text-textSecondary">Add a new room or desk inventory item for a location.</p>
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
                  No locations yet. Create one first from{" "}
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
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="hourly">Hourly price (cents)</Label>
                <Input
                  id="hourly"
                  value={form.price_hourly}
                  onChange={(e) => setForm({ ...form, price_hourly: e.target.value })}
                  placeholder="3000"
                />
                <div className="text-xs text-textMuted">
                  Required for meeting rooms billed by the hour. Enter in cents (3000 = $30/hr).
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily">Daily price (cents)</Label>
                <Input
                  id="daily"
                  value={form.price_daily}
                  onChange={(e) => setForm({ ...form, price_daily: e.target.value })}
                  placeholder="20000"
                />
                <div className="text-xs text-textMuted">
                  Used when a customer picks "Full day". Hourly bookings are auto-capped to this amount.
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly">Monthly price (cents)</Label>
                <Input
                  id="monthly"
                  value={form.price_monthly}
                  onChange={(e) => setForm({ ...form, price_monthly: e.target.value })}
                  placeholder="120000"
                />
              </div>
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
                Save Room
              </Button>
              <Link href={form.location_public_id ? `/owner/locations/spaces?locationId=${form.location_public_id}` : "/owner/locations"}>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            </div>
            {message ? <div className="text-sm text-textMuted">{message}</div> : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
