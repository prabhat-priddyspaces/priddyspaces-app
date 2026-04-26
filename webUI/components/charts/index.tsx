"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = ["#4F46E5", "#16A34A", "#D97706", "#DC2626", "#2563EB", "#7C3AED"];

const axisStyle = { stroke: "#9CA3AF", fontSize: 11 } as const;

interface SeriesRow extends Record<string, string | number> {
  bucket: string;
}

export function LineTimeSeries({
  data,
  keys,
  height = 220,
  valueFormatter,
}: {
  data: SeriesRow[];
  keys: string[];
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  if (!data.length) {
    return <div className="flex h-40 items-center justify-center text-sm text-textMuted">No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="bucket" {...axisStyle} />
        <YAxis {...axisStyle} tickFormatter={valueFormatter} width={60} />
        <Tooltip
          formatter={(value) =>
            valueFormatter && typeof value === "number" ? valueFormatter(value) : String(value ?? "")
          }
          contentStyle={{ fontSize: 12, borderColor: "#E5E7EB" }}
        />
        {keys.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarByCategory({
  data,
  keys,
  stacked = false,
  height = 220,
  valueFormatter,
}: {
  data: SeriesRow[];
  keys: string[];
  stacked?: boolean;
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  if (!data.length) {
    return <div className="flex h-40 items-center justify-center text-sm text-textMuted">No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="bucket" {...axisStyle} />
        <YAxis {...axisStyle} tickFormatter={valueFormatter} width={60} />
        <Tooltip
          formatter={(value) =>
            valueFormatter && typeof value === "number" ? valueFormatter(value) : String(value ?? "")
          }
          contentStyle={{ fontSize: 12, borderColor: "#E5E7EB" }}
        />
        {keys.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId={stacked ? "a" : undefined}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBar({
  data,
  labelKey,
  valueKey,
  height = 260,
  valueFormatter,
}: {
  data: Array<Record<string, string | number>>;
  labelKey: string;
  valueKey: string;
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  if (!data.length) {
    return <div className="flex h-40 items-center justify-center text-sm text-textMuted">No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ top: 8, right: 16, left: 80, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis type="number" {...axisStyle} tickFormatter={valueFormatter} />
        <YAxis type="category" dataKey={labelKey} {...axisStyle} width={120} />
        <Tooltip
          formatter={(value) =>
            valueFormatter && typeof value === "number" ? valueFormatter(value) : String(value ?? "")
          }
          contentStyle={{ fontSize: 12, borderColor: "#E5E7EB" }}
        />
        <Bar dataKey={valueKey} fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]}>
          {data.map((_entry, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Heatmap({ matrix }: { matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="w-10 px-1 py-1 text-left text-textMuted">&nbsp;</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="px-1 text-textMuted">
                {h.toString().padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className="px-1 py-0.5 text-textSecondary">{DAY_LABELS[rowIndex]}</td>
              {row.map((v, colIndex) => {
                const intensity = v / max;
                const bg =
                  intensity === 0
                    ? "#F3F4F6"
                    : `rgba(79, 70, 229, ${Math.max(0.08, intensity)})`;
                return (
                  <td
                    key={colIndex}
                    title={`${DAY_LABELS[rowIndex]} ${colIndex}:00 — ${v.toFixed(1)}h`}
                    className="h-6 w-6 border border-white"
                    style={{ backgroundColor: bg }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CohortGrid({
  cohorts,
}: {
  cohorts: Array<{
    cohort: string;
    size: number;
    retention: Array<{ offset: number; month: string; retained: number; pct: number }>;
  }>;
}) {
  if (!cohorts.length) {
    return <div className="text-sm text-textMuted">No cohort data yet.</div>;
  }
  const maxOffset = Math.max(...cohorts.map((c) => c.retention.length));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-border p-2 text-left text-textSecondary">Cohort</th>
            <th className="border border-border p-2 text-left text-textSecondary">Size</th>
            {Array.from({ length: maxOffset }, (_, i) => (
              <th key={i} className="border border-border p-2 text-center text-textSecondary">
                M{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort}>
              <td className="border border-border p-2 text-textPrimary">{c.cohort}</td>
              <td className="border border-border p-2 text-textPrimary">{c.size}</td>
              {Array.from({ length: maxOffset }, (_, i) => {
                const cell = c.retention[i];
                if (!cell) {
                  return <td key={i} className="border border-border bg-surface2" />;
                }
                const bg = `rgba(22, 163, 74, ${Math.max(0.05, cell.pct / 100)})`;
                return (
                  <td
                    key={i}
                    className="border border-border p-2 text-center"
                    style={{ backgroundColor: bg }}
                  >
                    <div className="text-textPrimary">{cell.pct.toFixed(0)}%</div>
                    <div className="text-[10px] text-textMuted">{cell.retained}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KPICard({
  label,
  value,
  deltaPct,
  hint,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  hint?: string;
}) {
  const deltaText =
    deltaPct === null || deltaPct === undefined
      ? null
      : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`;
  const deltaColor =
    deltaPct === null || deltaPct === undefined
      ? "text-textMuted"
      : deltaPct >= 0
        ? "text-success"
        : "text-error";
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="text-sm text-textMuted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-textPrimary">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {deltaText ? <span className={deltaColor}>{deltaText}</span> : null}
        {hint ? <span className="text-textMuted">{hint}</span> : null}
      </div>
    </div>
  );
}

export function DateRange({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-textMuted">From</label>
      <input
        type="date"
        value={startDate}
        onChange={(e) => onChange(e.target.value, endDate)}
        className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
      />
      <label className="text-xs text-textMuted">To</label>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onChange(startDate, e.target.value)}
        className="h-9 rounded-sm border border-border bg-white px-2 text-sm text-textPrimary"
      />
    </div>
  );
}

export function formatCents(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((value || 0) / 100);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value || 0);
}
