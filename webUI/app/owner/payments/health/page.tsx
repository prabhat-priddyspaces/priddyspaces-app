"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CreditCard, Download, Mail, Search, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Organization {
  public_id: string;
  name: string;
}

interface Location {
  public_id: string;
  name: string;
  city: string | null;
}

interface PaymentHealthNotice {
  public_id: string;
  status: string;
  subject: string | null;
  error: string | null;
  sent_at: string | null;
  last_event_at: string | null;
  created_at: string | null;
}

interface AffectedSpace {
  space_public_id: string;
  space_name: string | null;
  space_type: string | null;
  location_public_id: string | null;
  location_name: string | null;
  location_city: string | null;
  sources: string[];
  open_request_count: number;
  future_booking_count: number;
  active_subscription_count: number;
}

interface PaymentHealthCard {
  public_id: string;
  organization_public_id: string;
  organization_name: string;
  member_public_id: string | null;
  member_name: string | null;
  member_email: string | null;
  provider: string;
  payment_method_status: string;
  card_status: "expired" | "expiring" | "missing_expiry" | "healthy";
  card_brand: string | null;
  card_last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  expiry_label: string | null;
  is_default_for_owner: boolean;
  affected_spaces: AffectedSpace[];
  open_booking_request_count: number;
  future_booking_count: number;
  active_subscription_count: number;
  upcoming_booking_value_cents: number;
  recent_paid_volume_cents: number;
  last_notice: PaymentHealthNotice | null;
  created_at: string | null;
  updated_at: string | null;
}

interface PaymentHealthSummary {
  total_cards: number;
  expired_count: number;
  expiring_count: number;
  missing_expiry_count: number;
  healthy_count: number;
  affected_member_count: number;
  notices_sent_count: number;
  upcoming_booking_value_cents: number;
  recent_paid_volume_cents: number;
}

interface PaymentHealthResponse {
  generated_at: string;
  summary: PaymentHealthSummary;
  results: PaymentHealthCard[];
}

