"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  BarByCategory,
  CohortGrid,
  DateRange,
  Heatmap,
  HorizontalBar,
  KPICard,
  LineTimeSeries,
  formatCents,
  formatNumber,
} from "@/components/charts";
import { Card } from "@/components/ui/card";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type Tab = "overview" | "occupancy" | "revenue" | "members" | "heatmap";

interface Overview {
  range: { start: string; end: string };
  kpis: {
    revenue: { current: number; previous: number; delta_pct: number | null };
    bookings: { current: number; previous: number; delta_pct: number | null };
    cancellations: { current: number; previous: number };
    avg_booking_value: number;
    active_memberships: number;
    occupancy_pct: number;
    retention_pct: number;
    no_show_rate_pct: number;
    total_spaces: number;
    total_locations: number;
  };
}

interface RevenueResp {
  granularity: string;
  groups: string[];
  rows: Array<Record<string, string | number>>;
}

interface OccupancyResp {
  granularity: string;
  rows: Array<{ bucket: string; booked_hours: number; capacity_hours: number; occupancy_pct: number }>;
}

interface PeakResp {
  matrix: number[][];
}

interface RevenuePerSpaceResp {
  rows: Array<{
    space_public_id: string;
    space_name: string;
    space_type: string;
    location_name: string;
    bookings: number;
    hours_booked: number;
    gross: number;
    owner_net: number;
    avg_revenue_per_hour: number;
  }>;
}

interface RetentionResp {
  cohorts: Array<{
    cohort: string;
    size: number;
    retention: Array<{ offset: number; month: string; retained: number; pct: number }>;
  }>;
}

interface TopMembersResp {
  rows: Array<{
    user_public_id: string | null;
    email: string | null;
    name: string | null;
    bookings: number;
    spend: number;
    last_booking: string | null;
  }>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function OwnerAnalyticsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [startDate, setStartDate] = useState(daysAgoIso(29));
  const [endDate, setEndDate] = useState(todayIso());
  const [error, setError] = useState("");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [revenue, setRevenue] = useState<RevenueResp | null>(null);
  const [revenuePerSpace, setRevenuePerSpace] = useState<RevenuePerSpaceResp | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyResp | null>(null);
  const [peak, setPeak] = useState<PeakResp | null>(null);
  const [retention, setRetention] = useState<RetentionResp | null>(null);
  const [topMembers, setTopMembers] = useState<TopMembersResp | null>(null);

  const range = useMemo(
    () => `start_date=${startDate}&end_date=${endDate}`,
    [startDate, endDate]
  );

