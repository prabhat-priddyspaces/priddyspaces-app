"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";

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

const TABS: { value: TabKey; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "notes", label: "Notes & profile" },
];

interface PageProps {
  params: Promise<{ public_id: string }>;
}

export default function OwnerMemberDetailPage({ params }: PageProps) {
  const { public_id } = use(params);
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

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await apiFetch<MemberDetail>(
        `/api/owner/members/${public_id}`,
        { method: "GET" },
        token
      );
      setMember(detail);
      setDraftStatus((detail.status as MemberStatus) || "active");
      setDraftPhone(detail.phone || "");
      setDraftCompany(detail.company_name || "");
      setDraftTags(detail.tags.join(", "));
      setDraftNotes(detail.notes || "");

      // Pull last 60 days of bookings/requests/subscriptions for this member from the calendar feed.
      const start = addDays(startOfDay(new Date()), -60);
      const end = addDays(start, 35);
      const params = new URLSearchParams();
      params.set("start", start.toISOString());
      params.set("end", end.toISOString());
      const calendar = await apiFetch<CalendarResponse>(
        `/api/owner/calendar?${params.toString()}`,
        { method: "GET" },
        token
      ).catch(() => null);
      if (calendar) {
        setEvents(calendar.events.filter((e) => e.member.public_id === public_id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load member");
    } finally {
      setLoading(false);
    }
  }, [public_id]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (!token) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const tags = draftTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const updated = await apiFetch<MemberDetail>(
        `/api/owner/members/${public_id}`,
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
          <Link href="/owner/members" className="text-sm text-accent hover:underline">
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
            <Link href="/owner/members" className="text-xs text-accent hover:underline">
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
