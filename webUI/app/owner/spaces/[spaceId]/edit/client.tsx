"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeaseTermsManager } from "@/components/lease-terms-manager";
import { VolumeDiscountManager } from "@/components/volume-discount-manager";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface Space {
  public_id: string;
  name: string;
  space_type: string;
  capacity: number;
  price_monthly: number | null;
  price_daily: number | null;
  price_hourly: number | null;
  availability_status: string;
  availability_start_time: string | null;
  availability_end_time: string | null;
  visibility: string;
}

export function EditSpaceClient() {
  const params = useParams<{ spaceId: string }>();
  const router = useRouter();
  const spaceId = params?.spaceId || "";
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
    visibility: "public"
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
          visibility: space.visibility || "public"
        });
      })
      .catch((err: any) => setMessage(err?.message || "Failed to load space"))
      .finally(() => setLoading(false));
  }, [spaceId]);

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
            price_monthly: form.price_monthly ? Number(form.price_monthly) : null,
            price_daily: form.price_daily ? Number(form.price_daily) : null,
            price_hourly: form.price_hourly ? Number(form.price_hourly) : null,
            availability_status: form.availability_status,
            availability_start_time: form.availability_start_time || null,
            availability_end_time: form.availability_end_time || null,
            visibility: form.visibility
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
                <Label htmlFor="hourly">Hourly price (cents)</Label>
                <Input
                  id="hourly"
                  value={form.price_hourly}
                  onChange={(e) => setForm({ ...form, price_hourly: e.target.value })}
                  placeholder="3000"
                />
                <div className="text-xs text-textMuted">
                  Required for hourly meeting-room bookings (3000 = $30/hr).
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
                  Used for "Full day". Hourly bookings auto-cap to this amount.
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
