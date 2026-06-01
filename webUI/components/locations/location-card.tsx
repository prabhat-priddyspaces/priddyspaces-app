"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  Car,
  Coffee,
  Globe,
  MapPin,
  MoreHorizontal,
  Plus,
  Printer,
  Wifi,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const AMENITY_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  coffee: Coffee,
  parking: Car,
  printer: Printer,
};

function amenityIcon(name: string): LucideIcon {
  const key = name.toLowerCase();
  for (const k of Object.keys(AMENITY_ICONS)) {
    if (key.includes(k)) return AMENITY_ICONS[k];
  }
  return Building2;
}

export interface LocationCardProps {
  publicId: string;
  name: string;
  city: string | null;
  address: string;
  rooms: number;
  occupancy: number | null;
  mtdNet: number | null;
  status: "active" | "onboarding" | string;
  organizationReviewStatus?: string | null;
  marketplacePaymentStatus?: string | null;
  paymentHiddenListings?: number | null;
  onRequestApproval?: () => void;
  requestingApproval?: boolean;
  primary?: boolean;
  amenities?: Array<{ id: number; name: string }>;
}

function reviewStatusMeta(status?: string | null) {
  switch (status) {
    case "approved":
      return {
        label: "Marketplace approved",
        detail: "",
        variant: "success" as const,
        canRequest: false,
      };
    case "pending":
      return {
        label: "Marketplace in review",
        detail: "This location is hidden from public search until a super admin approves the company.",
        variant: "warning" as const,
        canRequest: true,
      };
    case "rejected":
      return {
        label: "Marketplace rejected",
        detail: "Update the company details, then request another review.",
        variant: "danger" as const,
        canRequest: true,
      };
    default:
      return {
        label: "Marketplace status unavailable",
        detail: "Company review status could not be loaded.",
        variant: "default" as const,
        canRequest: false,
      };
  }
}

