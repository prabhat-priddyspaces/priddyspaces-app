"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatAdminLabel } from "@/lib/admin-format";
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
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Listings</h2>
          <p className="text-text-2">Track listing visibility and approval dependency across the marketplace.</p>
        </div>
        <Card className="p-4">
          <div className="flex gap-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search listing, location, or company" />
            <Button type="button" onClick={() => loadRows(query).catch((err) => setMessage(String(err)))}>
              Search
            </Button>
          </div>
        </Card>
        {message ? <div className="text-sm text-danger">{message}</div> : null}
        <div className="grid gap-3">
          {rows.map((row) => (
            <Card key={row.space_public_id} className="p-4">
              <div className="font-semibold text-text">{row.space_name}</div>
              <div className="text-sm text-text-3">
                {row.organization_name} • {row.location_name} • {formatAdminLabel(row.space_type)} • {formatAdminLabel(row.visibility)}
              </div>
              <div className="text-sm text-text-3">
                Approval {formatAdminLabel(row.organization_review_status)} • Bookings {row.bookings} • Requests {row.booking_requests}
              </div>
            </Card>
          ))}
          {rows.length === 0 ? <Card className="p-4 text-sm text-text-3">No listings found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
