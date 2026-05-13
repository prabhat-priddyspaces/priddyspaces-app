"use client";

import * as React from "react";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";

export type StatAccent = "violet" | "mint" | "muted";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  accent?: StatAccent;
  delta?: string;
  deltaPositive?: boolean;
  sparkline?: number[];
  sub?: React.ReactNode;
  large?: boolean;
  muted?: boolean;
  className?: string;
}

const accentStyles: Record<StatAccent, string> = {
  violet: "bg-brand-soft text-brand",
  mint: "bg-mint-50 text-mint-700",
  muted: "bg-surface-2 text-text-3",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "muted",
  delta,
  deltaPositive,
  sparkline,
  sub,
  large,
  muted,
  className,
}: StatCardProps) {
  return (
    <Card
      padded={false}
      className={cn(
        "flex flex-col gap-2.5",
        large ? "p-5" : "p-4",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div
              className={cn(
                "w-6 h-6 rounded-[7px] grid place-items-center flex-none",
                accentStyles[accent]
              )}
            >
              <Icon size={14} strokeWidth={1.6} />
            </div>
          )}
          <div className="text-[12px] text-text-3 font-medium truncate">
            {label}
          </div>
        </div>
        {delta && (
          <div
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-px rounded-full",
              deltaPositive
                ? "bg-success-soft text-success"
                : "bg-danger-soft text-danger"
            )}
          >
            {deltaPositive ? (
              <TrendingUp size={10} strokeWidth={2.5} />
            ) : (
              <TrendingDown size={10} strokeWidth={2.5} />
            )}
            <span className="font-mono">{delta}</span>
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div
          className={cn(
            "font-mono font-semibold tracking-[-0.025em] leading-none",
            large ? "text-[32px]" : "text-[26px]",
            muted ? "text-text-4" : "text-text"
          )}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </div>
        {sparkline && sparkline.length > 0 && (
          <Sparkline points={sparkline} positive={deltaPositive !== false} />
        )}
      </div>
      {sub && <div className="text-[11px] text-text-3">{sub}</div>}
    </Card>
  );
}
