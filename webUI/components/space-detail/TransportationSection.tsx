import { MapPin } from "lucide-react";

import type { MarketplaceSpaceDetailLocation } from "@/lib/public-marketplace";

export interface TransportationSectionProps {
  parkingNotes: MarketplaceSpaceDetailLocation["public_parking_notes"];
  transitNotes: MarketplaceSpaceDetailLocation["public_transit_notes"];
}

export function TransportationSection({ parkingNotes, transitNotes }: TransportationSectionProps) {
  if (parkingNotes.length === 0 && transitNotes.length === 0) return null;
  return (
    <section className="grid gap-6 border-b border-line pb-8 md:grid-cols-2">
      {parkingNotes.length > 0 ? (
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Parking</h2>
          <div className="mt-4 grid gap-3">
            {parkingNotes.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text-2">
                <MapPin className="mt-0.5 h-4 w-4 text-text-4" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {transitNotes.length > 0 ? (
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Transit</h2>
          <div className="mt-4 grid gap-3">
            {transitNotes.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text-2">
                <MapPin className="mt-0.5 h-4 w-4 text-text-4" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
