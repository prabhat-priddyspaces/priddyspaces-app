/**
 * Pure reservation price-breakdown math, extracted from public-space-detail-view.tsx
 * (F3b). Kept as a standalone pure function so the money-path calculation is unit
 * tested rather than buried in a component useMemo. Behaviour is unchanged.
 */

export interface VolumeDiscountTier {
  min_hours: number;
  discount_percent: number;
}

export type ReservationBasis = "daily" | "hourly_day_span" | "capped_to_daily" | "hourly";

export interface ReservationBreakdown {
  base: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  basis: ReservationBasis;
  units: number;
}

export interface ReservationBreakdownInput {
  allDay: boolean;
  dailyAmount: number | null;
  hourlyAmount: number | null;
  dayOpenSpan: number | null;
  bookingQuantity: number;
  hours: number;
  volumeDiscounts: VolumeDiscountTier[];
}

export function computeReservationBreakdown(
  input: ReservationBreakdownInput
): ReservationBreakdown | null {
  const { allDay, dailyAmount, hourlyAmount, dayOpenSpan, bookingQuantity, hours, volumeDiscounts } = input;

  if (allDay) {
    // Full-day: flat day rate, no volume discount.
    if (dailyAmount != null) {
      return {
        base: dailyAmount * bookingQuantity,
        discountPercent: 0,
        discountAmount: 0,
        total: dailyAmount * bookingQuantity,
        basis: "daily",
        units: bookingQuantity,
      };
    }
    if (hourlyAmount != null && dayOpenSpan != null) {
      const base = hourlyAmount * dayOpenSpan;
      return { base, discountPercent: 0, discountAmount: 0, total: base, basis: "hourly_day_span", units: dayOpenSpan };
    }
    return null;
  }

  if (hourlyAmount == null || hours <= 0) return null;
  const baseHourly = hourlyAmount * hours;

  // Auto-cap to daily.
  if (dailyAmount != null && baseHourly > dailyAmount) {
    return {
      base: dailyAmount,
      discountPercent: 0,
      discountAmount: 0,
      total: dailyAmount,
      basis: "capped_to_daily",
      units: 1,
    };
  }

  // Pick best applicable volume tier.
  const eligible = volumeDiscounts.filter(
    (t) => hours >= t.min_hours && t.discount_percent > 0 && t.discount_percent < 100
  );
  const best = eligible.reduce<{ percent: number } | null>((acc, t) => {
    if (!acc || t.discount_percent > acc.percent) return { percent: t.discount_percent };
    return acc;
  }, null);
  const discountPercent = best?.percent ?? 0;
  const discountAmount = Math.round(baseHourly * (discountPercent / 100));
  return {
    base: baseHourly,
    discountPercent,
    discountAmount,
    total: baseHourly - discountAmount,
    basis: "hourly",
    units: hours,
  };
}
