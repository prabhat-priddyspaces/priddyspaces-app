"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { MoneyValue } from "@/lib/money";

interface Space {
  public_id: string;
  name: string;
  space_type: string;
  capacity: number;
  price_monthly?: MoneyValue | null;
  price_daily?: MoneyValue | null;
  availability_status: string;
}

export function SpaceList({ locationPublicId }: { locationPublicId: string }) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [message, setMessage] = useState("");

  async function loadSpaces() {
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<Space[]>(
      `/api/locations/${locationPublicId}/spaces`,
      { method: "GET" },
      token
    );
    setSpaces(list);
  }

  useEffect(() => {
    loadSpaces().catch((err) => setMessage(err?.message || "Failed to load spaces"));
  }, [locationPublicId]);

  async function overridePrice(space: Space, monthly: string, daily: string, reason: string) {
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/spaces/${space.public_id}/override-price`,
      {
        method: "PATCH",
        body: JSON.stringify({
          price_daily: daily ? daily : null,
          price_monthly: monthly ? monthly : null,
          reason
        })
      },
      token
    );
    setMessage("Override saved");
    loadSpaces();
  }

  return (
    <div className="grid gap-4">
      {message ? <div className="text-xs text-textMuted">{message}</div> : null}
      {spaces.length === 0 ? (
        <div className="text-sm text-textMuted">No spaces yet.</div>
      ) : (
        spaces.map((space) => (
          <SpaceRow
            key={space.public_id}
            space={space}
            locationPublicId={locationPublicId}
            onSave={overridePrice}
          />
        ))
      )}
    </div>
  );
}

function SpaceRow({
  space,
  locationPublicId,
  onSave
}: {
  space: Space;
  locationPublicId: string;
  onSave: (space: Space, monthly: string, daily: string, reason: string) => void;
}) {
  const [monthly, setMonthly] = useState(space.price_monthly?.toString() || "");
  const [daily, setDaily] = useState(space.price_daily?.toString() || "");
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="text-sm font-medium text-textPrimary">{space.name}</div>
      <div className="mt-1 text-sm text-textMuted">{space.space_type}</div>
      <div className="mt-1 text-sm text-textSecondary">
        Capacity {space.capacity} • {space.availability_status}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <Input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
          placeholder="Monthly USD"
        />
        <Input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={daily}
          onChange={(e) => setDaily(e.target.value)}
          placeholder="Daily USD"
        />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
      </div>
      <div className="mt-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onSave(space, monthly, daily, reason)}>
            Save Override
          </Button>
          <Link
            href={`/owner/spaces/media?spaceId=${encodeURIComponent(space.public_id)}&locationId=${encodeURIComponent(locationPublicId)}`}
          >
            <Button size="sm" variant="secondary">
              Images
            </Button>
          </Link>
          <Link href={`/owner/spaces/edit?spaceId=${encodeURIComponent(space.public_id)}`}>
            <Button size="sm" variant="ghost">
              Edit
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
