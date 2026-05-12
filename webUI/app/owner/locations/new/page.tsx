"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AmenitySelector } from "@/components/amenity-selector";
import { PlaceAutocomplete, type PlaceDetails } from "@/components/place-autocomplete";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Organization {
  public_id: string;
  name: string;
}

interface Amenity {
  id: number;
  name: string;
}

export default function NewLocation() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [orgAmenities, setOrgAmenities] = useState<Amenity[]>([]);
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<number[]>([]);
  const [loadingAmenities, setLoadingAmenities] = useState(false);
  const [form, setForm] = useState({
    organization_public_id: "",
    organization_name: "",
    name: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    neighborhood: "",
    lat: "",
    lng: "",
    timezone: "America/New_York",
    public_phone: "",
    public_email: "",
    public_hours_weekdays: "",
    public_hours_weekends: "",
    public_parking_notes: "",
    public_transit_notes: "",
    public_included_items: "",
    booking_granularity: "60m",
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
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
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      setForm((current) => ({ ...current, timezone }));
    }

    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      try {
        const list = await apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token);
        setOrgs(list);
        if (list.length > 0) {
          setForm((current) => ({
            ...current,
            organization_public_id: current.organization_public_id || list[0].public_id,
          }));
        }
      } catch (err: unknown) {
        setMessage(err instanceof Error ? err.message : "Failed to load organizations");
      } finally {
        setLoadingOrgs(false);
      }
    }

    loadOrgs().catch(() => null);
  }, []);

  useEffect(() => {
    async function loadAmenities() {
      if (!form.organization_public_id) {
        setOrgAmenities([]);
        setSelectedAmenityIds([]);
        return;
      }
      const token = getAccessToken() ?? undefined;
      setLoadingAmenities(true);
      try {
        const list = await apiFetch<Amenity[]>(
          `/api/orgs/${form.organization_public_id}/amenities`,
          { method: "GET" },
          token
        );
        setOrgAmenities(list);
        setSelectedAmenityIds((current) =>
          current.filter((amenityId) => list.some((amenity) => amenity.id === amenityId))
        );
      } catch (err: unknown) {
        setMessage(err instanceof Error ? err.message : "Failed to load organization amenities");
      } finally {
        setLoadingAmenities(false);
      }
    }

    loadAmenities().catch(() => null);
  }, [form.organization_public_id]);

  async function ensureOrganization(): Promise<string> {
    const token = getAccessToken() ?? undefined;
    if (form.organization_public_id) {
      return form.organization_public_id;
    }
    if (!form.organization_name.trim()) {
      throw new Error("Choose an organization or enter a new organization name.");
    }
    const org = await apiFetch<Organization>(
      "/api/orgs",
      {
        method: "POST",
        body: JSON.stringify({ name: form.organization_name.trim() }),
      },
      token
    );
    setOrgs((current) => [...current, org]);
    return org.public_id;
  }

  async function handleSave(nextStep: "locations" | "spaces") {
    try {
      setSaving(true);
      setMessage("");
      if (form.lat && (Number(form.lat) < -90 || Number(form.lat) > 90)) {
        setMessage("Latitude must be between -90 and 90.");
        return;
      }
      if (form.lng && (Number(form.lng) < -180 || Number(form.lng) > 180)) {
        setMessage("Longitude must be between -180 and 180.");
        return;
      }

      const organizationPublicId = await ensureOrganization();
      const token = getAccessToken() ?? undefined;
      const location = await apiFetch<{ public_id: string }>(
        "/api/locations",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: organizationPublicId,
            name: form.name,
            address: form.address,
            city: form.city || undefined,
            state: form.state || undefined,
            postal_code: form.postal_code || undefined,
            neighborhood: form.neighborhood || undefined,
            lat: form.lat ? Number(form.lat) : undefined,
            lng: form.lng ? Number(form.lng) : undefined,
            timezone: form.timezone,
            public_phone: form.public_phone || undefined,
            public_email: form.public_email || undefined,
            public_hours_weekdays: form.public_hours_weekdays || undefined,
            public_hours_weekends: form.public_hours_weekends || undefined,
            public_parking_notes: form.public_parking_notes || undefined,
            public_transit_notes: form.public_transit_notes || undefined,
            public_included_items: form.public_included_items || undefined,
            booking_granularity: form.booking_granularity,
            amenity_ids: selectedAmenityIds,
          }),
        },
        token
      );

      if (nextStep === "spaces") {
        router.push(`/owner/spaces/new?locationId=${encodeURIComponent(location.public_id)}`);
      } else {
        router.push("/owner/locations");
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to create location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold">Create a Location</h2>
          <p className="text-textSecondary">
            Set up a location, then continue straight into adding rooms and photos.
          </p>
        </div>
        <Card>
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="org">Organization</Label>
              <select
                id="org"
                value={form.organization_public_id}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    organization_public_id: e.target.value,
                  }))
                }
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                disabled={loadingOrgs}
              >
                <option value="">Create a new organization below</option>
                {orgs.map((org) => (
                  <option key={org.public_id} value={org.public_id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            {!form.organization_public_id ? (
              <div className="grid gap-2">
                <Label htmlFor="organization_name">New organization name</Label>
                <Input
                  id="organization_name"
                  value={form.organization_name}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      organization_name: e.target.value,
                    }))
                  }
                  placeholder="Priddyspaces Downtown"
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="name">Location name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    name: e.target.value,
                  }))
                }
                placeholder="Downtown HQ"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <PlaceAutocomplete
                id="address"
                value={form.address}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    address: value,
                  }))
                }
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
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        city: e.target.value,
                      }))
                    }
                    placeholder="San Francisco"
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={form.state}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          state: e.target.value,
                        }))
                      }
                      placeholder="CA"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Postal code</Label>
                    <Input
                      id="postal_code"
                      value={form.postal_code}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          postal_code: e.target.value,
                        }))
                      }
                      placeholder="94105"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="neighborhood">Neighborhood</Label>
                  <Input
                    id="neighborhood"
                    value={form.neighborhood}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        neighborhood: e.target.value,
                      }))
                    }
                    placeholder="SoMa"
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lat">Latitude</Label>
                    <Input
                      id="lat"
                      value={form.lat}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          lat: e.target.value,
                        }))
                      }
                      placeholder="37.7749"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lng">Longitude</Label>
                    <Input
                      id="lng"
                      value={form.lng}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          lng: e.target.value,
                        }))
                      }
                      placeholder="-122.4194"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="granularity">Booking granularity</Label>
                <select
                  id="granularity"
                  value={form.booking_granularity}
                  onChange={(e) => setForm({ ...form, booking_granularity: e.target.value })}
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                >
                  <option value="30m">30 minutes</option>
                  <option value="60m">60 minutes</option>
                  <option value="120m">120 minutes</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface2 p-4">
              <div className="text-sm font-semibold text-textPrimary">Public Listing Details</div>
              <div className="mt-1 text-sm text-textSecondary">
                These fields feed the public marketplace detail page.
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="public_phone">Public phone</Label>
                <Input
                  id="public_phone"
                  value={form.public_phone}
                  onChange={(e) => setForm({ ...form, public_phone: e.target.value })}
                  placeholder="(954) 906-7565"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="public_email">Public email</Label>
                <Input
                  id="public_email"
                  value={form.public_email}
                  onChange={(e) => setForm({ ...form, public_email: e.target.value })}
                  placeholder="hello@priddyspaces.com"
                />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="public_hours_weekdays">Weekday hours</Label>
                <Input
                  id="public_hours_weekdays"
                  value={form.public_hours_weekdays}
                  onChange={(e) => setForm({ ...form, public_hours_weekdays: e.target.value })}
                  placeholder="Monday - Friday • 9:00 AM to 5:00 PM"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="public_hours_weekends">Weekend hours</Label>
                <Input
                  id="public_hours_weekends"
                  value={form.public_hours_weekends}
                  onChange={(e) => setForm({ ...form, public_hours_weekends: e.target.value })}
                  placeholder="Saturday - Sunday • Closed"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="public_parking_notes">Parking notes</Label>
              <textarea
                id="public_parking_notes"
                value={form.public_parking_notes}
                onChange={(e) => setForm({ ...form, public_parking_notes: e.target.value })}
                rows={4}
                placeholder={"One line per item\nOnsite parking in covered garage"}
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
                placeholder={"One line per item\nBrightline Fort Lauderdale Station"}
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
                placeholder={"One line per item\nFast, Secure Wi-Fi"}
                className="min-h-[112px] rounded-md border border-border bg-surface px-3 py-2 text-sm text-textPrimary outline-none"
              />
            </div>
            <div className="grid gap-2">
              <Label>Amenities</Label>
              {form.organization_public_id ? (
                <>
                  <AmenitySelector
                    amenities={orgAmenities}
                    selectedIds={selectedAmenityIds}
                    onChange={setSelectedAmenityIds}
                    disabled={loadingAmenities}
                    emptyMessage="This organization does not have any amenities yet. Add them from Settings."
                  />
                  <div className="text-xs text-textMuted">
                    Choose the amenities this location should expose to members.
                  </div>
                </>
              ) : (
                <div className="text-sm text-textMuted">
                  New organizations receive a default amenity catalog when they are created. You can
                  assign amenities to this location after the organization is saved.
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => handleSave("spaces")} disabled={saving}>
                {saving ? "Saving..." : "Save And Add Rooms"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleSave("locations")}
                disabled={saving}
              >
                Save Location Only
              </Button>
              <Link href="/owner/locations">
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
