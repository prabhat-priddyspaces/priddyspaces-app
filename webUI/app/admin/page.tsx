"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  Calendar,
  CreditCard,
  DollarSign,
  Inbox,
  Box,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { AdminShell } from "@/components/admin-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatCard, type StatAccent } from "@/components/charts/stat-card";
import { cn } from "@/lib/utils";
import { formatAdminDateTime, formatAdminLabel } from "@/lib/admin-format";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface DashboardResponse {
  metrics: Record<string, number>;
  recent_activity: Array<{
    public_id: string;
    action: string;
    action_label?: string;
    entity_type: string;
    entity_public_id: string;
    entity_label?: string;
    actor_name: string | null;
    actor_email: string | null;
    created_at: string | null;
  }>;
}

interface MetricSpec {
  key: string;
  label: string;
  icon: LucideIcon;
  accent: StatAccent;
  formatter?: (value: number) => string;
  sub?: string;
  href: string;
}

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const METRICS: MetricSpec[] = [
  { key: "users", label: "Users", icon: Users, accent: "violet", href: "/admin/users" },
  { key: "members", label: "Members", icon: Users, accent: "mint", href: "/admin/members" },
  {
    key: "owner_companies",
    label: "Owner companies",
    icon: Building2,
    accent: "violet",
    href: "/admin/owner-companies",
  },
  {
    key: "live_listings",
    label: "Live listings",
    icon: Box,
    accent: "mint",
    sub: "Active marketplace inventory",
    href: "/admin/listings",
  },
  { key: "bookings", label: "Bookings", icon: Calendar, accent: "violet", href: "/admin/bookings" },
  {
    key: "booking_requests",
    label: "Pending requests",
    icon: Inbox,
    accent: "muted",
    href: "/admin/bookings",
  },
  {
    key: "gmv",
    label: "GMV",
    icon: DollarSign,
    accent: "mint",
    formatter: (value) => currencyFormatter.format(value),
    href: "/admin/payments",
  },
  {
    key: "platform_earnings",
    label: "Platform earnings",
    icon: CreditCard,
    accent: "violet",
    formatter: (value) => currencyFormatter.format(value),
    sub: "Net of host payouts",
    href: "/admin/payments",
  },
];

function entityBadgeVariant(
  entityType: string
): "violet" | "mint" | "warning" | "info" | "default" {
  const t = entityType.toLowerCase();
  if (t.includes("booking")) return "violet";
  if (t.includes("user") || t.includes("member")) return "mint";
  if (t.includes("payment") || t.includes("invoice")) return "warning";
  if (t.includes("listing") || t.includes("space") || t.includes("location"))
    return "info";
  return "default";
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<DashboardResponse>("/api/admin/dashboard", { method: "GET" }, token)
      .then(setData)
      .catch((err) =>
        setMessage(err instanceof Error ? err.message : "Failed to load dashboard")
      );
  }, []);

  const cards = useMemo(() => {
    const metrics = data?.metrics ?? {};
    return METRICS.map((spec) => {
      const raw = metrics[spec.key] ?? 0;
      const value = spec.formatter
        ? spec.formatter(raw)
        : numberFormatter.format(raw);
      return { ...spec, raw, value };
    });
  }, [data]);

  const activity = data?.recent_activity ?? [];

  return (
    <AdminShell title="Platform Console" breadcrumb={["Admin", "Overview"]}>
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
            Platform Console
          </h2>
          <p className="text-[13px] text-text-3 mt-1">
            Global platform activity, company approval, and earnings.
          </p>
        </div>
      </div>

      {message ? (
        <div className="mb-4 text-[13px] text-danger">{message}</div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            aria-label={`Open ${card.label}`}
            data-testid={`admin-stat-${card.key.replace(/_/g, "-")}`}
            className="rounded-2xl transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:shadow-ring"
          >
            <StatCard
              label={card.label}
              value={card.value}
              icon={card.icon}
              accent={card.accent}
              sub={card.sub}
              className="h-full"
            />
          </Link>
        ))}
      </div>

      <Card padded={false} className="p-5">
        <div className="flex items-end justify-between gap-3 mb-3.5">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">
              Recent activity
            </h3>
            <p className="text-[12px] text-text-3 mt-0.5">
              Latest events across every workspace.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-text-3">
            <Activity size={12} />
            Live
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          </div>
        </div>
        {activity.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-text-3">
            <Sparkles size={14} className="text-text-4" />
            No recent activity yet.
          </div>
        ) : (
          <ul className="flex flex-col">
            {activity.map((item, i) => {
              const action =
                item.action_label || formatAdminLabel(item.action);
              const actor = item.actor_name || item.actor_email || "System";
              return (
                <li
                  key={item.public_id}
                  className={cn(
                    "flex items-start gap-3 py-3",
                    i > 0 && "border-t border-line"
                  )}
                >
                  <Avatar name={actor} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold truncate">
                        {action}
                      </span>
                      <Badge variant={entityBadgeVariant(item.entity_type)}>
                        {formatAdminLabel(item.entity_type)}
                      </Badge>
                    </div>
                    <div className="text-[12px] text-text-2 mt-0.5 truncate">
                      {item.entity_label || item.entity_public_id}
                    </div>
                    <div className="text-[11px] text-text-3 mt-0.5">
                      {actor} ·{" "}
                      <span
                        className="font-mono"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {formatAdminDateTime(item.created_at)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AdminShell>
  );
}