interface NoticeResponse {
  sent_count: number;
  skipped_count: number;
  failed_count: number;
  results: Array<{
    payment_method_public_id: string;
    member_email: string | null;
    status: string;
    reason: string | null;
    outbound_message_public_id: string | null;
    outbound_status: string | null;
  }>;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const statusOptions = [
  { value: "at_risk", label: "At risk" },
  { value: "expired", label: "Expired" },
  { value: "expiring", label: "Expiring" },
  { value: "missing_expiry", label: "Missing expiry" },
  { value: "healthy", label: "Healthy" },
  { value: "all", label: "All cards" },
];

function moneyFromCents(value: number): string {
  return currency.format((value || 0) / 100);
}

function titleize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusVariant(status: PaymentHealthCard["card_status"]): "success" | "warning" | "danger" | "default" {
  if (status === "expired") return "danger";
  if (status === "expiring" || status === "missing_expiry") return "warning";
  if (status === "healthy") return "success";
  return "default";
}

function cardLabel(card: PaymentHealthCard): string {
  const brand = titleize(card.card_brand || "card");
  const last4 = card.card_last4 ? ` ending ${card.card_last4}` : "";
  return `${brand}${last4}`;
}

function affectedSpaceLabel(space: AffectedSpace): string {
  const location = [space.location_name, space.location_city].filter(Boolean).join(", ");
  return [space.space_name || "Space", location].filter(Boolean).join(" - ");
}

function noticeLabel(card: PaymentHealthCard): string {
  if (!card.last_notice) return "Not sent";
  return `${titleize(card.last_notice.status)} - ${formatDate(card.last_notice.sent_at || card.last_notice.created_at)}`;
}

function resultMessage(result: NoticeResponse): string {
  const parts = [
    result.sent_count ? `${result.sent_count} sent` : "",
    result.skipped_count ? `${result.skipped_count} skipped` : "",
    result.failed_count ? `${result.failed_count} failed` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "No reminders sent";
}

function csvValue(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows: PaymentHealthCard[]): string {
  const header = [
    "Member",
    "Email",
    "Status",
    "Card",
    "Expiry",
    "Spaces",
    "Upcoming value",
    "Recent paid volume",
    "Last notice",
  ];
  const lines = rows.map((row) =>
    [
      row.member_name || "",
      row.member_email || "",
      titleize(row.card_status),
      cardLabel(row),
      row.expiry_label || "Missing",
      row.affected_spaces.map(affectedSpaceLabel).join("; "),
      moneyFromCents(row.upcoming_booking_value_cents),
      moneyFromCents(row.recent_paid_volume_cents),
      noticeLabel(row),
    ]
      .map(csvValue)
      .join(",")
  );
  return [header.map(csvValue).join(","), ...lines].join("\n");
}

export default function OwnerPaymentHealthPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [orgId, setOrgId] = useState("");
  const [status, setStatus] = useState("at_risk");
  const [windowDays, setWindowDays] = useState("30");
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<PaymentHealthResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((items) => {
        setOrgs(items);
        setOrgId((current) => current || items[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, []);

  useEffect(() => {
    if (!orgId) {
      setLocations([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    apiFetch<Location[]>(`/api/locations?organization_public_id=${encodeURIComponent(orgId)}`, { method: "GET" }, token)
      .then((items) => setLocations(items))
      .catch(() => setLocations([]));
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      setHealth(null);
      setLoading(false);
      return;
    }
    const token = getAccessToken() ?? undefined;
    const params = new URLSearchParams();
    params.set("organization_public_id", orgId);
    params.set("status", status);
    params.set("window_days", windowDays);
    if (locationId) params.set("location_public_id", locationId);
    if (search.trim()) params.set("search", search.trim());

    setLoading(true);
    apiFetch<PaymentHealthResponse>(`/api/owner/payment-health/cards?${params.toString()}`, { method: "GET" }, token)
      .then((result) => {
        setHealth(result);
        setSelected((current) => current.filter((publicId) => result.results.some((row) => row.public_id === publicId)));
      })
      .catch((err) => {
        setHealth(null);
        setMessage(err instanceof Error ? err.message : "Failed to load payment health");
      })
      .finally(() => setLoading(false));
  }, [orgId, status, windowDays, locationId, search]);

  const rows = health?.results ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.public_id));

  const summaryCards = useMemo(() => {
    const summary = health?.summary;
    return [
      { label: "Expired", value: String(summary?.expired_count ?? 0) },
      { label: "Expiring", value: String(summary?.expiring_count ?? 0) },
      { label: "Missing expiry", value: String(summary?.missing_expiry_count ?? 0) },
      { label: "Upcoming value", value: moneyFromCents(summary?.upcoming_booking_value_cents ?? 0) },
      { label: "Recent paid volume", value: moneyFromCents(summary?.recent_paid_volume_cents ?? 0) },
    ];
  }, [health]);

  function toggleSelected(publicId: string, checked: boolean) {
    setSelected((current) => {
      if (checked) return Array.from(new Set([...current, publicId]));
      return current.filter((item) => item !== publicId);
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? rows.map((row) => row.public_id) : []);
  }

  async function sendEmails(publicIds: string[], force = false) {
    if (publicIds.length === 0) return;
    const token = getAccessToken() ?? undefined;
    setSending(force && publicIds.length === 1 ? publicIds[0] : "bulk");
    setMessage("");
    try {
      const response = await apiFetch<NoticeResponse>(
        "/api/owner/payment-health/card-notices",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            payment_method_public_ids: publicIds,
            force,
          }),
        },
        token,
      );
      setMessage(resultMessage(response));
      setSelected([]);
      const params = new URLSearchParams();
      params.set("organization_public_id", orgId);
      params.set("status", status);
      params.set("window_days", windowDays);
      if (locationId) params.set("location_public_id", locationId);
      if (search.trim()) params.set("search", search.trim());
      const refreshed = await apiFetch<PaymentHealthResponse>(
        `/api/owner/payment-health/cards?${params.toString()}`,
        { method: "GET" },
        token,
      );
      setHealth(refreshed);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to send reminders");
    } finally {
      setSending(null);
    }
  }

  function exportCsv() {
    if (rows.length === 0) {
      setMessage("No payment health rows to export");
      return;
    }
    if (typeof URL.createObjectURL !== "function") {
      setMessage("CSV export is unavailable in this browser");
      return;
    }
    const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "payment-health.csv";
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Payment health</h2>
            <p className="text-textSecondary">
              Review saved booking cards before they interrupt bookings, memberships, and office payments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={exportCsv}>
              <Download size={15} />
              Export CSV
            </Button>
            <Button
              type="button"
              onClick={() => sendEmails(selected)}
              disabled={selected.length === 0 || sending === "bulk"}
              data-testid="payment-health-send-selected"
            >
              <Mail size={15} />
              {sending === "bulk" ? "Sending..." : `Send selected${selected.length ? ` (${selected.length})` : ""}`}
            </Button>
          </div>
        </div>

        {message ? <div className="text-sm text-textMuted" role="status">{message}</div> : null}

        <div className="grid gap-3 md:grid-cols-5">
          {summaryCards.map((item) => (
            <Card key={item.label} className="p-4">
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-textMuted">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold text-textPrimary">{item.value}</div>
            </Card>
          ))}
        </div>

        <Card className="grid gap-3 p-4">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-textMuted">Organization</span>
              <select
                value={orgId}
                onChange={(event) => {
                  setOrgId(event.target.value);
                  setLocationId("");
                }}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                aria-label="Organization"
              >
                {orgs.map((org) => (
                  <option key={org.public_id} value={org.public_id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-textMuted">Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                aria-label="Card status"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-textMuted">Window</span>
              <select
                value={windowDays}
                onChange={(event) => setWindowDays(event.target.value)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                aria-label="Expiry window"
              >
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-textMuted">Location</span>
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                aria-label="Location"
              >
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location.public_id} value={location.public_id}>
                    {[location.name, location.city].filter(Boolean).join(", ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-textMuted">Search</span>
              <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3">
                <Search size={14} className="text-textMuted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Member, card, space"
                  className="min-w-0 flex-1 bg-transparent text-sm text-textPrimary outline-none"
                  aria-label="Search payment health"
                />
              </div>
            </label>
          </div>
        </Card>

        <Card className="p-0">
          {loading ? (
            <div className="p-4 text-sm text-textMuted">Loading payment health...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-textMuted">No saved member cards match these filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-[0.08em] text-textMuted">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) => toggleAll(event.target.checked)}
                        aria-label="Select all payment health rows"
                      />
                    </th>
                    <th className="px-3 py-3">Member</th>
                    <th className="px-3 py-3">Card</th>
                    <th className="px-3 py-3">Office context</th>
                    <th className="px-3 py-3">Risk</th>
                    <th className="px-3 py-3">Notice</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.public_id} className="border-b border-border align-top last:border-0" data-testid="payment-health-row">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selected.includes(row.public_id)}
                          onChange={(event) => toggleSelected(row.public_id, event.target.checked)}
                          aria-label={`Select ${row.member_email || row.public_id}`}
                        />
                      </td>
                      <td className="min-w-[220px] px-3 py-4">
                        <div className="flex items-start gap-2">
                          <UserRound size={15} className="mt-0.5 text-textMuted" />
                          <div>
                            <div className="font-semibold text-textPrimary">{row.member_name || "Member unavailable"}</div>
                            <div className="text-xs text-textMuted">{row.member_email || "Email unavailable"}</div>
                            <div className="mt-1 text-xs text-textMuted">{row.organization_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="min-w-[180px] px-3 py-4">
                        <div className="flex items-start gap-2">
                          <CreditCard size={15} className="mt-0.5 text-textMuted" />
                          <div>
                            <div className="font-medium text-textPrimary">{cardLabel(row)}</div>
                            <div className="text-xs text-textMuted">
                              {row.expiry_label ? `Expires ${row.expiry_label}` : "Expiry unavailable"}
                            </div>
                            <div className="mt-2">
                              <Badge variant={statusVariant(row.card_status)} dot>
                                {titleize(row.card_status)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="min-w-[260px] px-3 py-4">
                        <div className="grid gap-2">
                          {row.affected_spaces.length === 0 ? (
                            <div className="text-xs text-textMuted">No active booking or membership context</div>
                          ) : (
                            row.affected_spaces.map((space) => (
                              <div key={space.space_public_id} className="rounded-md border border-border bg-surface2 p-2">
                                <div className="flex items-start gap-2">
                                  <Building2 size={14} className="mt-0.5 text-textMuted" />
                                  <div>
                                    <div className="font-medium text-textPrimary">{space.space_name || "Space"}</div>
                                    <div className="text-xs text-textMuted">
                                      {[space.location_name, space.location_city, titleize(space.space_type)].filter(Boolean).join(" - ")}
                                    </div>
                                    <div className="mt-1 text-xs text-textMuted">{space.sources.map(titleize).join(", ")}</div>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="min-w-[180px] px-3 py-4">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={15} className="mt-0.5 text-warning" />
                          <div className="grid gap-1 text-xs text-textMuted">
                            <div>
                              <span className="font-medium text-textPrimary">{moneyFromCents(row.upcoming_booking_value_cents)}</span> upcoming
                            </div>
                            <div>
                              <span className="font-medium text-textPrimary">{moneyFromCents(row.recent_paid_volume_cents)}</span> recent paid
                            </div>
                            <div>
                              {row.open_booking_request_count} requests, {row.future_booking_count} bookings, {row.active_subscription_count} memberships
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="min-w-[150px] px-3 py-4">
                        <div className="text-sm text-textPrimary">{noticeLabel(row)}</div>
                        {row.last_notice?.error ? <div className="mt-1 text-xs text-danger">{row.last_notice.error}</div> : null}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => sendEmails([row.public_id], Boolean(row.last_notice))}
                          disabled={sending === row.public_id || sending === "bulk"}
                        >
                          <Mail size={14} />
                          {sending === row.public_id ? "Sending..." : row.last_notice ? "Resend email" : "Send email"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
