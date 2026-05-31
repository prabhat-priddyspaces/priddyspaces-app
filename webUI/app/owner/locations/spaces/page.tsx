"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { SpaceList } from "@/components/space-list";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface LocationOption {
  public_id: string;
  name: string;
  city: string | null;
}

function LocationSpacesContent() {
  const searchParams = useSearchParams();
  const locationId = useMemo(() => searchParams.get("locationId") || "", [searchParams]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<LocationOption[]>("/api/locations", { method: "GET" }, token)
      .then(setLocations)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load locations"));
  }, []);

  const selectedLocation = locations.find((location) => location.public_id === locationId) || null;

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Inventory</h2>
            <p className="text-textSecondary">
              Manage rooms, desks, pricing overrides, and space photos.
            </p>
          </div>
          {locationId ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`/owner/locations/${encodeURIComponent(locationId)}/edit`}>
                <Button size="sm" variant="secondary">Location settings</Button>
              </Link>
              <Link href={`/owner/spaces/new?locationId=${encodeURIComponent(locationId)}`}>
                <Button size="sm">Add Room</Button>
              </Link>
            </div>
          ) : (
            <Link href="/owner/locations/new">
              <Button size="sm">New Location</Button>
            </Link>
          )}
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        {locationId ? (
          <>
            <Card className="p-4">
              <div className="text-sm font-semibold text-textPrimary">
                {selectedLocation?.name || "Selected location"}
              </div>
              <div className="mt-1 text-sm text-textMuted">
                {selectedLocation?.city || "Inventory for this location"}
              </div>
              <div className="mt-3">
                <Link href={`/owner/locations/${encodeURIComponent(locationId)}/edit`}>
                  <Button size="sm" variant="secondary">Edit location settings</Button>
                </Link>
              </div>
            </Card>
            <Card>
              <SpaceList locationPublicId={locationId} />
            </Card>
          </>
        ) : locations.length === 0 ? (
          <Card className="p-6">
            <div className="text-sm text-textMuted">No owner locations are ready for inventory yet. Create one to begin adding rooms.</div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {locations.map((location) => (
              <Card key={location.public_id} className="p-4">
                <div className="text-base font-semibold text-textPrimary">{location.name}</div>
                <div className="mt-1 text-sm text-textMuted">{location.city || "City not set"}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/owner/locations/spaces?locationId=${encodeURIComponent(location.public_id)}`}>
                    <Button size="sm">Manage inventory</Button>
                  </Link>
                  <Link href={`/owner/spaces/new?locationId=${encodeURIComponent(location.public_id)}`}>
                    <Button size="sm" variant="secondary">
                      Add room
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function LocationSpaces() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="grid gap-6">
            <div>
              <h2 className="text-2xl font-semibold">Inventory</h2>
              <p className="text-textSecondary">Loading inventory...</p>
            </div>
          </div>
        </AppShell>
      }
    >
      <LocationSpacesContent />
    </Suspense>
  );
}
