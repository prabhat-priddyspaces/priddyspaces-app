"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

interface MarketplaceSpace {
  space_public_id: string;
  space_type: string;
  capacity: number;
  price_daily: number | null;
  price_monthly: number | null;
  availability_status: string;
  availability_start_time: string | null;
  availability_end_time: string | null;
  location_public_id: string;
  location_name: string;
  location_address: string;
  location_city: string | null;
  location_timezone: string;
  amenities: string | null;
  image_url: string | null;
  distance_km: number | null;
}

interface MarketplaceBrowserProps {
  detailHrefBase: string;
  title?: string;
  subtitle?: string;
  showCustomerActions?: boolean;
  showAuthActions?: boolean;
}

export function MarketplaceBrowser({
  detailHrefBase,
  title = "Find a space",
  subtitle = "Search locations by city and browse available spaces.",
  showCustomerActions = false,
  showAuthActions = false,
}: MarketplaceBrowserProps) {
  const [city, setCity] = useState("");
  const [spaceType, setSpaceType] = useState("");
  const [minCapacity, setMinCapacity] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [spaces, setSpaces] = useState<MarketplaceSpace[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function loadSpaces(markSearched = true) {
    setError("");
    setLoading(true);
    if (markSearched) setSearched(true);
    try {
      const params = new URLSearchParams();
      if (city.trim()) params.set("city", city.trim());
      if (spaceType.trim()) params.set("space_type", spaceType.trim());
      if (minCapacity.trim()) params.set("min_capacity", minCapacity.trim());
      if (maxPrice.trim()) params.set("max_price", maxPrice.trim());
      const query = params.toString();
      const url = query ? `/api/marketplace/search?${query}` : "/api/marketplace/search";
      const list = await apiFetch<MarketplaceSpace[]>(url, { method: "GET" });
      setSpaces(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load locations");
      setSpaces([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSpaces(false).catch(() => null);
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await loadSpaces(true);
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-textPrimary">{title}</h1>
            <p className="mt-1 text-textSecondary">{subtitle}</p>
          </div>
          {showCustomerActions ? (
            <div className="flex items-center gap-2">
              <Link href="/customer/subscriptions">
                <Button variant="secondary">Memberships</Button>
              </Link>
              <Link href="/customer/payments">
                <Button variant="secondary">Payments</Button>
              </Link>
              <Link href="/customer/requests">
                <Button variant="secondary">My requests</Button>
              </Link>
            </div>
          ) : showAuthActions ? (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="secondary">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button>Create account</Button>
              </Link>
            </div>
          ) : null}
        </div>
        <form onSubmit={handleSearch} className="mt-6 flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] space-y-2">
            <Label htmlFor="city">City or market</Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. San Francisco"
            />
          </div>
          <div className="min-w-[180px] space-y-2">
            <Label htmlFor="type">Space type</Label>
            <select
              id="type"
              value={spaceType}
              onChange={(e) => setSpaceType(e.target.value)}
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
            >
              <option value="">Any</option>
              <option value="conference_room">Conference Room</option>
              <option value="private_office">Private Office</option>
              <option value="shared_desk">Shared Desk</option>
              <option value="virtual_office">Virtual Office</option>
            </select>
          </div>
          <div className="min-w-[140px] space-y-2">
            <Label htmlFor="capacity">Min capacity</Label>
            <Input
              id="capacity"
              value={minCapacity}
              onChange={(e) => setMinCapacity(e.target.value)}
              placeholder="2"
            />
          </div>
          <div className="min-w-[140px] space-y-2">
            <Label htmlFor="price">Max price</Label>
            <Input
              id="price"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="200"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </Button>
        </form>
        {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}
        {(searched || spaces.length > 0) && !loading ? (
          spaces.length === 0 ? (
            <p className="mt-6 text-sm text-textMuted">No spaces found.</p>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {spaces.map((space) => (
                <Card key={space.space_public_id} className="p-4">
                  {space.image_url ? (
                    <img
                      src={space.image_url}
                      alt={space.space_type}
                      className="mb-3 h-40 w-full rounded-md object-cover"
                    />
                  ) : null}
                  <div className="font-semibold text-textPrimary">{space.space_type}</div>
                  <div className="mt-1 text-sm text-textSecondary">{space.location_name}</div>
                  <div className="mt-1 text-sm text-textMuted">{space.location_address}</div>
                  {space.location_city ? (
                    <div className="mt-1 text-sm text-textMuted">{space.location_city}</div>
                  ) : null}
                  <div className="mt-2 text-sm text-textSecondary">
                    Capacity {space.capacity} • {space.availability_status}
                  </div>
                  {space.amenities ? (
                    <div className="mt-1 text-sm text-textMuted">Amenities: {space.amenities}</div>
                  ) : null}
                  {space.availability_start_time || space.availability_end_time ? (
                    <div className="mt-1 text-sm text-textMuted">
                      Hours: {space.availability_start_time || "—"} to {space.availability_end_time || "—"}
                    </div>
                  ) : null}
                  <div className="mt-1 text-sm text-textMuted">
                    {space.price_monthly != null && `$${space.price_monthly}/mo `}
                    {space.price_daily != null && `$${space.price_daily}/day`}
                  </div>
                  <div className="mt-4">
                    <Link href={`${detailHrefBase}/${space.space_public_id}`}>
                      <Button size="sm">View details</Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : null}
      </div>
    </main>
  );
}
