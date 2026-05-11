"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { Campaign, MarketingTemplate, OrganizationOption, Segment, SenderSettings, Suppression, Workflow } from "@/lib/marketing";

const cards = [
  { href: "/owner/marketing/templates", label: "Templates", description: "Create reusable email subjects and bodies." },
  { href: "/owner/marketing/segments", label: "Segments", description: "Save member filters and preview audiences." },
  { href: "/owner/marketing/campaigns", label: "Campaigns", description: "Draft, review, schedule, and send emails." },
  { href: "/owner/marketing/workflows", label: "Workflows", description: "Automate waits, conditions, sends, tags, and stops." },
  { href: "/owner/marketing/suppressions", label: "Suppressions", description: "Manage unsubscribe, bounce, and manual blocks." },
  { href: "/owner/marketing/settings", label: "Sender Settings", description: "Choose platform or verified business sender." },
];

export default function OwnerMarketingHome() {
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [stats, setStats] = useState({
    templates: 0,
    segments: 0,
    campaigns: 0,
    workflows: 0,
    suppressions: 0,
    sender: "shared",
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      const list = await apiFetch<OrganizationOption[]>("/api/orgs", { method: "GET" }, token);
      setOrgs(list);
      if (list[0]) setOrgId(list[0].public_id);
    }
    loadOrgs().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, []);

  useEffect(() => {
    async function loadStats() {
      if (!orgId) return;
      const token = getAccessToken() ?? undefined;
      const qs = `organization_public_id=${encodeURIComponent(orgId)}`;
      const [templates, segments, campaigns, workflows, suppressions, settings] = await Promise.all([
        apiFetch<MarketingTemplate[]>(`/api/marketing/templates?${qs}`, { method: "GET" }, token),
        apiFetch<Segment[]>(`/api/marketing/segments?${qs}`, { method: "GET" }, token),
        apiFetch<Campaign[]>(`/api/marketing/campaigns?${qs}`, { method: "GET" }, token),
        apiFetch<Workflow[]>(`/api/marketing/workflows?${qs}`, { method: "GET" }, token),
        apiFetch<Suppression[]>(`/api/marketing/suppressions?${qs}`, { method: "GET" }, token),
        apiFetch<SenderSettings>(`/api/marketing/settings?${qs}`, { method: "GET" }, token),
      ]);
      setStats({
        templates: templates.length,
        segments: segments.length,
        campaigns: campaigns.length,
        workflows: workflows.length,
        suppressions: suppressions.filter((s) => s.status === "active").length,
        sender: settings.default_sender_lane,
      });
    }
    loadStats().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load marketing"));
  }, [orgId]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Marketing</h2>
            <p className="text-textSecondary">Email campaigns and automations for your own members.</p>
          </div>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="h-10 rounded-sm border border-border bg-surface px-3 text-sm text-textPrimary"
          >
            {orgs.map((org) => (
              <option key={org.public_id} value={org.public_id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {message ? <div className="text-sm text-error">{message}</div> : null}

        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Templates" value={stats.templates} />
          <Metric label="Campaigns" value={stats.campaigns} />
          <Metric label="Active Suppressions" value={stats.suppressions} />
          <Metric label="Segments" value={stats.segments} />
          <Metric label="Workflows" value={stats.workflows} />
          <Metric label="Sender Lane" value={stats.sender.replace("_", " ")} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card className="h-full p-4 hover:bg-surface2">
                <div className="text-sm font-semibold text-textPrimary">{card.label}</div>
                <div className="mt-1 text-sm text-textSecondary">{card.description}</div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-textMuted">{label}</div>
      <div className="mt-1 text-xl font-semibold capitalize text-textPrimary">{value}</div>
    </Card>
  );
}
