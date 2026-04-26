"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MeResponse } from "@/lib/me";

interface OwnerCompany {
  public_id: string;
  name: string;
  review_status: string;
  review_notes: string | null;
  commission_override_pct: number | null;
  stripe_connected: boolean;
  locations: number;
  listings: number;
  owner: {
    email: string | null;
    name: string | null;
  };
  review_history: Array<{
    action: string;
    created_at: string | null;
  }>;
}

export default function AdminOwnerCompaniesPage() {
  const [companies, setCompanies] = useState<OwnerCompany[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [commissionOverrides, setCommissionOverrides] = useState<Record<string, string>>({});

  async function loadCompanies(search: string) {
    const token = getAccessToken() ?? undefined;
    const q = search.trim();
    const path = q ? `/api/admin/owner-companies?q=${encodeURIComponent(q)}` : "/api/admin/owner-companies";
    const result = await apiFetch<OwnerCompany[]>(path, { method: "GET" }, token);
    setCompanies(result);
    const nextNotes: Record<string, string> = {};
    const nextCommission: Record<string, string> = {};
    result.forEach((company) => {
      nextNotes[company.public_id] = company.review_notes ?? "";
      nextCommission[company.public_id] = company.commission_override_pct?.toString() ?? "";
    });
    setNotes(nextNotes);
    setCommissionOverrides(nextCommission);
  }

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token).then(setMe).catch(() => null);
    loadCompanies("").catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load companies"));
  }, []);

  async function updateCompany(publicId: string, reviewStatus: string | null) {
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/admin/owner-companies/${publicId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          review_status: reviewStatus,
          review_notes: notes[publicId] || null,
          commission_override_pct:
            commissionOverrides[publicId] === "" ? null : Number(commissionOverrides[publicId]),
        }),
      },
      token
    );
    await loadCompanies(query);
  }

  const canEdit = me?.platform_role === "superadmin" || me?.platform_role === "admin";

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Owner Companies</h2>
          <p className="text-textSecondary">Approve, reject, and manage marketplace commission overrides.</p>
        </div>
        <Card className="p-4">
          <div className="flex gap-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company" />
            <Button type="button" onClick={() => loadCompanies(query).catch((err) => setMessage(String(err)))}>
              Search
            </Button>
          </div>
        </Card>
        {message ? <div className="text-sm text-error">{message}</div> : null}
        <div className="grid gap-4">
          {companies.map((company) => (
            <Card key={company.public_id} className="p-4">
              <div className="space-y-3">
                <div>
                  <div className="font-semibold text-textPrimary">{company.name}</div>
                  <div className="text-sm text-textMuted">
                    {company.owner.name || company.owner.email} • {company.review_status} • {company.locations} locations • {company.listings} listings
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={notes[company.public_id] ?? ""}
                    onChange={(e) => setNotes((current) => ({ ...current, [company.public_id]: e.target.value }))}
                    placeholder="Review notes"
                    disabled={!canEdit}
                  />
                  <Input
                    value={commissionOverrides[company.public_id] ?? ""}
                    onChange={(e) =>
                      setCommissionOverrides((current) => ({ ...current, [company.public_id]: e.target.value }))
                    }
                    placeholder="Commission override %"
                    disabled={!canEdit}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={!canEdit} onClick={() => updateCompany(company.public_id, "approved").catch((err) => setMessage(String(err)))}>
                    Approve
                  </Button>
                  <Button type="button" variant="secondary" disabled={!canEdit} onClick={() => updateCompany(company.public_id, "rejected").catch((err) => setMessage(String(err)))}>
                    Reject
                  </Button>
                  <Button type="button" variant="secondary" disabled={!canEdit} onClick={() => updateCompany(company.public_id, null).catch((err) => setMessage(String(err)))}>
                    Save Notes/Commission
                  </Button>
                </div>
                {company.review_history.length ? (
                  <div className="text-xs text-textMuted">
                    Latest history: {company.review_history[0].action} • {company.review_history[0].created_at}
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
          {companies.length === 0 ? <Card className="p-4 text-sm text-textMuted">No owner companies found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