  const loadAll = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    setError("");
    try {
      const [ov, rev, rps, occ, pk, ret, tc] = await Promise.all([
        apiFetch<Overview>(`/api/analytics/owner/overview?${range}`, { method: "GET" }, token),
        apiFetch<RevenueResp>(
          `/api/analytics/owner/revenue?${range}&granularity=day&group_by=space_type`,
          { method: "GET" },
          token
        ),
        apiFetch<RevenuePerSpaceResp>(
          `/api/analytics/owner/revenue-per-space?${range}`,
          { method: "GET" },
          token
        ),
        apiFetch<OccupancyResp>(
          `/api/analytics/owner/occupancy?${range}&granularity=day`,
          { method: "GET" },
          token
        ),
        apiFetch<PeakResp>(`/api/analytics/owner/peak-hours?${range}`, { method: "GET" }, token),
        apiFetch<RetentionResp>(`/api/analytics/owner/retention?months=6`, { method: "GET" }, token),
        apiFetch<TopMembersResp>(
          `/api/analytics/owner/top-members?${range}&limit=20`,
          { method: "GET" },
          token
        ),
      ]);
      setOverview(ov);
      setRevenue(rev);
      setRevenuePerSpace(rps);
      setOccupancy(occ);
      setPeak(pk);
      setRetention(ret);
      setTopMembers(tc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    }
  }, [range]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function downloadExport(path: string, filename: string) {
    const token = getAccessToken() ?? "";
    fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Analytics</h2>
            <p className="text-textSecondary">Occupancy, revenue, retention, and peak hours across your portfolio.</p>
          </div>
          <DateRange startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border">
          {(["overview", "occupancy", "revenue", "members", "heatmap"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${
                tab === t
                  ? "border-accent text-accent"
                  : "border-transparent text-textSecondary hover:text-textPrimary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error ? <div className="text-sm text-error">{error}</div> : null}

        {tab === "overview" && overview ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPICard
                label="Revenue (owner net)"
                value={formatCents(overview.kpis.revenue.current)}
                deltaPct={overview.kpis.revenue.delta_pct}
                hint="vs. prior period"
              />
              <KPICard
                label="Bookings"
                value={formatNumber(overview.kpis.bookings.current)}
                deltaPct={overview.kpis.bookings.delta_pct}
                hint="vs. prior period"
              />
              <KPICard label="Avg booking value" value={formatCents(overview.kpis.avg_booking_value)} />
              <KPICard label="Active memberships" value={formatNumber(overview.kpis.active_memberships)} />
              <KPICard label="Occupancy" value={`${overview.kpis.occupancy_pct}%`} hint="period avg" />
              <KPICard label="Retention" value={`${overview.kpis.retention_pct}%`} hint="returning vs prior window" />
              <KPICard label="No-show rate" value={`${overview.kpis.no_show_rate_pct}%`} hint="confirmed with no check-in" />
              <KPICard
                label="Cancellations"
                value={formatNumber(overview.kpis.cancellations.current)}
                hint={`${overview.kpis.total_locations} locations · ${overview.kpis.total_spaces} spaces`}
              />
            </div>
            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Daily revenue</div>
              <LineTimeSeries
                data={(revenue?.rows ?? []) as Array<Record<string, string | number> & { bucket: string }>}
                keys={revenue?.groups ?? ["revenue"]}
                valueFormatter={formatCents}
              />
            </Card>
          </div>
        ) : null}

        {tab === "occupancy" && occupancy ? (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-textPrimary">Daily occupancy %</div>
              </div>
              <LineTimeSeries
                data={occupancy.rows.map((r) => ({ bucket: r.bucket, occupancy_pct: r.occupancy_pct }))}
                keys={["occupancy_pct"]}
                valueFormatter={(v) => `${v}%`}
              />
            </Card>
            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Booked hours per day</div>
              <BarByCategory
                data={occupancy.rows.map((r) => ({ bucket: r.bucket, booked_hours: r.booked_hours }))}
                keys={["booked_hours"]}
              />
            </Card>
          </div>
        ) : null}

        {tab === "revenue" && revenue && revenuePerSpace ? (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-textPrimary">Revenue by space type</div>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      downloadExport(
                        `/api/analytics/owner/revenue?${range}&granularity=day&group_by=space_type&format=csv`,
                        "revenue.csv"
                      )
                    }
                    className="rounded-sm border border-border px-2 py-1 text-textSecondary hover:bg-surface2"
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadExport(
                        `/api/analytics/owner/revenue?${range}&granularity=day&group_by=space_type&format=pdf`,
                        "revenue.pdf"
                      )
                    }
                    className="rounded-sm border border-border px-2 py-1 text-textSecondary hover:bg-surface2"
                  >
                    PDF
                  </button>
                </div>
              </div>
              <BarByCategory data={revenue.rows as any} keys={revenue.groups} stacked valueFormatter={formatCents} />
            </Card>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-textPrimary">Revenue per space</div>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      downloadExport(`/api/analytics/owner/revenue-per-space?${range}&format=csv`, "revenue-per-space.csv")
                    }
                    className="rounded-sm border border-border px-2 py-1 text-textSecondary hover:bg-surface2"
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadExport(`/api/analytics/owner/revenue-per-space?${range}&format=pdf`, "revenue-per-space.pdf")
                    }
                    className="rounded-sm border border-border px-2 py-1 text-textSecondary hover:bg-surface2"
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadExport(
                        `/api/analytics/owner/monthly-statement.pdf?${range}`,
                        "owner-monthly-statement.pdf"
                      )
                    }
                    className="rounded-sm border border-border px-2 py-1 text-textSecondary hover:bg-surface2"
                  >
                    Statement PDF
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-textMuted">
                    <tr>
                      <th className="p-2">Space</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Location</th>
                      <th className="p-2 text-right">Bookings</th>
                      <th className="p-2 text-right">Hours</th>
                      <th className="p-2 text-right">Gross</th>
                      <th className="p-2 text-right">Owner net</th>
                      <th className="p-2 text-right">$ / hr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenuePerSpace.rows.map((r) => (
                      <tr key={r.space_public_id} className="border-t border-border">
                        <td className="p-2 text-textPrimary">{r.space_name}</td>
                        <td className="p-2 text-textSecondary">{r.space_type}</td>
                        <td className="p-2 text-textSecondary">{r.location_name}</td>
                        <td className="p-2 text-right text-textPrimary">{r.bookings}</td>
                        <td className="p-2 text-right text-textPrimary">{r.hours_booked.toFixed(1)}</td>
                        <td className="p-2 text-right text-textPrimary">{formatCents(r.gross)}</td>
                        <td className="p-2 text-right text-textPrimary">{formatCents(r.owner_net)}</td>
                        <td className="p-2 text-right text-textPrimary">{formatCents(r.avg_revenue_per_hour)}</td>
                      </tr>
                    ))}
                    {revenuePerSpace.rows.length === 0 ? (
                      <tr>
                        <td className="p-2 text-textMuted" colSpan={8}>
                          No data for this period.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Top 10 spaces by revenue</div>
              <HorizontalBar
                data={revenuePerSpace.rows.slice(0, 10).map((r) => ({ name: r.space_name, net: r.owner_net }))}
                labelKey="name"
                valueKey="net"
                valueFormatter={formatCents}
              />
            </Card>
          </div>
        ) : null}

        {tab === "members" && retention && topMembers ? (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Monthly cohort retention</div>
              <CohortGrid cohorts={retention.cohorts} />
            </Card>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-textPrimary">Top members</div>
                <button
                  type="button"
                  onClick={() =>
                    downloadExport(
                      `/api/analytics/owner/top-members?${range}&limit=100&format=csv`,
                      "top-members.csv"
                    )
                  }
                  className="rounded-sm border border-border px-2 py-1 text-xs text-textSecondary hover:bg-surface2"
                >
                  CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-textMuted">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Email</th>
                      <th className="p-2 text-right">Bookings</th>
                      <th className="p-2 text-right">Spend</th>
                      <th className="p-2">Last booking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topMembers.rows.map((r) => (
                      <tr key={r.user_public_id ?? r.email ?? Math.random()} className="border-t border-border">
                        <td className="p-2 text-textPrimary">{r.name || "—"}</td>
                        <td className="p-2 text-textSecondary">{r.email || "—"}</td>
                        <td className="p-2 text-right text-textPrimary">{r.bookings}</td>
                        <td className="p-2 text-right text-textPrimary">{formatCents(r.spend)}</td>
                        <td className="p-2 text-textSecondary">{r.last_booking?.slice(0, 10) || "—"}</td>
                      </tr>
                    ))}
                    {topMembers.rows.length === 0 ? (
                      <tr>
                        <td className="p-2 text-textMuted" colSpan={5}>
                          No member activity in this window.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : null}

        {tab === "heatmap" && peak ? (
          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold text-textPrimary">Peak hours (booking hours)</div>
            <p className="mb-3 text-xs text-textMuted">
              Rows are day-of-week; columns are hour-of-day. Darker = more booked hours.
            </p>
            <Heatmap matrix={peak.matrix} />
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
