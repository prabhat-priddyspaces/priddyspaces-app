"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface ListingRecord {
  space_public_id: string;
  space_name: string;
  space_type: string;
  visibility: string;
  availability_status: string;
  location_name: string;
  organization_name: string;
  organization_review_status: string;
  bookings: number;
  booking_requests: number;
}

export default function AdminListingsPage() {
  const [rows, setRows] = useState<ListingRecord[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  async function loadRows(search: string) {
    const token = getAccessToken() ?? undefined;
    const q = search.trim();
    const path = q ? `/api/admin/listings?q=${encodeURIComponent(q)}` : "/api/admin/listings";
    const result = await apiFetch<ListingRecord[]>(path, { method: "GET" }, token);
    setRows(result);
  }

  useEffect(() => {
    loadRows("").catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load listings"));
  }, []);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Listings</h2>
          <p className="text-textSecondary">Track listing visibility and approval dependency across the marketplace.</p>
        </div>
        <Card className="p-4">
          <div className="flex gap-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search listing, location, or company" />
            <Button type="button" onClick={() => loadRows(query).catch((err) => setMessage(String(err)))}>
              Search
            </Button>
          </div>
        </Card>
        {message ? <div className="text-sm text-error">{message}</div> : null}
        <div className="grid gap-3">
          {rows.map((row) => (
            <Card key={row.space_public_id} className="p-4">
              <div className="font-semibold text-textPrimary">{row.space_name}</div>
              <div className="text-sm text-textMuted">
                {row.organization_name} • {row.location_name} • {row.space_type} • {row.visibility}
              </div>
              <div className="text-sm text-textMuted">
                Approval {row.organization_review_status} • Bookings {row.bookings} • Requests {row.booking_requests}
              </div>
            </Card>
          ))}
          {rows.length === 0 ? <Card className="p-4 text-sm text-textMuted">No listings found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
