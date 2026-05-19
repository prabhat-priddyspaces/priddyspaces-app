"use client";

import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MarketingTemplate, OrganizationOption } from "@/lib/marketing";

export default function MarketingTemplatesPage() {
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [selected, setSelected] = useState<MarketingTemplate | null>(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html_body: string | null; text_body: string | null; missing_values: string[] } | null>(null);
  const [form, setForm] = useState({
    name: "",
    subject: "",
    category: "general",
    html_body: "<p>Hi {{ member.first_name }},</p><p></p><p><a href=\"{{ links.unsubscribe }}\">Unsubscribe</a></p>",
    text_body: "Hi {{ member.first_name }},\n\nUnsubscribe: {{ links.unsubscribe }}",
  });
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      const list = await apiFetch<OrganizationOption[]>("/api/orgs", { method: "GET" }, token);
      setOrgs(list);
      if (list[0]) setOrgId(list[0].public_id);
    }
    loadOrgs().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, []);

  async function loadTemplates(currentOrgId = orgId) {
    if (!currentOrgId) return;
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<MarketingTemplate[]>(
      `/api/marketing/templates?organization_public_id=${encodeURIComponent(currentOrgId)}`,
      { method: "GET" },
      token
    );
    setTemplates(list);
    setSelected((current) => current && list.find((item) => item.public_id === current.public_id) || list[0] || null);
  }

  useEffect(() => {
    loadTemplates().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load templates"));
  }, [orgId]);

  function edit(template: MarketingTemplate) {
    setSelected(template);
    setPreview(null);
    setForm({
      name: template.name,
      subject: template.subject,
      category: template.category || "general",
      html_body: template.html_body || "",
      text_body: template.text_body || "",
    });
  }

  async function save() {
    if (!orgId) return;
    const token = getAccessToken() ?? undefined;
    setMessage("");
    try {
      if (selected) {
        const updated = await apiFetch<MarketingTemplate>(
          `/api/marketing/templates/${selected.public_id}`,
          { method: "PUT", body: JSON.stringify(form) },
          token
        );
        setSelected(updated);
      } else {
        const created = await apiFetch<MarketingTemplate>(
          "/api/marketing/templates",
          { method: "POST", body: JSON.stringify({ ...form, organization_public_id: orgId }) },
          token
        );
        setSelected(created);
      }
      setMessage("Template saved");
      await loadTemplates();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function previewTemplate() {
    if (!selected) return;
    const token = getAccessToken() ?? undefined;
    try {
      const result = await apiFetch<typeof preview>(
        `/api/marketing/templates/${selected.public_id}/preview`,
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId }) },
        token
      );
      setPreview(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Preview failed");
    }
  }

  async function sendTest() {
    if (!selected) return;
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(
        `/api/marketing/templates/${selected.public_id}/test-send`,
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId, to_email: testEmail || undefined }) },
        token
      );
      setMessage("Test send queued");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Test send failed");
    }
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Templates</h2>
            <p className="text-textSecondary">Subject and email bodies with safe Priddyspaces variables.</p>
          </div>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="h-10 rounded-sm border border-border bg-surface px-3 text-sm">
            {orgs.map((org) => <option key={org.public_id} value={org.public_id}>{org.name}</option>)}
          </select>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="p-3">
            <button type="button" onClick={() => { setSelected(null); setPreview(null); }} className="mb-3 w-full rounded-sm border border-border px-3 py-2 text-left text-sm hover:bg-surface2">
              New template
            </button>
            <div className="grid gap-2">
              {templates.map((template) => (
                <button
                  key={template.public_id}
                  type="button"
                  onClick={() => edit(template)}
                  className={`rounded-sm border px-3 py-2 text-left text-sm ${selected?.public_id === template.public_id ? "border-accent bg-accentSubtle" : "border-border hover:bg-surface2"}`}
                >
                  <div className="font-medium text-textPrimary">{template.name}</div>
                  <div className="truncate text-xs text-textMuted">{template.subject}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="grid gap-4 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Template name" />
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" />
              <Input className="md:col-span-2" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject" />
            </div>
            <label className="grid gap-1 text-xs text-textMuted">
              HTML body
              <textarea value={form.html_body} onChange={(e) => setForm({ ...form, html_body: e.target.value })} rows={10} className="rounded-sm border border-border bg-white p-3 text-sm text-textPrimary" />
            </label>
            <label className="grid gap-1 text-xs text-textMuted">
              Text body
              <textarea value={form.text_body} onChange={(e) => setForm({ ...form, text_body: e.target.value })} rows={6} className="rounded-sm border border-border bg-white p-3 text-sm text-textPrimary" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={save}>{selected ? "Save template" : "Create template"}</Button>
              <Button type="button" variant="secondary" onClick={previewTemplate} disabled={!selected}>Preview</Button>
              <Input className="max-w-xs" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="test@example.com" />
              <Button type="button" variant="secondary" onClick={sendTest} disabled={!selected}>Test send</Button>
            </div>
            {selected?.variables.length ? (
              <div className="text-xs text-textMuted">Variables: {selected.variables.join(", ")}</div>
            ) : null}
            {preview ? (
              <div className="rounded-sm border border-border bg-surface2 p-3 text-sm">
                <div className="font-semibold text-textPrimary">{preview.subject}</div>
                {preview.missing_values.length ? <div className="text-error">{preview.missing_values.join(", ")}</div> : null}
                <iframe
                  title="Template preview"
                  sandbox=""
                  className="mt-3 h-72 w-full rounded-sm border border-border bg-white"
                  srcDoc={preview.html_body || `<pre>${preview.text_body || ""}</pre>`}
                />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
