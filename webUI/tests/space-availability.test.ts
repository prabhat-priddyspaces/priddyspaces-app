import { describe, expect, it } from "vitest";

import {
  buildSlotOptions,
  findFirstSlotOnOrAfter,
  getOpenIntervalsForDay,
} from "@/lib/space-availability";

describe("space availability utilities", () => {
  it("aligns slot starts to the open-window granularity base", () => {
    const intervals = getOpenIntervalsForDay(
      {
        date: "2026-05-29",
        fully_blocked: false,
        busy_intervals: [{ start: "10:00", end: "11:15" }],
      },
      { start: "09:00", end: "18:00" },
    );

    const starts = buildSlotOptions(intervals, 30, "09:00");

    expect(starts).not.toContain("11:15");
    expect(starts).toContain("11:30");
  });

  it("finds the first aligned slot after a buffered busy interval", () => {
    const slot = findFirstSlotOnOrAfter(
      [{ start: "11:15", end: "18:00" }],
      30,
      "11:15",
      "09:00",
    );

    expect(slot).toEqual({ start: "11:30", end: "12:00" });
  });
});
