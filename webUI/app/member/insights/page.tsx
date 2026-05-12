"use client";

import { useCallback, useEffect, useState } from "react";

import { BarByCategory, KPICard, formatCents, formatNumber } from "@/components/charts";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Summary {
  totals: {
    visits: number;
    hours: number;
    spent: number;
    upcoming: number;
    past: number;
  };
  favourite_space: {
    space_public_id: string | null;
    space_name: string | null;
    location_name: string | null;
  };
  usual: { day_of_week: number | null; hour: number | null };
  upcoming: Array<{ public_id: string; start_datetime: string; end_datetime: string }>;
  visit_series: Array<{ bucket: string; visits: number }>;
}

const DAY_LABEL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function MemberInsightsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    try {
      const result = await apiFetch<Summary>("/api/analytics/me/summary", { method: "GET" }, token);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-textPrimary">Your insights</h2>
        <p className="text-textSecondary">Your workspace activity at a glance.</p>
      </div>
      {error ? <div className="text-sm text-error">{error}</div> : null}
      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KPICard label="Total visits" value={formatNumber(data.totals.visits)} />
            <KPICard label="Hours booked" value={`${data.totals.hours}h`} />
            <KPICard label="Total spent" value={formatCents(data.totals.spent)} />
            <KPICard
              label="Upcoming / past"
              value={`${data.totals.upcoming} / ${data.totals.past}`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="text-sm font-semibold text-textPrimary">Favourite space</div>
              <div className="mt-2 text-lg text-textPrimary">
                {data.favourite_space.space_name || "—"}
              </div>
              <div className="text-sm text-textMuted">
                {data.favourite_space.location_name || "No bookings yet"}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-semibold text-textPrimary">Your usual</div>
              <div className="mt-2 text-lg text-textPrimary">
                {data.usual.day_of_week !== null
                  ? `${DAY_LABEL[data.usual.day_of_week]}s`
                  : "—"}
                {data.usual.hour !== null
                  ? ` · ${data.usual.hour.toString().padStart(2, "0")}:00`
                  : ""}
              </div>
              <div className="text-sm text-textMuted">Most frequent day/time</div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold text-textPrimary">Visits (last 12 weeks)</div>
            <BarByCategory data={data.visit_series} keys={["visits"]} />
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold text-textPrimary">
              Upcoming bookings ({data.upcoming.length})
            </div>
            <div className="grid gap-2">
              {data.upcoming.map((b) => (
                <div key={b.public_id} className="rounded-sm border border-border p-2 text-sm">
                  <div className="text-textPrimary">
                    {b.start_datetime.slice(0, 16).replace("T", " ")} → {b.end_datetime.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
              ))}
              {data.upcoming.length === 0 ? (
                <div className="text-sm text-textMuted">No upcoming bookings.</div>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
