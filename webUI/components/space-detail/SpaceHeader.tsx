import { CheckCircle2, Users } from "lucide-react";

import { formatSpaceTypeLabel, type MarketplaceSpaceDetailSpace } from "@/lib/public-marketplace";
import type { PriceRow } from "@/components/space-detail/helpers";

export interface SpaceHeaderProps {
  space: MarketplaceSpaceDetailSpace;
  priceRows: PriceRow[];
  primaryPrice: string;
}

export function SpaceHeader({ space, priceRows, primaryPrice }: SpaceHeaderProps) {
  return (
    <section className="border-b border-line pb-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text">{space.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm font-medium text-text-2">
              <Users className="h-4 w-4 text-text-3" />
              {space.capacity} seats
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm font-medium text-text-2">
              <CheckCircle2 className="h-4 w-4 text-text-3" />
              {formatSpaceTypeLabel(space.space_type)}
            </span>
            {space.amenities.slice(0, 6).map((amenity) => (
              <span
                key={amenity}
                className="rounded-full border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-text-2"
              >
                {amenity}
              </span>
            ))}
          </div>
        </div>
        <div className="min-w-[220px] rounded-2xl border border-brand/30 bg-brand-soft px-5 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand">Pricing</div>
          <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text">{primaryPrice}</div>
          {priceRows.length > 1 ? (
            <div className="mt-3 space-y-2 text-sm text-text-2">
              {priceRows.slice(1).map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4">
                  <span>{row.label}</span>
                  <span className="font-medium text-text">{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
