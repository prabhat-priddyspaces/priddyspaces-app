"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  CalendarEvent,
  CalendarResponse,
  addDays,
  formatCurrency,
  formatDateTime,
  startOfDay,
  statusColorClass,
} from "@/lib/calendar";
import {
  MEMBER_STATUSES,
  MemberDetail,
  MemberStatus,
  memberStatusBadgeClass,
} from "@/lib/members";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "upcoming" | "past" | "notes";

interface Organization {
  public_id: string;
  name: string;
}

const TABS: { value: TabKey; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "notes", label: "Notes & profile" },
];

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function memberActivityWindow(detail: MemberDetail): { start: Date; end: Date } {
  const today = startOfDay(new Date());
  const fallbackStart = addDays(today, -90);
  const fallbackEnd = addDays(today, 180);
  const firstBooking = parseOptionalDate(detail.stats.first_booking_at);
  const lastBooking = parseOptionalDate(detail.stats.last_booking_at);
  const start = firstBooking
    ? new Date(Math.min(addDays(startOfDay(firstBooking), -1).getTime(), fallbackStart.getTime()))
    : fallbackStart;
  const end = lastBooking
    ? new Date(Math.max(addDays(startOfDay(lastBooking), 2).getTime(), fallbackEnd.getTime()))
    : fallbackEnd;
  return { start, end };
}

