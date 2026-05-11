"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { Campaign, CampaignReview, MarketingTemplate, OrganizationOption, Segment } from "@/lib/marketing";
import { formatDateTime, statusTone } from "@/lib/marketing";
import { cn } from "@/lib/utils";

export default function MarketingCampaignsPage() {
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<CampaignReview | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ name: "", template_public_id: "", segment_public_id: "", sender_lane: "shared", scheduled_at: "" });

  useEffect(() => {
    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      const list = await apiFetch<OrganizationOption[]>("/api/orgs", { method: "GET" }, token);
      setOrgs(list);
      if (list[0]) setOrgId(list[0].public_id);
    }
    loadOrgs().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, []);

  async function loadAll(currentOrgId = orgId) {
    if (!currentOrgId) return;
    const token = getAccessToken() ?? undefined;
    const qs = `organization_public_id=${encodeURIComponent(currentOrgId)}`;
    const [templateList, segmentList, campaignList] = await Promise.all([
      apiFetch<MarketingTemplate[]>(`/api/marketing/templates?${qs}`, { method: "GET" }, token),
      apiFetch<Segment[]>(`/api/marketing/segments?${qs}`, { method: "GET" }, token),
      apiFetch<Campaign[]>(`/api/marketing/campaigns?${qs}`, { method: "GET" }, token),
    ]);
    setTemplates(templateList);
    setSegments(segmentList);
    setCampaigns(campaignList);
    setForm((current) => ({
      ...current,
      template_public_id: current.template_public_id || templateList[0]?.public_id || "",
      segment_public_id: current.segment_public_id || segmentList[0]?.public_id || "",
    }));
  }

  useEffect(() => {
    loadAll().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load campaigns"));
  }, [orgId]);

  async function createCampaign() {
    const token = getAccessToken() ?? undefined;
    try {
      const campaign = await apiFetch<Campaign>(
        "/api/marketing/campaigns",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            name: form.name,
            template_public_id: form.template_public_id,
            segment_public_id: form.segment_public_id || null,
            sender_lane: form.sender_lane,
            scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
          }),
        },
        token
      );
      setSelectedCampaign(campaign);
      setMessage("Campaign draft created");
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function reviewCampaign(campaign: Campaign) {
    const token = getAccessToken() ?? undefined;
    try {
      setSelectedCampaign(campaign);
      const result = await apiFetch<CampaignReview>(`/api/marketing/campaigns/${campaign.public_id}/review-breakdown`, { method: "GET" }, token);
      setReview(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Review failed");
    }
  }

  async function sendCampaign(campaign: Campaign, scheduled = false) {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch<Campaign>(
        `/api/marketing/campaigns/${campaign.public_id}/send`,
        { method: "POST", body: JSON.stringify({ scheduled_at: scheduled && form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null }) },
        token
      );
      setMessage(scheduled ? "Campaign scheduled" : "Campaign sent");
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Send failed");
    }
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Campaigns</h2>
            <p className="text-textSecondary">Draft, review, snapshot, send, and track member emails.</p>
          </div>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="h-10 rounded-sm border border-border bg-surface px-3 text-sm">
            {orgs.map((org) => <option key={org.public_id} value={org.public_id}>{org.name}</option>)}
          </select>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <Card className="grid gap-4 p-4">
          <div className="text-sm font-semibold text-textPrimary">New campaign</div>
          <div className="grid gap-3 md:grid-cols-5">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Campaign name" />
            <select value={form.template_public_id} onChange={(e) => setForm({ ...form, template_public_id: e.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
              {templates.map((template) => <option key={template.public_id} value={template.public_id}>{template.name}</option>)}
            </select>
            <select value={form.segment_public_id} onChange={(e) => setForm({ ...form, segment_public_id: e.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
              <option value="">All CRM members</option>
              {segments.map((segment) => <option key={segment.public_id} value={segment.public_id}>{segment.name}</option>)}
            </select>
            <select value={form.sender_lane} onChange={(e) => setForm({ ...form, sender_lane: e.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
              <option value="shared">Platform shared</option>
              <option value="verified_sender">Verified business</option>
            </select>
            <Button type="button" onClick={createCampaign} disabled={!form.name || !form.template_public_id}>Create draft</Button>
          </div>
          <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} className="max-w-xs" />
        </Card>

        {selectedCampaign && review ? (
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-textPrimary">Review: {selectedCampaign.name}</div>
                <div className="text-sm text-textSecondary">
                  Total {review.total} · Eligible {review.eligible} · Suppressed {review.suppressed} · No email {review.no_email}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => sendCampaign(selectedCampaign)}>Send now</Button>
                <Button type="button" variant="secondary" onClick={() => sendCampaign(selectedCampaign, true)} disabled={!form.scheduled_at}>Schedule</Button>
              </div>
            </div>
          </Card>
        ) : null}

        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-xs uppercase text-textMuted">
              <tr>
                <th className="px-3 py-2 text-left">Campaign</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Eligible</th>
                <th className="px-3 py-2 text-right">Sent</th>
                <th className="px-3 py-2 text-right">Opened</th>
                <th className="px-3 py-2 text-left">Scheduled</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.public_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link href={`/owner/marketing/campaigns/${campaign.public_id}`} className="font-medium text-textPrimary hover:underline">{campaign.name}</Link>
                    <div className="text-xs text-textMuted">{campaign.sender_lane.replace("_", " ")}</div>
                  </td>
                  <td className="px-3 py-2"><span className={cn("rounded-sm border px-2 py-0.5 text-xs capitalize", statusTone(campaign.status))}>{campaign.status}</span></td>
                  <td className="px-3 py-2 text-right">{campaign.eligible_count}</td>
                  <td className="px-3 py-2 text-right">{campaign.sent_count}</td>
                  <td className="px-3 py-2 text-right">{campaign.opened_count}</td>
                  <td className="px-3 py-2 text-textMuted">{formatDateTime(campaign.scheduled_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" size="sm" variant="secondary" onClick={() => reviewCampaign(campaign)} disabled={!["draft", "scheduled"].includes(campaign.status)}>Review</Button>
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
