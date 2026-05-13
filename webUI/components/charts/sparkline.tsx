"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  className?: string;
}

export function Sparkline({
  points,
  width = 80,
  height = 24,
  positive = true,
  className,
}: SparklineProps) {
  if (!points.length) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * width;
      const y = height - ((p - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = positive ? "var(--brand)" : "var(--ps-danger)";
  return (
    <svg
      width={width}
      height={height}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d={`${path} L${width} ${height} L0 ${height} Z`}
        fill={stroke}
        opacity="0.12"
      />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