export function OwnerMemberDetailClient() {
  const params = useParams<{ public_id: string }>();
  const searchParams = useSearchParams();
  const public_id = params?.public_id ?? "";
  const requestedOrgId = searchParams.get("organization_public_id") ?? "";
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgId, setOrgId] = useState("");
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  // Profile form state
  const [draftStatus, setDraftStatus] = useState<MemberStatus>("active");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftCompany, setDraftCompany] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  const membersHref = useMemo(() => {
    if (!orgId) return "/owner/members";
    const params = new URLSearchParams({ organization_public_id: orgId });
    return `/owner/members?${params.toString()}`;
  }, [orgId]);

  useEffect(() => {
    let active = true;
    const token = getAccessToken() ?? undefined;
    if (!token) {
      setOrgsLoading(false);
      setLoading(false);
      setError("Sign in required");
      return;
    }

    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        if (!active) return;
        setOrgs(list);
        const requested = list.find((org) => org.public_id === requestedOrgId);
        setOrgId((current) => requested?.public_id || current || list[0]?.public_id || "");
        setOrgsLoading(false);
        if (list.length === 0) setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        if (requestedOrgId) {
          setOrgId(requestedOrgId);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load organizations");
          setLoading(false);
        }
        setOrgsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [requestedOrgId]);

  const load = useCallback(async () => {
    if (orgsLoading) return;
    const token = getAccessToken() ?? undefined;
    if (!token) {
      setLoading(false);
      setError("Sign in required");
      return;
    }
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const memberParams = new URLSearchParams({ organization_public_id: orgId });
      const detail = await apiFetch<MemberDetail>(
        `/api/owner/members/${encodeURIComponent(public_id)}?${memberParams.toString()}`,
        { method: "GET" },
        token
      );
      setMember(detail);
      setEvents([]);
      setDraftStatus((detail.status as MemberStatus) || "active");
      setDraftPhone(detail.phone || "");
      setDraftCompany(detail.company_name || "");
      setDraftTags(detail.tags.join(", "));
      setDraftNotes(detail.notes || "");

      const { start, end } = memberActivityWindow(detail);
      const params = new URLSearchParams();
      params.set("start", start.toISOString());
      params.set("end", end.toISOString());
      params.set("member_public_id", public_id);
      params.set("organization_public_id", orgId);
      params.set("include", "bookings,requests,subscriptions");
      const calendar = await apiFetch<CalendarResponse>(
        `/api/owner/calendar?${params.toString()}`,
        { method: "GET" },
        token
      ).catch(() => null);
      if (calendar) {
        setEvents(calendar.events.filter((e) => e.member.public_id === public_id));
      }
    } catch (err) {
      setMember(null);
      setEvents([]);
      setError(err instanceof Error ? err.message : "Failed to load member");
    } finally {
      setLoading(false);
    }
  }, [orgId, orgsLoading, public_id]);

  useEffect(() => {
    if (!orgsLoading) load();
  }, [load, orgsLoading]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const upcoming: CalendarEvent[] = [];
    const past: CalendarEvent[] = [];
    for (const e of events) {
      if (new Date(e.end).getTime() >= now) upcoming.push(e);
      else past.push(e);
    }
    upcoming.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    past.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
    return { upcoming, past };
  }, [events]);

  async function save() {
    const token = getAccessToken() ?? undefined;
    if (!token || !orgId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const memberParams = new URLSearchParams({ organization_public_id: orgId });
      const tags = draftTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const updated = await apiFetch<MemberDetail>(
        `/api/owner/members/${encodeURIComponent(public_id)}?${memberParams.toString()}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: draftStatus,
            phone: draftPhone,
            company_name: draftCompany,
            tags,
            notes: draftNotes,
          }),
        },
        token
      );
      setMember(updated);
      setMessage("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !member) {
    return (
      <AppShell>
        <div className="text-sm text-textMuted">Loading member…</div>
      </AppShell>
    );
  }

  if (!member) {
    return (
      <AppShell>
        <div className="text-sm text-error">{error || "Member not found"}</div>
        <div className="mt-4">
          <Link href={membersHref} className="text-sm text-accent hover:underline">
            ← Back to members
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={membersHref} className="text-xs text-accent hover:underline">
              ← Members
            </Link>
            <h2 className="mt-1 text-2xl font-semibold text-textPrimary">{member.name}</h2>
            <div className="text-sm text-textMuted">{member.email}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex rounded-sm border px-2 py-0.5 text-xs capitalize",
                  memberStatusBadgeClass(member.status)
                )}
              >
                {member.status}
              </span>
              {member.phone ? (
                <span className="text-xs text-textMuted">{member.phone}</span>
              ) : null}
              {member.company_name ? (
                <span className="text-xs text-textMuted">· {member.company_name}</span>
              ) : null}
            </div>
          </div>
          {orgs.length > 1 ? (
            <label className="grid min-w-[220px] gap-1 text-xs text-textMuted">
              Organization
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
              >
                {orgs.map((org) => (
                  <option key={org.public_id} value={org.public_id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <a
            href={`mailto:${member.email}`}
            className="inline-flex h-9 items-center rounded-sm border border-border bg-white px-3 text-xs text-textSecondary hover:bg-surface2"
          >
            Email member
          </a>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total bookings" value={String(member.stats.total_bookings)} />
          <Stat label="Confirmed" value={String(member.stats.confirmed_bookings)} />
          <Stat label="Open requests" value={String(member.stats.open_requests)} />
          <Stat label="Active subs" value={String(member.stats.active_subscriptions)} />
          <Stat label="No-shows" value={String(member.stats.no_shows)} />
          <Stat label="Lifetime revenue" value={formatCurrency(member.stats.total_revenue_cents)} />
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-xs",
                tab === t.value
                  ? "bg-accentSubtle text-accent"
                  : "text-textSecondary hover:bg-surface2"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <Card className="p-4 text-sm">
            <div className="grid gap-2 text-textPrimary">
              <div>
                <span className="text-textMuted">First booking: </span>
                {member.stats.first_booking_at
                  ? new Date(member.stats.first_booking_at).toLocaleDateString()
                  : "—"}
              </div>
              <div>
                <span className="text-textMuted">Last booking: </span>
                {member.stats.last_booking_at
                  ? new Date(member.stats.last_booking_at).toLocaleDateString()
                  : "—"}
              </div>
              <div>
                <span className="text-textMuted">CRM record: </span>
                {member.materialized ? "stored" : "not yet stored (lazy)"}
              </div>
            </div>
          </Card>
        ) : null}

        {tab === "upcoming" ? <EventTable events={upcoming} emptyText="No upcoming bookings." /> : null}
        {tab === "past" ? <EventTable events={past} emptyText="No past bookings." /> : null}

        {tab === "notes" ? (
          <Card className="p-4">
            <div className="grid gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-textMuted">
                  Status
                  <select
                    value={draftStatus}
                    onChange={(e) => setDraftStatus(e.target.value as MemberStatus)}
                    className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
                  >
                    {MEMBER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-textMuted">
                  Phone
                  <input
                    value={draftPhone}
                    onChange={(e) => setDraftPhone(e.target.value)}
                    className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
                  />
                </label>
                <label className="grid gap-1 text-xs text-textMuted sm:col-span-2">
                  Company name
                  <input
                    value={draftCompany}
                    onChange={(e) => setDraftCompany(e.target.value)}
                    className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
                  />
                </label>
                <label className="grid gap-1 text-xs text-textMuted sm:col-span-2">
                  Tags (comma-separated)
                  <input
                    value={draftTags}
                    onChange={(e) => setDraftTags(e.target.value)}
                    placeholder="vip, design, partner"
                    className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
                  />
                </label>
                <label className="grid gap-1 text-xs text-textMuted sm:col-span-2">
                  Notes
                  <textarea
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    rows={5}
                    className="rounded-sm border border-border bg-white px-2 py-1 text-sm text-textPrimary"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                {message ? <span className="text-sm text-success">{message}</span> : null}
              </div>
            </div>
          </Card>
        ) : null}

        {error ? <div className="text-sm text-error">{error}</div> : null}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-textMuted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-textPrimary">{value}</div>
    </Card>
  );
}

function EventTable({ events, emptyText }: { events: CalendarEvent[]; emptyText: string }) {
  if (events.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-textMuted">{emptyText}</Card>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface2 text-xs uppercase tracking-wide text-textMuted">
          <tr>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2 text-left">Space</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={`${event.kind}-${event.public_id}`} className="border-t border-border">
              <td className="px-3 py-2 align-top text-textPrimary">
                <div>{formatDateTime(event.start, null)}</div>
                <div className="text-xs text-textMuted">to {formatDateTime(event.end, null)}</div>
              </td>
              <td className="px-3 py-2 align-top text-textPrimary">
                <div>{event.space_name || "—"}</div>
                <div className="text-xs text-textMuted">{event.location_name}</div>
              </td>
              <td className="px-3 py-2 align-top">
                <span
                  className={cn(
                    "inline-flex rounded-sm border px-2 py-0.5 text-xs",
                    statusColorClass(event.status)
                  )}
                >
                  {event.status}
                </span>
              </td>
              <td className="px-3 py-2 align-top text-right text-textPrimary">
                {formatCurrency(event.amount_cents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
