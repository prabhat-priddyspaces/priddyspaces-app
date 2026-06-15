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

const CHART_COLORS = [
  "var(--brand)",
  "var(--accent)",
  "var(--ps-success)",
  "var(--ps-info)",
  "var(--ps-warning)",
  "var(--ps-danger)",
];

const axisStyle = { stroke: "var(--text-4)", fontSize: 12 } as const;
const gridStroke = "var(--line)";

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
    return <div className="flex h-40 items-center justify-center text-sm text-text-3">No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey="bucket" {...axisStyle} />
        <YAxis {...axisStyle} tickFormatter={valueFormatter} width={60} />
        <Tooltip
          formatter={(value) =>
            valueFormatter && typeof value === "number" ? valueFormatter(value) : String(value ?? "")
          }
          contentStyle={{ fontSize: 12, borderColor: "var(--line)" }}
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
    return <div className="flex h-40 items-center justify-center text-sm text-text-3">No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey="bucket" {...axisStyle} />
        <YAxis {...axisStyle} tickFormatter={valueFormatter} width={60} />
        <Tooltip
          formatter={(value) =>
            valueFormatter && typeof value === "number" ? valueFormatter(value) : String(value ?? "")
          }
          contentStyle={{ fontSize: 12, borderColor: "var(--line)" }}
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
    return <div className="flex h-40 items-center justify-center text-sm text-text-3">No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} margin={{ top: 8, right: 16, left: 80, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis type="number" {...axisStyle} tickFormatter={valueFormatter} />
        <YAxis type="category" dataKey={labelKey} {...axisStyle} width={120} />
        <Tooltip
          formatter={(value) =>
            valueFormatter && typeof value === "number" ? valueFormatter(value) : String(value ?? "")
          }
          contentStyle={{ fontSize: 12, borderColor: "var(--line)" }}
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
      <table className="border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="w-10 px-1 py-1 text-left text-text-3">&nbsp;</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="px-1 text-text-3">
                {h.toString().padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className="px-1 py-0.5 text-text-2">{DAY_LABELS[rowIndex]}</td>
              {row.map((v, colIndex) => {
                const intensity = v / max;
                const bg =
                  intensity === 0
                    ? "var(--surface-2)"
                    : `rgba(47, 93, 80, ${Math.max(0.08, intensity)})`;
                return (
                  <td
                    key={colIndex}
                    title={`${DAY_LABELS[rowIndex]} ${colIndex}:00 — ${v.toFixed(1)}h`}
                    className="h-6 w-6 border border-surface"
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
    return <div className="text-sm text-text-3">No cohort data yet.</div>;
  }
  const maxOffset = Math.max(...cohorts.map((c) => c.retention.length));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-line p-2 text-left text-text-2">Cohort</th>
            <th className="border border-line p-2 text-left text-text-2">Size</th>
            {Array.from({ length: maxOffset }, (_, i) => (
              <th key={i} className="border border-line p-2 text-center text-text-2">
                M{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort}>
              <td className="border border-line p-2 text-text">{c.cohort}</td>
              <td className="border border-line p-2 text-text">{c.size}</td>
              {Array.from({ length: maxOffset }, (_, i) => {
                const cell = c.retention[i];
                if (!cell) {
                  return <td key={i} className="border border-line bg-surface-2" />;
                }
                const bg = `rgba(47, 107, 79, ${Math.max(0.05, cell.pct / 100)})`;
                return (
                  <td
                    key={i}
                    className="border border-line p-2 text-center"
                    style={{ backgroundColor: bg }}
                  >
                    <div className="text-text">{cell.pct.toFixed(0)}%</div>
                    <div className="text-[12px] text-text-3">{cell.retained}</div>
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
      ? "text-text-3"
      : deltaPct >= 0
        ? "text-success"
        : "text-danger";
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-xs">
      <div className="text-sm text-text-3">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-text">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {deltaText ? <span className={deltaColor}>{deltaText}</span> : null}
        {hint ? <span className="text-text-3">{hint}</span> : null}
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
      <label className="text-xs text-text-3">From</label>
      <input
        type="date"
        value={startDate}
        onChange={(e) => onChange(e.target.value, endDate)}
        className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
      />
      <label className="text-xs text-text-3">To</label>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onChange(startDate, e.target.value)}
        className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
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
