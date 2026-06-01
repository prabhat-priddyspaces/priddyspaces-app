"use client";

import { useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MarketingTemplate, OrganizationOption } from "@/lib/marketing";

const shortcodeGroups = [
  {
    label: "Member",
    items: [
      ["{{ member.first_name }}", "First name"],
      ["{{ member.last_name }}", "Last name"],
      ["{{ member.full_name }}", "Full name"],
      ["{{ member.email }}", "Email"],
      ["{{ member.phone }}", "Phone"],
      ["{{ member.company }}", "Company"],
    ],
  },
  {
    label: "Business",
    items: [
      ["{{ business.name }}", "Organization"],
      ["{{ business.address }}", "Address"],
      ["{{ business.city }}", "City"],
      ["{{ business.state }}", "State"],
      ["{{ business.postal_code }}", "Postal code"],
      ["{{ business.support_email }}", "Support email"],
      ["{{ business.phone }}", "Phone"],
      ["{{ business.website }}", "Website"],
    ],
  },
  {
    label: "Owner",
    items: [
      ["{{ owner.full_name }}", "Owner"],
      ["{{ owner.email }}", "Owner email"],
      ["{{ owner.phone }}", "Owner phone"],
    ],
  },
  {
    label: "Location",
    items: [
      ["{{ location.name }}", "Location"],
      ["{{ location.address }}", "Address"],
      ["{{ location.city }}", "City"],
      ["{{ location.state }}", "State"],
      ["{{ location.postal_code }}", "Postal code"],
      ["{{ location.phone }}", "Phone"],
      ["{{ location.email }}", "Email"],
    ],
  },
  {
    label: "Reservation",
    items: [
      ["{{ booking.space_name }}", "Space"],
      ["{{ booking.location_name }}", "Location"],
      ["{{ booking.start_date }}", "Start date"],
      ["{{ booking.start_time }}", "Start time"],
      ["{{ booking.end_date }}", "End date"],
      ["{{ booking.end_time }}", "End time"],
      ["{{ booking.number }}", "Booking ID"],
      ["{{ booking.request_number }}", "Request ID"],
    ],
  },
  {
    label: "Invoice",
    items: [
      ["{{ invoice.number }}", "Invoice ID"],
      ["{{ invoice.amount }}", "Invoice amount"],
      ["{{ invoice.balance_due }}", "Balance due"],
      ["{{ invoice.status }}", "Invoice status"],
      ["{{ invoice.due_date }}", "Due date"],
    ],
  },
  {
    label: "Payment",
    items: [
      ["{{ payment.amount }}", "Payment amount"],
      ["{{ payment.status }}", "Payment status"],
      ["{{ payment.failure_reason }}", "Decline reason"],
      ["{{ payment.provider }}", "Provider"],
    ],
  },
  {
    label: "Card",
    items: [
      ["{{ card.brand }}", "Card brand"],
      ["{{ card.last4 }}", "Card last4"],
      ["{{ card.expiry }}", "Card expiry"],
    ],
  },
  {
    label: "Links",
    items: [
      ["{{ links.booking }}", "Booking link"],
      ["{{ links.invoice }}", "Invoice link"],
      ["{{ links.retry_payment }}", "Retry payment"],
      ["{{ links.update_payment_method }}", "Update card"],
      ["{{ links.access_pass }}", "Access pass"],
    ],
  },
] as const;

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
  const [activeBody, setActiveBody] = useState<"html_body" | "text_body">("html_body");
  const htmlRef = useRef<HTMLTextAreaElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

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

  function insertShortcode(shortcode: string) {
    const field = activeBody;
    const ref = field === "html_body" ? htmlRef.current : textRef.current;
    const current = form[field] || "";
    const start = ref?.selectionStart ?? current.length;
    const end = ref?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${shortcode}${current.slice(end)}`;
    setForm({ ...form, [field]: next });
    requestAnimationFrame(() => {
      const target = field === "html_body" ? htmlRef.current : textRef.current;
      target?.focus();
      target?.setSelectionRange(start + shortcode.length, start + shortcode.length);
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
      <div className="grid gap-5 text-[14px] leading-[1.5] text-textPrimary">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[24px] font-semibold leading-tight text-textPrimary">Templates</h2>
            <p className="mt-0.5 text-sm text-textSecondary">Subject and email bodies with safe Priddyspaces variables.</p>
          </div>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-border bg-surface px-3 text-sm text-textPrimary outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgba(79,70,229,.20)] md:w-auto"
            aria-label="Organization"
          >
            {orgs.map((org) => <option key={org.public_id} value={org.public_id}>{org.name}</option>)}
          </select>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <div
          data-testid="marketing-templates-layout"
          className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]"
        >
          <Card
            data-testid="marketing-template-list-panel"
            className="min-w-0 rounded-[8px] border-border p-3 shadow-none"
          >
            <button
              type="button"
              onClick={() => { setSelected(null); setPreview(null); }}
              className="mb-3 w-full rounded-[6px] border border-border bg-surface px-3 py-2 text-left text-sm text-textPrimary transition hover:bg-surface2"
            >
              New template
            </button>
            <div className="grid min-w-0 gap-2">
              {templates.map((template) => (
                <button
                  key={template.public_id}
                  type="button"
                  onClick={() => edit(template)}
                  className={`min-w-0 rounded-[6px] border bg-surface px-3 py-2 text-left text-sm transition ${selected?.public_id === template.public_id ? "border-accent bg-accentSubtle" : "border-border hover:bg-surface2"}`}
                >
                  <div className="truncate font-medium text-textPrimary">{template.name}</div>
                  <div className="truncate text-xs text-textMuted">{template.subject}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card
            data-testid="marketing-template-editor-panel"
            className="grid min-w-0 content-start gap-4 rounded-[8px] border-border p-4 shadow-none"
          >
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Template name"
                aria-label="Template name"
                className="h-10 rounded-[6px] border-border bg-white text-sm text-textPrimary placeholder:text-textMuted focus:border-accent focus-visible:shadow-[0_0_0_3px_rgba(79,70,229,.20)]"
              />
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Category"
                aria-label="Category"
                className="h-10 rounded-[6px] border-border bg-white text-sm text-textPrimary placeholder:text-textMuted focus:border-accent focus-visible:shadow-[0_0_0_3px_rgba(79,70,229,.20)]"
              />
              <Input
                className="h-10 rounded-[6px] border-border bg-white text-sm text-textPrimary placeholder:text-textMuted focus:border-accent focus-visible:shadow-[0_0_0_3px_rgba(79,70,229,.20)] md:col-span-2"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Subject"
                aria-label="Subject"
              />
            </div>
            <label className="grid gap-1.5 text-xs text-textMuted">
              HTML body
              <textarea
                ref={htmlRef}
                value={form.html_body}
                onFocus={() => setActiveBody("html_body")}
                onChange={(e) => setForm({ ...form, html_body: e.target.value })}
                spellCheck={false}
                className="min-h-[168px] resize-y rounded-[6px] border border-border bg-white p-3 text-[13px] leading-[1.55] text-textPrimary outline-none transition placeholder:text-textMuted focus:border-accent focus:shadow-[0_0_0_3px_rgba(79,70,229,.20)]"
              />
            </label>
            <label className="grid gap-1.5 text-xs text-textMuted">
              Text body
              <textarea
                ref={textRef}
                value={form.text_body}
                onFocus={() => setActiveBody("text_body")}
                onChange={(e) => setForm({ ...form, text_body: e.target.value })}
                spellCheck={false}
                className="min-h-[132px] resize-y rounded-[6px] border border-border bg-white p-3 font-mono text-[13px] leading-[1.55] text-textPrimary outline-none transition placeholder:text-textMuted focus:border-accent focus:shadow-[0_0_0_3px_rgba(79,70,229,.20)]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={save}
                className="h-10 rounded-[6px] px-4 text-sm"
              >
                {selected ? "Save template" : "Create template"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={previewTemplate}
                disabled={!selected}
                className="h-10 rounded-[6px] border-border px-4 text-sm"
              >
                Preview
              </Button>
              <Input
                className="h-10 w-full max-w-[220px] rounded-[6px] border-border bg-white text-sm text-textPrimary placeholder:text-textMuted focus:border-accent focus-visible:shadow-[0_0_0_3px_rgba(79,70,229,.20)]"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
                aria-label="Test email"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={sendTest}
                disabled={!selected}
                className="h-10 rounded-[6px] border-border px-4 text-sm"
              >
                Test send
              </Button>
            </div>
            {selected?.variables.length ? (
              <div className="text-xs text-textMuted">Variables: {selected.variables.join(", ")}</div>
            ) : null}
            {preview ? (
              <div className="rounded-[6px] border border-border bg-surface2 p-3 text-sm">
                <div className="font-semibold text-textPrimary">{preview.subject}</div>
                {preview.missing_values.length ? <div className="text-error">{preview.missing_values.join(", ")}</div> : null}
                <iframe
                  title="Template preview"
                  sandbox=""
                  className="mt-3 h-72 w-full rounded-[6px] border border-border bg-white"
                  srcDoc={preview.html_body || `<pre>${preview.text_body || ""}</pre>`}
                />
              </div>
            ) : null}
          </Card>

          <Card
            data-testid="marketing-template-shortcodes-panel"
            className="h-fit min-w-0 rounded-[8px] border-border p-4 shadow-none"
          >
            <div className="mb-3">
              <div className="text-sm font-semibold text-textPrimary">Short codes</div>
            </div>
            <div className="grid gap-4">
              {shortcodeGroups.map((group) => (
                <div key={group.label} className="grid gap-2">
                  <div className="text-[11px] font-semibold uppercase text-textMuted">{group.label}</div>
                  <div className="grid gap-1">
                    {group.items.map(([shortcode, label]) => (
                      <button
                        key={shortcode}
                        type="button"
                        onClick={() => insertShortcode(shortcode)}
                        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[6px] border border-border bg-surface px-2 py-1.5 text-left transition hover:border-[#D6DAE0] hover:bg-surface2"
                      >
                        <span className="break-all font-mono text-xs text-textPrimary">{shortcode}</span>
                        <span className="whitespace-nowrap text-xs text-textMuted">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