export function LocationCard({
  publicId,
  name,
  city,
  address,
  rooms,
  occupancy,
  mtdNet,
  status,
  organizationReviewStatus,
  marketplacePaymentStatus,
  paymentHiddenListings,
  onRequestApproval,
  requestingApproval,
  primary,
  amenities = [],
}: LocationCardProps) {
  const isOnboarding = status === "onboarding";
  const review = reviewStatusMeta(organizationReviewStatus);
  const occupancyColor =
    occupancy == null
      ? "text-text"
      : occupancy > 0.8
      ? "text-success"
      : occupancy > 0.5
      ? "text-text"
      : "text-warning";
  const visibleAmenities = amenities.slice(0, 4);
  const hiddenCount = Math.max(0, amenities.length - visibleAmenities.length);
  const paymentBlocked = (paymentHiddenListings ?? 0) > 0;

  return (
    <Card
      padded={false}
      className={cn(
        "overflow-hidden",
        primary && "border-brand"
      )}
      style={primary ? { boxShadow: "0 0 0 3px var(--brand-soft)" } : undefined}
    >
      {/* Hero strip */}
      <div
        className="relative h-20"
        style={{
          background: isOnboarding
            ? "linear-gradient(135deg, #FFF4E5, #FFE4C9)"
            : "linear-gradient(135deg, var(--ps-violet-100), var(--ps-mint-100))",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 80%, rgba(255,255,255,.4) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(124,91,245,.15) 0%, transparent 50%)",
          }}
        />
        <div className="absolute top-2.5 right-2.5 flex gap-1.5">
          {primary && (
            <Badge
              variant="violet"
              className="bg-white/70 backdrop-blur-sm"
            >
              Primary
            </Badge>
          )}
          {isOnboarding ? (
            <Badge variant="warning" dot>
              Onboarding
            </Badge>
          ) : (
            <Badge variant="success" dot>
              Live
            </Badge>
          )}
        </div>
        <div className="absolute left-4 bottom-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-surface text-brand grid place-items-center shadow-sm">
            <Building2 size={16} />
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-[-0.01em]">
              {name}
            </div>
            <div className="text-[12px] text-text-3 mt-0.5 flex items-center gap-1 truncate">
              <MapPin size={11} />
              {address}
              {city ? ` · ${city}` : ""}
            </div>
            <div className="mt-2">
              <Badge variant={review.variant} dot>
                {review.label}
              </Badge>
              {paymentBlocked ? (
                <Badge variant="warning" dot className="ml-1.5">
                  Payment setup required
                </Badge>
              ) : marketplacePaymentStatus === "ready" ? (
                <Badge variant="success" dot className="ml-1.5">
                  Payments ready
                </Badge>
              ) : null}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-7 p-0 justify-center flex-none"
            aria-label="More"
          >
            <MoreHorizontal size={14} />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-3 bg-surface-2 rounded-[10px] mb-3">
          <Metric label="Rooms" value={rooms.toString()} />
          <Metric
            label="Occupancy"
            value={occupancy != null ? `${Math.round(occupancy * 100)}%` : "—"}
            valueClassName={occupancyColor}
          />
          <Metric
            label="MTD net"
            value={mtdNet != null ? `$${(mtdNet / 1000).toFixed(1)}k` : "—"}
          />
        </div>

        {amenities.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3.5">
            {visibleAmenities.map((a) => {
              const Icon = amenityIcon(a.name);
              return (
                <div
                  key={a.id}
                  title={a.name}
                  className="w-[22px] h-[22px] rounded-[5px] bg-surface-2 text-text-3 grid place-items-center"
                >
                  <Icon size={11} strokeWidth={2} />
                </div>
              );
            })}
            {hiddenCount > 0 && (
              <span className="text-[11px] text-text-3 px-1.5 self-center">
                + {hiddenCount} more
              </span>
            )}
          </div>
        )}

        {review.canRequest && (
          <div className="mb-3 rounded-[8px] border border-line bg-surface-2 px-3 py-2">
            <div className="text-[12px] leading-5 text-text-2">{review.detail}</div>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="mt-2"
              onClick={onRequestApproval}
              disabled={!onRequestApproval || requestingApproval}
            >
              {requestingApproval ? "Sending..." : "Request approval"}
            </Button>
          </div>
        )}

        {paymentBlocked ? (
          <div className="mb-3 rounded-[8px] border border-warning/30 bg-warning-soft px-3 py-2">
            <div className="text-[12px] leading-5 text-warning">
              Hidden from search until payment setup is complete.
            </div>
            <Link href="/owner/settings/payments">
              <Button type="button" variant="default" size="sm" className="mt-2">
                Fix payments
              </Button>
            </Link>
          </div>
        ) : null}

        <div className="flex gap-1.5">
          <Link
            href={`/owner/locations/spaces?locationId=${publicId}`}
            className="flex-1"
          >
            <Button variant="primary" size="sm" className="w-full justify-center">
              Manage rooms
            </Button>
          </Link>
          <Link href={`/owner/locations/${publicId}/edit`}>
            <Button variant="default" size="sm">
              Edit
            </Button>
          </Link>
          <Link href={`/owner/spaces/new?locationId=${publicId}`}>
            <Button
              variant="ghost"
              size="sm"
              className="w-[30px] p-0 justify-center"
              aria-label="View on marketplace"
            >
              <Globe size={13} />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-text-3 font-semibold uppercase tracking-[0.05em]">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-[18px] font-semibold tracking-[-0.02em]",
          valueClassName ?? "text-text"
        )}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
    </div>
  );
}

export function AddLocationCard() {
  return (
    <Link href="/owner/locations/new" className="contents">
      <div className="p-5 rounded-2xl border-2 border-dashed border-line-strong bg-surface flex flex-col items-center justify-center gap-2 min-h-[200px] text-text-3 text-center cursor-pointer hover:border-brand/60 transition-colors">
        <div className="w-10 h-10 rounded-[10px] bg-brand-soft text-brand grid place-items-center">
          <Plus size={20} />
        </div>
        <div className="text-[14px] font-semibold text-text">
          Add a new location
        </div>
        <div className="text-[12px] max-w-[240px]">
          Address, hours, amenities — appears on the marketplace once you add rooms.
        </div>
      </div>
    </Link>
  );
}
