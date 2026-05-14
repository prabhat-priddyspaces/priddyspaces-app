"use client";

import * as React from "react";

export interface RevenueDay {
  bookings: number;
  members: number;
}

export interface RevenueChartProps {
  data?: RevenueDay[];
  height?: number;
}

export function RevenueChart({ data, height = 140 }: RevenueChartProps) {
  const series = data ?? [];
  if (series.length === 0) return null;
  const days = series.length;
  const max = Math.max(1, ...series.map((d) => d.bookings + d.members));
  const w = 100;
  const h = height;
  const point = (i: number) => (i / Math.max(1, days - 1)) * w;
  const memberY = (i: number) => h - (series[i].members / max) * h;
  const totalY = (i: number) => h - ((series[i].bookings + series[i].members) / max) * h;

  const membersTopPath =
    series
      .map((_, i) => `${i === 0 ? "M" : "L"}${point(i).toFixed(2)},${memberY(i).toFixed(2)}`)
      .join(" ");
  const membersFillPath = `${membersTopPath} L${w},${h} L0,${h} Z`;

  const totalsTopPath = series
    .map((_, i) => `${i === 0 ? "M" : "L"}${point(i).toFixed(2)},${totalY(i).toFixed(2)}`)
    .join(" ");
  const bookingsFillPath = (() => {
    const top = totalsTopPath;
    const reverse = series
      .slice()
      .reverse()
      .map((_, idx) => {
        const i = days - 1 - idx;
        return `L${point(i).toFixed(2)},${memberY(i).toFixed(2)}`;
      })
      .join(" ");
    return `${top} L${point(days - 1).toFixed(2)},${memberY(days - 1).toFixed(2)} ${reverse} Z`;
  })();

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      style={{ overflow: "visible" }}
      aria-hidden
    >
      <defs>
        <linearGradient id="bookingsGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="memberGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ps-mint-500)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--ps-mint-500)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1="0"
          x2={w}
          y1={h * p}
          y2={h * p}
          stroke="var(--line)"
          strokeWidth="0.3"
          strokeDasharray="0.5 1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={membersFillPath} fill="url(#memberGrad)" />
      <path
        d={membersTopPath}
        fill="none"
        stroke="var(--ps-mint-500)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <path d={bookingsFillPath} fill="url(#bookingsGrad)" />
      <path
        d={totalsTopPath}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
