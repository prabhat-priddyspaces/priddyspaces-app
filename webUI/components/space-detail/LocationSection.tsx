import { ArrowUpRight, Mail, Phone } from "lucide-react";

import { PublicLocationMiniMap } from "@/components/public-location-mini-map";
import { PublicWorkingHours } from "@/components/public-working-hours";
import { buildDirectionsHref } from "@/components/space-detail/helpers";
import type { MarketplaceSpaceDetailLocation } from "@/lib/public-marketplace";

export interface LocationSectionProps {
  location: MarketplaceSpaceDetailLocation;
  locationAddress: string;
}

export function LocationSection({ location, locationAddress }: LocationSectionProps) {
  return (
    <section className="grid gap-8 border-b border-line pb-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="space-y-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-3">Located At</div>
          <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text">{location.name}</div>
          <p className="mt-2 text-sm leading-6 text-text-2">{locationAddress}</p>
          <a
            href={buildDirectionsHref(locationAddress, location.lat, location.lng)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
          >
            Get directions
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <PublicLocationMiniMap lat={location.lat} lng={location.lng} name={location.name} />
      </div>

      <div className="grid gap-5">
        <PublicWorkingHours
          enabled={location.public_working_hours_enabled}
          hours={location.public_working_hours}
          legacyWeekdays={location.public_hours_weekdays}
          legacyWeekends={location.public_hours_weekends}
        />

        {location.public_phone || location.public_email ? (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="text-sm font-semibold text-text">Questions About This Listing?</div>
            <div className="mt-4 space-y-3 text-sm text-text-2">
              {location.public_phone ? (
                <a href={`tel:${location.public_phone}`} className="flex items-center gap-3 hover:text-text">
                  <Phone className="h-4 w-4 text-text-4" />
                  {location.public_phone}
                </a>
              ) : null}
              {location.public_email ? (
                <a href={`mailto:${location.public_email}`} className="flex items-center gap-3 hover:text-text">
                  <Mail className="h-4 w-4 text-text-4" />
                  {location.public_email}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
