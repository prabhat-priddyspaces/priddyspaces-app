"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function formatSpaceType(spaceType: string) {
  return spaceType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SpaceList({ locationPublicId }: { locationPublicId: string }) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadSpaces = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<Space[]>(
      `/api/locations/${locationPublicId}/spaces`,
      { method: "GET" },
      token
    );
    setSpaces(list);
  }, [locationPublicId]);

  useEffect(() => {
    loadSpaces().catch((err) => setMessage(err?.message || "Failed to load spaces"));
  }, [loadSpaces]);

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
    await loadSpaces();
  }

  async function duplicateSpace(space: Space) {
    const token = getAccessToken() ?? undefined;
    const copy = await apiFetch<Space>(
      `/api/spaces/${space.public_id}/duplicate`,
      { method: "POST" },
      token
    );
    setMessage(`Duplicated ${space.name} as ${copy.name}`);
    await loadSpaces();
  }

  const typeOptions = useMemo(
    () => Array.from(new Set(spaces.map((space) => space.space_type))).sort(),
    [spaces]
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(spaces.map((space) => space.availability_status))).sort(),
    [spaces]
  );
  const filteredSpaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return spaces.filter((space) => {
      const matchesQuery =
        !normalizedQuery ||
        space.name.toLowerCase().includes(normalizedQuery) ||
        formatSpaceType(space.space_type).toLowerCase().includes(normalizedQuery);
      const matchesType = typeFilter === "all" || space.space_type === typeFilter;
      const matchesStatus = statusFilter === "all" || space.availability_status === statusFilter;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [query, spaces, statusFilter, typeFilter]);

  return (
    <div className="grid gap-4">
      {message ? <div className="text-xs text-textMuted">{message}</div> : null}
      <div className="grid gap-3 rounded-md border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name or type"
          aria-label="Filter spaces"
        />
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
          aria-label="Filter by space type"
        >
          <option value="all">All space types</option>
          {typeOptions.map((spaceType) => (
            <option key={spaceType} value={spaceType}>
              {formatSpaceType(spaceType)}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {formatSpaceType(status)}
            </option>
          ))}
        </select>
      </div>
      {spaces.length === 0 ? (
        <div className="text-sm text-textMuted">No rooms or desks have been added for this location.</div>
      ) : filteredSpaces.length === 0 ? (
        <div className="text-sm text-textMuted">No rooms or desks match these filters.</div>
      ) : (
        filteredSpaces.map((space) => (
          <SpaceRow
            key={space.public_id}
            space={space}
            locationPublicId={locationPublicId}
            onSave={overridePrice}
            onDuplicate={duplicateSpace}
          />
        ))
      )}
    </div>
  );
}

function SpaceRow({
  space,
  locationPublicId,
  onSave,
  onDuplicate
}: {
  space: Space;
  locationPublicId: string;
  onSave: (space: Space, monthly: string, daily: string, reason: string) => void;
  onDuplicate: (space: Space) => void;
}) {
  const [monthly, setMonthly] = useState(space.price_monthly?.toString() || "");
  const [daily, setDaily] = useState(space.price_daily?.toString() || "");
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="text-sm font-medium text-textPrimary">{space.name}</div>
      <div className="mt-1 text-sm text-textMuted">{formatSpaceType(space.space_type)}</div>
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
          <Button size="sm" variant="ghost" onClick={() => onDuplicate(space)}>
            Duplicate
          </Button>
        </div>
      </div>
    </div>
  );
}
