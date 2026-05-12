"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import {
  BarByCategory,
  DateRange,
  HorizontalBar,
  KPICard,
  LineTimeSeries,
  formatCents,
  formatNumber,
} from "@/components/charts";
import { Card } from "@/components/ui/card";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface PlatformResp {
  granularity: string;
  rows: Array<{
    bucket: string;
    gmv: number;
    platform_earnings: number;
    owner_net: number;
    failed: number;
    members?: number;
    owners?: number;
  }>;
  summary: {
    gmv: number;
    platform_earnings: number;
    take_rate_pct: number;
    failed_payments: number;
    new_members: number;
    new_owners: number;
  };
}

interface OrgRow {
  organization_public_id: string | null;
  organization_name: string;
  review_status: string | null;
  gmv: number;
  platform_earnings: number;
  owner_net: number;
  payments: number;
}

interface CitiesResp {
  rows: Array<{ city: string; bookings: number; lat: number | null; lng: number | null }>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function AdminAnalyticsPage() {
  const [startDate, setStartDate] = useState(daysAgoIso(29));
  const [endDate, setEndDate] = useState(todayIso());
  const [error, setError] = useState("");
  const [platform, setPlatform] = useState<PlatformResp | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [cities, setCities] = useState<CitiesResp | null>(null);

  const range = useMemo(() => `start_date=${startDate}&end_date=${endDate}`, [startDate, endDate]);

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    setError("");
    try {
      const [plat, leader, cits] = await Promise.all([
        apiFetch<PlatformResp>(
          `/api/analytics/admin/platform?${range}&granularity=day`,
          { method: "GET" },
          token
        ),
        apiFetch<{ rows: OrgRow[] }>(
          `/api/analytics/admin/org-leaderboard?${range}&limit=10`,
          { method: "GET" },
          token
        ),
        apiFetch<CitiesResp>(
          `/api/analytics/admin/cities?${range}`,
          { method: "GET" },
          token
        ),
      ]);
      setPlatform(plat);
      setOrgs(leader.rows);
      setCities(cits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

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
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Platform Analytics</h2>
            <p className="text-textSecondary">GMV, take rate, signups, and geography across tenants.</p>
          </div>
          <DateRange startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
        </div>

        {error ? <div className="text-sm text-error">{error}</div> : null}

        {platform ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPICard label="GMV" value={formatCents(platform.summary.gmv)} />
              <KPICard label="Platform earnings" value={formatCents(platform.summary.platform_earnings)} />
              <KPICard label="Take rate" value={`${platform.summary.take_rate_pct}%`} />
              <KPICard label="Failed payments" value={formatNumber(platform.summary.failed_payments)} />
              <KPICard label="New members" value={formatNumber(platform.summary.new_members)} />
              <KPICard label="New owners" value={formatNumber(platform.summary.new_owners)} />
            </div>

            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">GMV & platform earnings (daily)</div>
              <LineTimeSeries
                data={platform.rows.map((r) => ({ bucket: r.bucket, gmv: r.gmv, platform_earnings: r.platform_earnings }))}
                keys={["gmv", "platform_earnings"]}
                valueFormatter={formatCents}
              />
            </Card>

            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold text-textPrimary">Signups (daily)</div>
              <BarByCategory
                data={platform.rows.map((r) => ({ bucket: r.bucket, members: r.members ?? 0, owners: r.owners ?? 0 }))}
                keys={["members", "owners"]}
                stacked
              />
            </Card>
          </>
        ) : null}

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-textPrimary">Top organizations by GMV</div>
            <button
              type="button"
              onClick={() =>
                downloadExport(`/api/analytics/admin/org-leaderboard?${range}&limit=50&format=csv`, "org-leaderboard.csv")
              }
              className="rounded-sm border border-border px-2 py-1 text-xs text-textSecondary hover:bg-surface2"
            >
              CSV
            </button>
          </div>
          <HorizontalBar
            data={orgs.map((o) => ({ name: o.organization_name, gmv: o.gmv }))}
            labelKey="name"
            valueKey="gmv"
            valueFormatter={formatCents}
          />
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-textPrimary">Bookings by city</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="text-left text-textMuted">
                <tr>
                  <th className="p-2">City</th>
                  <th className="p-2 text-right">Bookings</th>
                  <th className="p-2">Lat</th>
                  <th className="p-2">Lng</th>
                </tr>
              </thead>
              <tbody>
                {(cities?.rows ?? []).map((c) => (
                  <tr key={c.city} className="border-t border-border">
                    <td className="p-2 text-textPrimary">{c.city}</td>
                    <td className="p-2 text-right text-textPrimary">{c.bookings}</td>
                    <td className="p-2 text-textSecondary">{c.lat?.toFixed(4) ?? "—"}</td>
                    <td className="p-2 text-textSecondary">{c.lng?.toFixed(4) ?? "—"}</td>
                  </tr>
                ))}
                {!cities?.rows.length ? (
                  <tr>
                    <td className="p-2 text-textMuted" colSpan={4}>
                      No bookings in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-textPrimary">Downloadable reports</div>
          <div className="flex flex-wrap gap-2">
            {(["reconciliation", "failed-payments", "payouts"] as const).map((kind) => (
              <div key={kind} className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs">
                <span className="text-textSecondary">{kind}</span>
                <button
                  type="button"
                  onClick={() =>
                    downloadExport(`/api/analytics/admin/reports/${kind}?${range}&format=csv`, `${kind}.csv`)
                  }
                  className="text-accent hover:underline"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadExport(`/api/analytics/admin/reports/${kind}?${range}&format=pdf`, `${kind}.pdf`)
                  }
                  className="text-accent hover:underline"
                >
                  PDF
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
