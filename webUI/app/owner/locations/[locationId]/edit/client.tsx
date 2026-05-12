"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AmenitySelector } from "@/components/amenity-selector";
import { PlaceAutocomplete, type PlaceDetails } from "@/components/place-autocomplete";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkingHoursEditor } from "@/components/working-hours-editor";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { normalizeWorkingHours, type PublicWorkingHour } from "@/lib/working-hours";

interface Location {
  public_id: string;
  organization_public_id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  neighborhood: string | null;
  timezone: string;
  booking_granularity: string;
  lat: number | null;
  lng: number | null;
  public_phone: string | null;
  public_email: string | null;
  public_hours_weekdays: string | null;
  public_hours_weekends: string | null;
  public_working_hours_enabled?: boolean;
  public_working_hours?: PublicWorkingHour[];
  public_parking_notes: string | null;
  public_transit_notes: string | null;
  public_included_items: string | null;
  amenities: Array<{ id: number; name: string }>;
}

export function EditLocationClient() {
  const params = useParams<{ locationId: string }>();
  const router = useRouter();
  const locationId = params?.locationId || "";
  const [orgAmenities, setOrgAmenities] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<number[]>([]);
  const [form, setForm] = useState({
    organization_public_id: "",
    name: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    neighborhood: "",
    timezone: "",
    booking_granularity: "60m",
    status: "active",
    lat: "",
    lng: "",
    public_phone: "",
    public_email: "",
    public_working_hours_enabled: false,
    public_working_hours: normalizeWorkingHours([]),
    public_parking_notes: "",
    public_transit_notes: "",
    public_included_items: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddressDetails, setShowAddressDetails] = useState(false);

  function applyPlace(place: PlaceDetails) {
    setForm((current) => ({
      ...current,
      address: place.street || place.formatted,
      city: place.city,
      state: place.state,
      postal_code: place.postal_code,
      neighborhood: place.neighborhood || current.neighborhood,
      lat: place.lat != null ? String(place.lat) : "",
      lng: place.lng != null ? String(place.lng) : "",
    }));
  }

  useEffect(() => {
    if (!locationId) return;
    const token = getAccessToken() ?? undefined;
    setLoading(true);
    apiFetch<Location>(`/api/locations/${locationId}`, { method: "GET" }, token)
      .then((loc) => {
        setForm({
          organization_public_id: loc.organization_public_id,
          name: loc.name,
          address: loc.address,
          city: loc.city || "",
          state: loc.state || "",
          postal_code: loc.postal_code || "",
          neighborhood: loc.neighborhood || "",
          timezone: loc.timezone,
          booking_granularity: loc.booking_granularity,
          status: (loc as any).status || "active",
          lat: loc.lat != null ? String(loc.lat) : "",
          lng: loc.lng != null ? String(loc.lng) : "",
          public_phone: loc.public_phone || "",
          public_email: loc.public_email || "",
          public_working_hours_enabled: Boolean(loc.public_working_hours_enabled),
          public_working_hours: normalizeWorkingHours(loc.public_working_hours),
          public_parking_notes: loc.public_parking_notes || "",
          public_transit_notes: loc.public_transit_notes || "",
          public_included_items: loc.public_included_items || "",
        });
        setSelectedAmenityIds(loc.amenities.map((amenity) => amenity.id));
        return apiFetch<Array<{ id: number; name: string }>>(
          `/api/orgs/${loc.organization_public_id}/amenities`,
          { method: "GET" },
          token
        );
      })
      .then((amenities) => setOrgAmenities(amenities))
      .catch((err: any) => setMessage(err?.message || "Failed to load location"))
      .finally(() => setLoading(false));
  }, [locationId]);

  async function handleSave() {
    try {
      if (form.lat && (Number(form.lat) < -90 || Number(form.lat) > 90)) {
        setMessage("Latitude must be between -90 and 90.");
        return;
      }
      if (form.lng && (Number(form.lng) < -180 || Number(form.lng) > 180)) {
        setMessage("Longitude must be between -180 and 180.");
        return;
      }
      const token = getAccessToken() ?? undefined;
      await apiFetch(
        `/api/locations/${locationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            address: form.address,
            city: form.city || null,
            state: form.state || null,
            postal_code: form.postal_code || null,
            neighborhood: form.neighborhood || null,
            timezone: form.timezone,
            booking_granularity: form.booking_granularity,
            status: form.status,
            lat: form.lat ? Number(form.lat) : null,
            lng: form.lng ? Number(form.lng) : null,
            public_phone: form.public_phone,
            public_email: form.public_email,
            public_working_hours_enabled: form.public_working_hours_enabled,
            public_working_hours: form.public_working_hours,
            public_parking_notes: form.public_parking_notes,
            public_transit_notes: form.public_transit_notes,
            public_included_items: form.public_included_items,
            amenity_ids: selectedAmenityIds
          })
        },
        token
      );
      setMessage("Location updated");
      router.push("/owner/locations");
    } catch (err: any) {
      setMessage(err?.message || "Failed to update location");
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
          <h2 className="text-2xl font-semibold">Edit Location</h2>
          <p className="text-textSecondary">Update details and geo coordinates.</p>
        </div>
        <Card>
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="name">Location name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <PlaceAutocomplete
                id="address"
                value={form.address}
                onChange={(value) => setForm({ ...form, address: value })}
                onSelect={applyPlace}
                placeholder="Start typing an address…"
              />
              {(form.city || form.state || form.postal_code || form.lat) && (
                <p className="text-xs text-textSecondary">
                  {[form.city, form.state, form.postal_code].filter(Boolean).join(", ")}
                  {form.lat && form.lng ? ` · ${form.lat}, ${form.lng}` : ""}
                </p>
              )}
              <button
                type="button"
                className="self-start text-xs text-teal-700 hover:underline"
                onClick={() => setShowAddressDetails((v) => !v)}
              >
                {showAddressDetails ? "Hide details" : "Edit address details"}
              </button>
            </div>
            {showAddressDetails && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Postal code</Label>
                    <Input
                      id="postal_code"
                      value={form.postal_code}
                      onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="neighborhood">Neighborhood</Label>
                  <Input
                    id="neighborhood"
                    value={form.neighborhood}
                    onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lat">Latitude</Label>
                    <Input
                      id="lat"
                      value={form.lat}
                      onChange={(e) => setForm({ ...form, lat: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lng">Longitude</Label>
                    <Input
                      id="lng"
                      value={form.lng}
                      onChange={(e) => setForm({ ...form, lng: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label>Amenities</Label>
              <AmenitySelector
                amenities={orgAmenities}
                selectedIds={selectedAmenityIds}
                onChange={setSelectedAmenityIds}
                emptyMessage="This organization does not have any amenities yet. Add them from Settings."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="granularity">Booking granularity</Label>
              <Input
                id="granularity"
                value={form.booking_granularity}
                onChange={(e) => setForm({ ...form, booking_granularity: e.target.value })}
              />
            </div>
            <div className="rounded-md border border-border bg-surface2 p-4">
              <div className="text-sm font-semibold text-textPrimary">Public Listing Details</div>
              <div className="mt-1 text-sm text-textSecondary">
                These fields appear on the public marketplace detail page.
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="public_phone">Public phone</Label>
                <Input
                  id="public_phone"
                  value={form.public_phone}
                  onChange={(e) => setForm({ ...form, public_phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="public_email">Public email</Label>
                <Input
                  id="public_email"
                  value={form.public_email}
                  onChange={(e) => setForm({ ...form, public_email: e.target.value })}
                />
              </div>
            </div>
            <WorkingHoursEditor
              enabled={form.public_working_hours_enabled}
              hours={form.public_working_hours}
              onChange={(next) =>
                setForm({
                  ...form,
                  public_working_hours_enabled: next.enabled,
                  public_working_hours: next.hours,
                })
              }
            />
            <div className="grid gap-2">
              <Label htmlFor="public_parking_notes">Parking notes</Label>
              <textarea
                id="public_parking_notes"
                value={form.public_parking_notes}
                onChange={(e) => setForm({ ...form, public_parking_notes: e.target.value })}
                rows={4}
                className="min-h-[112px] rounded-md border border-border bg-surface px-3 py-2 text-sm text-textPrimary outline-none"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="public_transit_notes">Transit notes</Label>
              <textarea
                id="public_transit_notes"
                value={form.public_transit_notes}
                onChange={(e) => setForm({ ...form, public_transit_notes: e.target.value })}
                rows={4}
                className="min-h-[112px] rounded-md border border-border bg-surface px-3 py-2 text-sm text-textPrimary outline-none"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="public_included_items">Included items</Label>
              <textarea
                id="public_included_items"
                value={form.public_included_items}
                onChange={(e) => setForm({ ...form, public_included_items: e.target.value })}
                rows={4}
                className="min-h-[112px] rounded-md border border-border bg-surface px-3 py-2 text-sm text-textPrimary outline-none"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex gap-3">
              <Button type="button" onClick={handleSave}>
                Save Changes
              </Button>
              <Link href="/owner/locations">
                <Button type="button" variant="secondary">
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
