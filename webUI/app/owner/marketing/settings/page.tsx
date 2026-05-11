"use client";

import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { OrganizationOption, SenderSettings } from "@/lib/marketing";
import { formatDateTime, statusTone } from "@/lib/marketing";
import { cn } from "@/lib/utils";

export default function MarketingSettingsPage() {
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [settings, setSettings] = useState<SenderSettings | null>(null);
  const [message, setMessage] = useState("");
  const [senderForm, setSenderForm] = useState({ default_sender_lane: "shared", verified_sender_public_id: "" });
  const [verifiedForm, setVerifiedForm] = useState({ email: "", name: "" });

  useEffect(() => {
    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      const list = await apiFetch<OrganizationOption[]>("/api/orgs", { method: "GET" }, token);
      setOrgs(list);
      if (list[0]) setOrgId(list[0].public_id);
    }
    loadOrgs().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, []);

  async function loadSettings(currentOrgId = orgId) {
    if (!currentOrgId) return;
    const token = getAccessToken() ?? undefined;
    const result = await apiFetch<SenderSettings>(`/api/marketing/settings?organization_public_id=${encodeURIComponent(currentOrgId)}`, { method: "GET" }, token);
    setSettings(result);
    setSenderForm({
      default_sender_lane: result.default_sender_lane,
      verified_sender_public_id: result.verified_sender_public_id || "",
    });
  }

  useEffect(() => {
    loadSettings().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load settings"));
  }, [orgId]);

  async function saveSender() {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch<SenderSettings>(
        "/api/marketing/settings/sender",
        { method: "PUT", body: JSON.stringify({ organization_public_id: orgId, ...senderForm }) },
        token
      );
      setMessage("Sender settings saved");
      await loadSettings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function addVerifiedSender() {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(
        "/api/marketing/settings/verified-senders",
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId, ...verifiedForm }) },
        token
      );
      setVerifiedForm({ email: "", name: "" });
      setMessage("Verified sender requested");
      await loadSettings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    }
  }

  async function refresh(publicId: string) {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(`/api/marketing/settings/verified-senders/${publicId}/refresh`, { method: "POST" }, token);
      setMessage("Sender refreshed");
      await loadSettings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Refresh failed");
    }
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Sender Settings</h2>
            <p className="text-textSecondary">Marketing uses platform shared sender or a SendGrid-verified business sender.</p>
          </div>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="h-10 rounded-sm border border-border bg-surface px-3 text-sm">
            {orgs.map((org) => <option key={org.public_id} value={org.public_id}>{org.name}</option>)}
          </select>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        {settings ? (
          <>
            <Card className="grid gap-4 p-4">
              <div>
                <div className="text-sm font-semibold text-textPrimary">Default sender lane</div>
                <div className="text-sm text-textSecondary">Shared cap: {settings.shared_daily_cap}/day · Verified cap: {settings.verified_sender_daily_cap}/day</div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <select value={senderForm.default_sender_lane} onChange={(e) => setSenderForm({ ...senderForm, default_sender_lane: e.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
                  <option value="shared">Platform shared sender</option>
                  <option value="verified_sender">Verified business sender</option>
                </select>
                <select value={senderForm.verified_sender_public_id} onChange={(e) => setSenderForm({ ...senderForm, verified_sender_public_id: e.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
                  <option value="">No verified sender selected</option>
                  {settings.verified_senders.map((sender) => <option key={sender.public_id} value={sender.public_id}>{sender.email} ({sender.status})</option>)}
                </select>
                <Button type="button" onClick={saveSender}>Save sender</Button>
              </div>
              <div className="text-sm text-textSecondary">Shared from: {settings.shared_from_name || "Priddyspaces"} &lt;{settings.shared_from_email}&gt;</div>
            </Card>

            <Card className="grid gap-4 p-4">
              <div className="text-sm font-semibold text-textPrimary">Add verified sender</div>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <Input value={verifiedForm.email} onChange={(e) => setVerifiedForm({ ...verifiedForm, email: e.target.value })} placeholder="owner@business.com" />
                <Input value={verifiedForm.name} onChange={(e) => setVerifiedForm({ ...verifiedForm, name: e.target.value })} placeholder="Sender name" />
                <Button type="button" onClick={addVerifiedSender} disabled={!verifiedForm.email}>Add</Button>
              </div>
            </Card>

            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-xs uppercase text-textMuted">
                  <tr>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Checked</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {settings.verified_senders.map((sender) => (
                    <tr key={sender.public_id} className="border-t border-border">
                      <td className="px-3 py-2 text-textPrimary">{sender.email}</td>
                      <td className="px-3 py-2 text-textSecondary">{sender.name || "—"}</td>
                      <td className="px-3 py-2"><span className={cn("rounded-sm border px-2 py-0.5 text-xs capitalize", statusTone(sender.status))}>{sender.status}</span></td>
                      <td className="px-3 py-2 text-textMuted">{formatDateTime(sender.last_checked_at)}</td>
                      <td className="px-3 py-2 text-right"><Button type="button" size="sm" variant="secondary" onClick={() => refresh(sender.public_id)}>Refresh</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
