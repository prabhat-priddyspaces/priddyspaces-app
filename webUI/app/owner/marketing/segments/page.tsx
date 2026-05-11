"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { OrganizationOption, Segment } from "@/lib/marketing";

export default function MarketingSegmentsPage() {
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ total: number; sample: Array<Record<string, unknown>> } | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "active",
    search: "",
    tags: "",
    tag_mode: "any",
    active_subscription: "any",
    min_booking_count: "",
    min_lifetime_revenue_cents: "",
    last_booking_after: "",
  });

  const filters = useMemo(() => {
    const output: Record<string, unknown> = {};
    if (form.status !== "any") output.status = form.status;
    if (form.search.trim()) output.search = form.search.trim();
    const tags = form.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (tags.length) {
      output.tags = tags;
      output.tag_mode = form.tag_mode;
    }
    if (form.active_subscription !== "any") output.active_subscription = form.active_subscription === "true";
    if (form.min_booking_count) output.min_booking_count = Number(form.min_booking_count);
    if (form.min_lifetime_revenue_cents) output.min_lifetime_revenue_cents = Number(form.min_lifetime_revenue_cents);
    if (form.last_booking_after) output.last_booking_after = form.last_booking_after;
    return output;
  }, [form]);

  useEffect(() => {
    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      const list = await apiFetch<OrganizationOption[]>("/api/orgs", { method: "GET" }, token);
      setOrgs(list);
      if (list[0]) setOrgId(list[0].public_id);
    }
    loadOrgs().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, []);

  async function loadSegments(currentOrgId = orgId) {
    if (!currentOrgId) return;
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<Segment[]>(`/api/marketing/segments?organization_public_id=${encodeURIComponent(currentOrgId)}`, { method: "GET" }, token);
    setSegments(list);
  }

  useEffect(() => {
    loadSegments().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load segments"));
  }, [orgId]);

  async function previewCount() {
    const token = getAccessToken() ?? undefined;
    try {
      const result = await apiFetch<typeof preview>(
        "/api/marketing/segments/preview-count",
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId, filters }) },
        token
      );
      setPreview(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Preview failed");
    }
  }

  async function saveSegment() {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch<Segment>(
        "/api/marketing/segments",
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId, name: form.name, description: form.description, filters }) },
        token
      );
      setMessage("Segment saved");
      await loadSegments();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Segments</h2>
            <p className="text-textSecondary">Saved member filters for owner marketing campaigns and workflows.</p>
          </div>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="h-10 rounded-sm border border-border bg-surface px-3 text-sm">
            {orgs.map((org) => <option key={org.public_id} value={org.public_id}>{org.name}</option>)}
          </select>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <Card className="grid gap-4 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Segment name" />
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" />
            <Input value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="Search name/email/company" />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
              <option value="any">Any status</option>
              <option value="lead">Lead</option>
              <option value="active">Active</option>
              <option value="churned">Churned</option>
              <option value="blocked">Blocked</option>
            </select>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags, comma-separated" />
            <select value={form.tag_mode} onChange={(e) => setForm({ ...form, tag_mode: e.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
              <option value="any">Any tag</option>
              <option value="all">All tags</option>
            </select>
            <select value={form.active_subscription} onChange={(e) => setForm({ ...form, active_subscription: e.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
              <option value="any">Any subscription</option>
              <option value="true">Active subscription</option>
              <option value="false">No active subscription</option>
            </select>
            <Input type="number" value={form.min_booking_count} onChange={(e) => setForm({ ...form, min_booking_count: e.target.value })} placeholder="Min bookings" />
            <Input type="date" value={form.last_booking_after} onChange={(e) => setForm({ ...form, last_booking_after: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={previewCount}>Preview count</Button>
            <Button type="button" variant="secondary" onClick={saveSegment} disabled={!form.name.trim()}>Save segment</Button>
          </div>
          <pre className="overflow-auto rounded-sm bg-surface2 p-3 text-xs text-textSecondary">{JSON.stringify(filters, null, 2)}</pre>
          {preview ? (
            <div className="text-sm text-textPrimary">
              {preview.total} matching members
              <div className="mt-2 grid gap-1 text-xs text-textMuted">
                {preview.sample.map((item, idx) => <div key={idx}>{String(item.name)} · {String(item.email)}</div>)}
              </div>
            </div>
          ) : null}
        </Card>

        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-xs uppercase text-textMuted">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Preview</th>
                <th className="px-3 py-2 text-left">Filters</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((segment) => (
                <tr key={segment.public_id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-textPrimary">{segment.name}</td>
                  <td className="px-3 py-2 text-textSecondary">{segment.preview_count}</td>
                  <td className="px-3 py-2 text-xs text-textMuted">{JSON.stringify(segment.filters)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
