"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  AddLocationCard,
  LocationCard,
} from "@/components/locations/location-card";

interface Location {
  public_id: string;
  organization_public_id: string;
  name: string;
  address: string;
  city: string | null;
  timezone: string;
  status: string;
  amenities: Array<{ id: number; name: string }>;
}

interface Space {
  public_id: string;
  availability_status: string;
}

interface ApprovedBookingRequest {
  public_id: string;
  location_public_id: string | null;
  end_datetime: string;
}

interface Organization {
  public_id: string;
  name: string;
  review_status: string;
}

interface MarketplaceReadiness {
  organization_public_id: string;
  status: string;
  payment_hidden_listing_count: number;
}

interface ApprovalRequestResponse {
  public_id: string;
  review_status: string;
  recipients_notified: number;
}

export function LocationList() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [organizations, setOrganizations] = useState<Record<string, Organization>>({});
  const [paymentReadiness, setPaymentReadiness] = useState<Record<string, MarketplaceReadiness>>({});
  const [spacesByLocation, setSpacesByLocation] = useState<Record<string, Space[]>>({});
  const [approvedRequests, setApprovedRequests] = useState<ApprovedBookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [approvalMessage, setApprovalMessage] = useState("");
  const [requestingOrgId, setRequestingOrgId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = getAccessToken() ?? undefined;
        const [list, orgList, readinessList, approvedList] = await Promise.all([
          apiFetch<Location[]>("/api/locations", { method: "GET" }, token),
          apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token),
          apiFetch<MarketplaceReadiness[]>("/api/owner/marketplace-readiness", { method: "GET" }, token).catch(() => []),
          apiFetch<ApprovedBookingRequest[]>("/api/booking-requests?status=approved", { method: "GET" }, token).catch(() => []),
        ]);
        setLocations(list);
        setOrganizations(Object.fromEntries(orgList.map((org) => [org.public_id, org])));
        setPaymentReadiness(
          Object.fromEntries((Array.isArray(readinessList) ? readinessList : []).map((item) => [item.organization_public_id, item]))
        );
        setApprovedRequests(Array.isArray(approvedList) ? approvedList : []);
        const spacesEntries = await Promise.all(
          list.map(async (loc) => {
            try {
              const spaces = await apiFetch<Space[]>(
                `/api/locations/${loc.public_id}/spaces`,
                { method: "GET" },
                token
              );
              return [loc.public_id, spaces] as const;
            } catch {
              return [loc.public_id, []] as const;
            }
          })
        );
        setSpacesByLocation(Object.fromEntries(spacesEntries));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load locations");
      } finally {
        setLoading(false);
      }
    }

    load().catch(() => null);
  }, []);

  async function requestApproval(organizationPublicId: string) {
    const token = getAccessToken() ?? undefined;
    setRequestingOrgId(organizationPublicId);
    setApprovalMessage("");
    setError(null);
    try {
      const result = await apiFetch<ApprovalRequestResponse>(
        `/api/orgs/${organizationPublicId}/approval-request`,
        { method: "POST" },
        token
      );
      setOrganizations((current) => {
        const currentOrg = current[organizationPublicId];
        if (!currentOrg) return current;
        return {
          ...current,
          [organizationPublicId]: {
            ...currentOrg,
            review_status: result.review_status,
          },
        };
      });
      setApprovalMessage("Approval request sent to Admins.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request approval");
    } finally {
      setRequestingOrgId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter((l) => {
      const matchesQuery =
        !q ||
        l.name.toLowerCase().includes(q) ||
        (l.city ?? "").toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      const matchesCity = cityFilter === "all" || (l.city ?? "") === cityFilter;
      return matchesQuery && matchesStatus && matchesCity;
    });
  }, [cityFilter, locations, query, statusFilter]);

  const cityOptions = useMemo(
    () =>
      Array.from(new Set(locations.map((location) => location.city).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b)
      ),
    [locations]
  );

  const upcomingApprovedByLocation = useMemo(() => {
    const now = Date.now();
    return approvedRequests.reduce<Record<string, number>>((counts, request) => {
      if (!request.location_public_id) return counts;
      const endTime = new Date(request.end_datetime).getTime();
      if (!Number.isFinite(endTime) || endTime < now) return counts;
      counts[request.location_public_id] = (counts[request.location_public_id] ?? 0) + 1;
      return counts;
    }, {});
  }, [approvedRequests]);

  if (error) {
    return <div className="text-[13px] text-danger">{error}</div>;
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search location, city, address…"
            className="pl-9"
          />
        </div>
        <select
          aria-label="Filter locations by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-[30px] rounded-lg border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-text outline-none hover:border-text-3"
        >
          <option value="all">Status · All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          aria-label="Filter locations by city"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="h-[30px] rounded-lg border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-text outline-none hover:border-text-3"
        >
          <option value="all">City · All</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <Link href="/owner/locations/new">
          <Button variant="primary" size="sm">
            <Plus size={14} /> New location
          </Button>
        </Link>
      </div>
      {approvalMessage ? (
        <div className="mb-3 rounded-[8px] border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          {approvalMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="text-[13px] text-text-3">Loading…</div>
      ) : (
        <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
          {filtered.map((location, i) => {
            const spaces = spacesByLocation[location.public_id] ?? [];
            const total = spaces.length;
            const org = organizations[location.organization_public_id];
            const readiness = paymentReadiness[location.organization_public_id];
            return (
              <LocationCard
                key={location.public_id}
                publicId={location.public_id}
                name={location.name}
                city={location.city}
                address={location.address}
                rooms={total}
                upcomingApprovedCount={upcomingApprovedByLocation[location.public_id] ?? 0}
                // HANDOFF: per-location MTD net not yet returned by /api/locations.
                mtdNet={null}
                status={location.status}
                organizationReviewStatus={org?.review_status}
                marketplacePaymentStatus={readiness?.status}
                paymentHiddenListings={readiness?.payment_hidden_listing_count}
                onRequestApproval={
                  org ? () => requestApproval(org.public_id).catch(() => null) : undefined
                }
                requestingApproval={requestingOrgId === org?.public_id}
                primary={i === 0}
                amenities={location.amenities}
              />
            );
          })}
          <AddLocationCard />
        </div>
      )}
    </>
  );
}
