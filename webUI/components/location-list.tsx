"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Location {
  public_id: string;
  name: string;
  address: string;
  city: string | null;
  timezone: string;
  status: string;
  amenities: Array<{ id: number; name: string }>;
}

export function LocationList() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = getAccessToken() ?? undefined;
        const list = await apiFetch<Location[]>("/api/locations", { method: "GET" }, token);
        setLocations(list);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load locations");
      }
    }

    load().catch(() => null);
  }, []);

  if (error) {
    return <div className="text-sm text-error">{error}</div>;
  }

  if (locations.length === 0) {
    return <div className="text-sm text-textMuted">No locations yet.</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {locations.map((location) => (
        <Card key={location.public_id} className="p-4">
          <div className="text-lg font-semibold text-textPrimary">{location.name}</div>
          <div className="mt-1 text-sm text-textSecondary">{location.address}</div>
          <div className="mt-1 text-sm text-textMuted">
            {location.city || "City not set"} • {location.timezone}
          </div>
          <div className="mt-1 text-sm text-textMuted">Status: {location.status}</div>
          <div className="mt-2 text-sm text-textMuted">
            Amenities:{" "}
            {location.amenities.length > 0
              ? location.amenities.map((amenity) => amenity.name).join(", ")
              : "No amenities selected"}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/owner/locations/spaces?locationId=${location.public_id}`}>
              <Button size="sm">Inventory</Button>
            </Link>
            <Link href={`/owner/spaces/new?locationId=${location.public_id}`}>
              <Button size="sm" variant="secondary">
                Add Room
              </Button>
            </Link>
            <Link href={`/owner/locations/${location.public_id}/edit`}>
              <Button size="sm" variant="ghost">
                Edit
              </Button>
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
