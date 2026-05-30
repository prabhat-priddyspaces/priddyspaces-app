import {
  buildSlotOptions,
  findFirstSlotOnOrAfter,
  getOpenIntervalsForDay,
} from "../src/lib/spaceAvailability";

describe("mobile space availability utilities", () => {
  it("filters busy intervals and keeps starts aligned to the open window", () => {
    const intervals = getOpenIntervalsForDay(
      {
        date: "2026-05-29",
        fully_blocked: false,
        busy_intervals: [{ start: "09:00", end: "10:15" }],
      },
      { start: "09:00", end: "18:00" },
    );

    const starts = buildSlotOptions(intervals, 30, "09:00");
    expect(starts).not.toContain("10:15");
    expect(starts[0]).toBe("10:30");
  });

  it("finds the next aligned start after a non-aligned interval edge", () => {
    const slot = findFirstSlotOnOrAfter(
      [{ start: "11:15", end: "18:00" }],
      30,
      "11:15",
      "09:00",
    );

    expect(slot).toEqual({ start: "11:30", end: "12:00" });
  });
});
