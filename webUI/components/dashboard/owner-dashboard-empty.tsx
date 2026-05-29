"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Check,
  CreditCard,
  DollarSign,
  Building2,
  FileText,
  MapPin,
  Megaphone,
  Box,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Step {
  done: boolean;
  current?: boolean;
  label: string;
}

interface OnboardingCard {
  icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
  href: string;
  primary?: boolean;
  est: string;
}

interface QuietKpi {
  label: string;
  value: string;
  icon: LucideIcon;
  sub: string;
}

interface Resource {
  icon: LucideIcon;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { done: true, label: "Account" },
  { done: true, label: "Organization" },
  { done: false, current: true, label: "First location" },
  { done: false, label: "Add a room" },
  { done: false, label: "Connect Stripe" },
  { done: false, label: "Invite team" },
];

const ONBOARDING: OnboardingCard[] = [
  {
    icon: MapPin,
    title: "Add your first location",
    body: "Address, hours, amenities — the public marketplace pulls from this.",
    cta: "Add location",
    href: "/owner/locations/new",
    primary: true,
    est: "~ 3 min",
  },
  {
    icon: Box,
    title: "Set up rooms or desks",
    body: "Pricing per hour / day / month, capacity, photos, buffer time.",
    cta: "Add a room",
    href: "/owner/spaces/new",
    est: "~ 5 min",
  },
  {
    icon: CreditCard,
    title: "Connect Stripe",
    body: "Accept bookings and run subscriptions through your own Stripe account.",
    cta: "Connect Stripe",
    href: "/owner/settings/payments",
    est: "~ 2 min",
  },
];

const QUIET_KPIS: QuietKpi[] = [
  { label: "MTD Revenue", value: "$0", icon: DollarSign, sub: "Connect Stripe to track" },
  { label: "Bookings", value: "0", icon: Calendar, sub: "Add a room to start" },
  { label: "Occupancy", value: "—", icon: Building2, sub: "We'll start measuring once you go live" },
  { label: "Active members", value: "0", icon: Users, sub: "Invite or migrate" },
];

const RESOURCES: Resource[] = [
  {
    icon: FileText,
    title: "Import existing members",
    body: "Bring members from a CSV or Cobot export.",
  },
  {
    icon: Megaphone,
    title: "Publish to marketplace",
    body: "Your location appears at priddyspaces.com once live.",
  },
  {
    icon: Users,
    title: "Invite your team",
    body: "Owners, admins, staff — each with their own access.",
  },
];

export function OwnerDashboardEmpty({ firstName }: { firstName?: string }) {
  return (
    <div className="space-y-5">
      {/* Welcome card */}
      <Card
        padded={false}
        className="relative overflow-hidden p-5 sm:p-8"
        style={{
          background:
            "linear-gradient(135deg, var(--brand-soft) 0%, transparent 60%), var(--surface)",
        }}
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div
            className="w-14 h-14 rounded-2xl grid place-items-center flex-none"
            style={{
              background:
                "linear-gradient(135deg, var(--brand) 0%, var(--ps-violet-700) 100%)",
              boxShadow: "0 8px 24px rgba(124,91,245,.35)",
            }}
          >
            <Sparkles size={24} color="#fff" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[22px] font-semibold tracking-[-0.02em]">
              Welcome to Priddyspaces{firstName ? `, ${firstName}` : ""}.
            </div>
            <div className="text-[13px] text-text-2 mt-1 max-w-xl">
              You&apos;re 4 steps from going live. We&apos;ll connect Stripe last so your first
              booking can pay.
            </div>
          </div>
          <Link href="/owner/locations/new" className="w-full sm:w-auto">
            <Button variant="primary" size="lg" className="w-full justify-center sm:w-auto">
              Continue setup
              <ArrowRight size={16} />
            </Button>
          </Link>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mt-7 overflow-x-auto -mx-1 px-1">
          {STEPS.map((step, i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1.5 flex-none">
                <div
                  className={cn(
                    "w-[22px] h-[22px] rounded-full grid place-items-center text-[11px] font-bold",
                    step.done
                      ? "bg-brand text-white"
                      : step.current
                      ? "bg-surface text-brand border-2 border-brand"
                      : "bg-surface-2 text-brand border-2 border-transparent"
                  )}
                  style={
                    step.current
                      ? { boxShadow: "0 0 0 4px var(--brand-soft)" }
                      : undefined
                  }
                >
                  {step.done ? <Check size={12} strokeWidth={3} /> : i + 1}
                </div>
                <div
                  className={cn(
                    "text-[11px] whitespace-nowrap",
                    step.current
                      ? "text-text font-semibold"
                      : "text-text-3 font-medium"
                  )}
                >
                  {step.label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="flex-1 h-0.5 mb-[18px]"
                  style={{
                    background: step.done ? "var(--brand)" : "var(--line-strong)",
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* Onboarding cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {ONBOARDING.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              padded={false}
              className={cn(
                "p-5",
                card.primary && "border-brand"
              )}
              style={
                card.primary
                  ? { boxShadow: "0 0 0 3px var(--brand-soft)" }
                  : undefined
              }
            >
              <div className="w-9 h-9 rounded-[10px] bg-brand-soft text-brand grid place-items-center mb-3.5">
                <Icon size={18} strokeWidth={1.6} />
              </div>
              <div className="text-[15px] font-semibold mb-1">{card.title}</div>
              <div className="text-[12px] text-text-3 mb-3.5 leading-relaxed">
                {card.body}
              </div>
              <div className="flex items-center justify-between">
                <Link href={card.href}>
                  <Button variant={card.primary ? "primary" : "default"} size="sm">
                    {card.cta}
                  </Button>
                </Link>
                <span className="text-[11px] text-text-3">{card.est}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Quiet KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {QUIET_KPIS.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} padded={false} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-md bg-surface-2 text-text-3 grid place-items-center">
                  <Icon size={13} strokeWidth={1.6} />
                </div>
                <div className="text-[12px] text-text-3">{kpi.label}</div>
              </div>
              <div
                className="font-mono text-[26px] font-semibold text-text-4 leading-none tracking-[-0.02em]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {kpi.value}
              </div>
              <div className="text-[11px] text-text-3 mt-2">{kpi.sub}</div>
            </Card>
          );
        })}
      </div>

      {/* Resources */}
      <Card padded={false} className="p-5">
        <div className="flex items-end justify-between mb-3.5">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">
            While you&apos;re setting up
          </h3>
          <Button variant="ghost" size="sm">
            Skip <X size={12} />
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {RESOURCES.map((r) => {
            const Icon = r.icon;
            return (
              <div
                key={r.title}
                className="flex gap-2.5 p-2.5 rounded-[10px] bg-surface-2"
              >
                <div className="w-7 h-7 rounded-lg bg-surface text-text-2 grid place-items-center flex-none">
                  <Icon size={14} strokeWidth={1.6} />
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold mb-0.5">{r.title}</div>
                  <div className="text-[11px] text-text-3 leading-snug">{r.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Suppress unused import warning when needed */}
      <Badge variant="default" className="sr-only">
        empty
      </Badge>
    </div>
  );
}
