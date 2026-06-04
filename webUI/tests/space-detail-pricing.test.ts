import { describe, expect, it } from "vitest";

import { computeReservationBreakdown } from "@/components/space-detail/pricing";

const base = {
  allDay: false,
  dailyAmount: null,
  hourlyAmount: null,
  dayOpenSpan: null,
  bookingQuantity: 1,
  hours: 0,
  volumeDiscounts: [],
};

describe("computeReservationBreakdown", () => {
  it("returns null when there is no rate or no hours", () => {
    expect(computeReservationBreakdown(base)).toBeNull();
    expect(computeReservationBreakdown({ ...base, hourlyAmount: 40, hours: 0 })).toBeNull();
  });

  it("uses a flat day rate for all-day with quantity", () => {
    const result = computeReservationBreakdown({ ...base, allDay: true, dailyAmount: 300, bookingQuantity: 3 });
    expect(result).toMatchObject({ base: 900, total: 900, basis: "daily", units: 3, discountAmount: 0 });
  });

  it("falls back to hourly × open span for all-day without a day rate", () => {
    const result = computeReservationBreakdown({ ...base, allDay: true, hourlyAmount: 40, dayOpenSpan: 9 });
    expect(result).toMatchObject({ base: 360, total: 360, basis: "hourly_day_span", units: 9 });
  });

  it("computes a plain hourly total", () => {
    const result = computeReservationBreakdown({ ...base, hourlyAmount: 40, hours: 2 });
    expect(result).toMatchObject({ base: 80, total: 80, basis: "hourly", units: 2, discountPercent: 0 });
  });

  it("caps an hourly total to the day rate when it exceeds it", () => {
    const result = computeReservationBreakdown({ ...base, hourlyAmount: 40, hours: 10, dailyAmount: 300 });
    expect(result).toMatchObject({ base: 300, total: 300, basis: "capped_to_daily", units: 1 });
  });

  it("applies the best eligible volume-discount tier", () => {
    const result = computeReservationBreakdown({
      ...base,
      hourlyAmount: 40,
      hours: 5,
      volumeDiscounts: [
        { min_hours: 4, discount_percent: 10 },
        { min_hours: 8, discount_percent: 25 }, // not eligible at 5h
        { min_hours: 2, discount_percent: 5 },
      ],
    });
    // base 200, best eligible tier = 10% -> discount 20, total 180
    expect(result).toMatchObject({ base: 200, discountPercent: 10, discountAmount: 20, total: 180, basis: "hourly" });
  });

  it("ignores out-of-range discount percentages", () => {
    const result = computeReservationBreakdown({
      ...base,
      hourlyAmount: 40,
      hours: 5,
      volumeDiscounts: [{ min_hours: 4, discount_percent: 100 }],
    });
    expect(result?.discountPercent).toBe(0);
    expect(result?.total).toBe(200);
  });
});
