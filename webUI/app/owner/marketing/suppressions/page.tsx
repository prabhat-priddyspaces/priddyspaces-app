"use client";

import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { OrganizationOption, Suppression } from "@/lib/marketing";
import { formatDateTime, statusTone } from "@/lib/marketing";
import { cn } from "@/lib/utils";

export default function MarketingSuppressionsPage() {
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ email: "", reason: "manual" });

  useEffect(() => {
    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      const list = await apiFetch<OrganizationOption[]>("/api/orgs", { method: "GET" }, token);
      setOrgs(list);
      if (list[0]) setOrgId(list[0].public_id);
    }
    loadOrgs().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, []);

  async function loadSuppressions(currentOrgId = orgId) {
    if (!currentOrgId) return;
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<Suppression[]>(`/api/marketing/suppressions?organization_public_id=${encodeURIComponent(currentOrgId)}`, { method: "GET" }, token);
    setSuppressions(list);
  }

  useEffect(() => {
    loadSuppressions().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load suppressions"));
  }, [orgId]);

  async function addSuppression() {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch<Suppression>(
        "/api/marketing/suppressions",
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId, email: form.email, reason: form.reason }) },
        token
      );
      setForm({ email: "", reason: "manual" });
      setMessage("Suppression added");
      await loadSuppressions();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Add failed");
    }
  }

  async function resubscribe(publicId: string) {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(`/api/marketing/suppressions/${publicId}/resubscribe`, { method: "POST" }, token);
      setMessage("Recipient resubscribed");
      await loadSuppressions();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Resubscribe failed");
    }
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Suppressions</h2>
            <p className="text-textSecondary">Unsubscribes, bounces, spam reports, and manual blocks.</p>
          </div>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="h-10 rounded-sm border border-border bg-surface px-3 text-sm">
            {orgs.map((org) => <option key={org.public_id} value={org.public_id}>{org.name}</option>)}
          </select>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <Card className="grid gap-3 p-4 md:grid-cols-[1fr_180px_auto]">
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="member@example.com" />
          <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
            <option value="manual">Manual</option>
            <option value="unsubscribe">Unsubscribe</option>
            <option value="bounce">Bounce</option>
            <option value="spam">Spam</option>
          </select>
          <Button type="button" onClick={addSuppression} disabled={!form.email}>Add</Button>
        </Card>

        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-xs uppercase text-textMuted">
              <tr>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {suppressions.map((suppression) => (
                <tr key={suppression.public_id} className="border-t border-border">
                  <td className="px-3 py-2 text-textPrimary">{suppression.email}</td>
                  <td className="px-3 py-2 text-textSecondary">{suppression.reason}</td>
                  <td className="px-3 py-2 text-textSecondary">{suppression.source}</td>
                  <td className="px-3 py-2"><span className={cn("rounded-sm border px-2 py-0.5 text-xs capitalize", statusTone(suppression.status))}>{suppression.status}</span></td>
                  <td className="px-3 py-2 text-textMuted">{formatDateTime(suppression.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" size="sm" variant="secondary" onClick={() => resubscribe(suppression.public_id)} disabled={suppression.status !== "active"}>Resubscribe</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
