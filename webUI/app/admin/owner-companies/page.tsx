"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatAdminDateTime, formatAdminLabel } from "@/lib/admin-format";
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
    actor_email: string | null;
    actor_name: string | null;
    before_state: Record<string, unknown> | null;
    after_state: Record<string, unknown> | null;
    created_at: string | null;
  }>;
}

function formatHistoryValue(value: unknown) {
  if (value === null || typeof value === "undefined" || value === "") return "—";
  if (typeof value === "number") return `${value}`;
  return formatAdminLabel(String(value));
}

function reviewHistorySummary(
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null
) {
  if (!afterState) return "No detail captured";
  const fields = [
    ["review_status", "Review status"],
    ["review_notes", "Notes"],
    ["commission_override_pct", "Commission override"],
  ] as const;
  const changes = fields
    .filter(([key]) => beforeState?.[key] !== afterState[key])
    .map(([key, label]) => `${label}: ${formatHistoryValue(beforeState?.[key])} to ${formatHistoryValue(afterState[key])}`);
  return changes.length ? changes.join(" • ") : "Saved without field changes";
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
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Owner Companies</h2>
          <p className="text-text-2">Approve, reject, and manage marketplace commission overrides.</p>
        </div>
        <Card className="p-4">
          <div className="flex gap-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company" />
            <Button type="button" onClick={() => loadCompanies(query).catch((err) => setMessage(String(err)))}>
              Search
            </Button>
          </div>
        </Card>
        {message ? <div className="text-sm text-danger">{message}</div> : null}
        <div className="grid gap-4">
          {companies.map((company) => (
            <Card key={company.public_id} className="p-4">
              <div className="space-y-3">
                <div>
                  <div className="font-semibold text-text">{company.name}</div>
                  <div className="text-sm text-text-3">
                    {company.owner.name || company.owner.email} • {formatAdminLabel(company.review_status)} • {company.locations} locations • {company.listings} listings
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
                  <Button type="button" disabled={!canEdit || company.review_status === "approved"} onClick={() => updateCompany(company.public_id, "approved").catch((err) => setMessage(String(err)))}>
                    {company.review_status === "approved" ? "Already approved" : "Approve"}
                  </Button>
                  <Button type="button" variant="secondary" disabled={!canEdit} onClick={() => updateCompany(company.public_id, "rejected").catch((err) => setMessage(String(err)))}>
                    Reject
                  </Button>
                  <Button type="button" variant="secondary" disabled={!canEdit} onClick={() => updateCompany(company.public_id, null).catch((err) => setMessage(String(err)))}>
                    Save Notes/Commission
                  </Button>
                </div>
                {company.review_history.length ? (
                  <details className="rounded-md border border-line bg-surface-2/40 p-3 text-xs">
                    <summary className="cursor-pointer font-medium text-text">
                      Review history ({company.review_history.length})
                    </summary>
                    <div className="mt-3 grid gap-2">
                      {company.review_history.map((history, index) => (
                        <div key={`${history.created_at}-${index}`} className="rounded-sm border border-line bg-surface p-2">
                          <div className="font-medium text-text">{formatAdminLabel(history.action)}</div>
                          <div className="mt-1 text-text-3">
                            {(history.actor_name || history.actor_email || "System")} • {formatAdminDateTime(history.created_at)}
                          </div>
                          <div className="mt-1 text-text-2">
                            {reviewHistorySummary(history.before_state, history.after_state)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </Card>
          ))}
          {companies.length === 0 ? <Card className="p-4 text-sm text-text-3">No owner companies found.</Card> : null}
        </div>
      </div>
    </AdminShell>
  );
}
