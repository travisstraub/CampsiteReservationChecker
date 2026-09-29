import { describe, expect, it } from "vitest";
import { findStays, mergeUnits, parseGrid, type GridResponse } from "../availability";
import { addDays, dateRange, dayOfWeek, todayInCalifornia, toRcDate, windows } from "../dates";

function slice(date: string, extra: Record<string, unknown> = {}) {
  return { [`${date}T00:00:00`]: { Date: date, IsFree: true, IsBlocked: false, IsWalkin: false, Lock: null, ...extra } };
}

describe("dates", () => {
  it("does calendar arithmetic across month and DST boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(dayOfWeek("2030-06-07")).toBe(5); // Friday
    expect(toRcDate("2026-10-05")).toBe("10-05-2026");
    expect(dateRange("2026-01-30", "2026-02-02")).toHaveLength(4);
  });

  it("splits ranges into windows", () => {
    expect(windows("2026-01-01", "2026-03-01", 30)).toEqual([
      ["2026-01-01", "2026-01-30"],
      ["2026-01-31", "2026-03-01"],
    ]);
    expect(windows("2026-01-01", "2026-01-01", 30)).toEqual([["2026-01-01", "2026-01-01"]]);
  });

  it("uses California time for today", () => {
    // 2026-07-01 05:00 UTC is still June 30 in California.
    expect(todayInCalifornia(new Date("2026-07-01T05:00:00Z"))).toBe("2026-06-30");
  });
});

describe("parseGrid", () => {
  it("only counts free, unblocked, non-walk-in, unlocked nights", () => {
    const grid: GridResponse = {
      Facility: {
        Units: {
          "1772.1": {
            UnitId: 1772,
            Name: "Site 012",
            Slices: {
              ...slice("2030-06-01"),
              ...slice("2030-06-02", { IsFree: false }),
              ...slice("2030-06-03", { IsWalkin: true }),
              ...slice("2030-06-04", { Lock: { id: 1 } }),
              ...slice("2030-06-05", { IsBlocked: true }),
            },
          },
        },
      },
    };
    expect(parseGrid(grid)).toEqual([
      { key: "1772.1", unitId: "1772", label: "Site 012", type: null, available: ["2030-06-01"] },
    ]);
  });

  it("tolerates empty responses", () => {
    expect(parseGrid(undefined)).toEqual([]);
    expect(parseGrid({ Facility: null })).toEqual([]);
  });

  it("merges windows and sorts sites naturally", () => {
    const a = parseGrid({ Facility: { Units: { x: { UnitId: 1, Name: "Site 10", Slices: slice("2030-06-01") } } } });
    const b = parseGrid({
      Facility: {
        Units: {
          x: { UnitId: 1, Name: "Site 10", Slices: slice("2030-07-01") },
          y: { UnitId: 2, Name: "Site 9", Slices: {} },
        },
      },
    });
    const merged = mergeUnits([a, b]);
    expect(merged.map((u) => u.label)).toEqual(["Site 9", "Site 10"]);
    expect(merged[1].available).toEqual(["2030-06-01", "2030-07-01"]);
  });
});

describe("findStays", () => {
  const base = { start: "2030-06-01", end: "2030-06-30", minNights: 1, arrivalDays: [] as number[] };

  it("respects minimum nights", () => {
    const dates = ["2030-06-01", "2030-06-02", "2030-06-05"];
    expect(findStays(dates, base)).toEqual([
      { arrival: "2030-06-01", nights: 2 },
      { arrival: "2030-06-05", nights: 1 },
    ]);
    expect(findStays(dates, { ...base, minNights: 2 })).toEqual([{ arrival: "2030-06-01", nights: 2 }]);
    expect(findStays(dates, { ...base, minNights: 3 })).toEqual([]);
  });

  it("clips to the date range", () => {
    expect(findStays(["2030-05-31", "2030-06-01"], base)).toEqual([{ arrival: "2030-06-01", nights: 1 }]);
  });

  it("filters by arrival day", () => {
    // June 5–8 2030 is Wed–Sat
    const dates = ["2030-06-05", "2030-06-06", "2030-06-07", "2030-06-08"];
    expect(findStays(dates, { ...base, minNights: 2, arrivalDays: [5] })).toEqual([
      { arrival: "2030-06-07", nights: 2 },
    ]);
    expect(findStays(dates, { ...base, minNights: 3, arrivalDays: [5] })).toEqual([]);
  });
});
