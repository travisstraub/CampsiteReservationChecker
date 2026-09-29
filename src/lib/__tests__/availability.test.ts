import { describe, expect, it } from "vitest";
import { findStays, findUpcomingStays, mergeUnits, parseGrid, type GridResponse, type Unit } from "../availability";
import { addDays, dateRange, dayOfWeek, formatLocalTime, nowInCalifornia, todayInCalifornia, toRcDate, windows } from "../dates";

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
    expect(nowInCalifornia(new Date("2026-07-01T05:07:09Z"))).toBe("2026-06-30T22:07:09");
    expect(nowInCalifornia(new Date("2026-01-15T08:00:00Z"))).toBe("2026-01-15T00:00:00");
  });

  it("formats local times", () => {
    expect(formatLocalTime("2030-06-02T08:00:00")).toBe("8:00 AM Sun, Jun 2");
    expect(formatLocalTime("2030-06-02T00:30:00")).toBe("12:30 AM Sun, Jun 2");
    expect(formatLocalTime("2030-06-02T13:05:00")).toBe("1:05 PM Sun, Jun 2");
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
    expect(parseGrid(grid, "2030-06-01T00:00:00")).toEqual([
      { key: "1772.1", unitId: "1772", label: "Site 012", type: null, available: ["2030-06-01"], locked: {} },
    ]);
  });

  it("tracks active locks and ignores expired ones", () => {
    const grid: GridResponse = {
      Facility: {
        Units: {
          a: {
            UnitId: 1,
            Name: "Site 1",
            Slices: {
              // Cancelled, locked until tomorrow 8am
              ...slice("2030-06-10", { IsFree: false, Lock: "2030-06-02T08:00:00" }),
              // Lock already expired: bookable
              ...slice("2030-06-11", { Lock: "2030-05-31T08:00:00" }),
              // Locked but already reserved: not coming back
              ...slice("2030-06-12", { IsFree: false, ReservationId: 99, Lock: "2030-06-02T08:00:00" }),
              // Unknown lock format: treated as locked, no unlock time
              ...slice("2030-06-13", { Lock: { id: 1 } }),
            },
          },
        },
      },
    };
    const [u] = parseGrid(grid, "2030-06-01T12:00:00");
    expect(u.available).toEqual(["2030-06-11"]);
    expect(u.locked).toEqual({ "2030-06-10": "2030-06-02T08:00:00" });
  });

  it("skips sites that can't be booked online", () => {
    const units = parseGrid({
      Facility: {
        Units: {
          a: { UnitId: 1, Name: "Site 1", AllowWebBooking: false, Slices: slice("2030-06-01") },
          b: { UnitId: 2, Name: "Site 2", IsWebViewable: false, Slices: slice("2030-06-01") },
          c: { UnitId: 3, Name: "Site 3", AllowWebBooking: true, Slices: slice("2030-06-01") },
        },
      },
    });
    expect(units.map((u) => u.label)).toEqual(["Site 3"]);
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
    expect(merged[1].locked).toEqual({});
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

describe("findUpcomingStays", () => {
  const base = { start: "2030-06-01", end: "2030-06-30", minNights: 2, arrivalDays: [] as number[] };
  const unit = (available: string[], locked: Record<string, string>): Unit => ({
    key: "a", unitId: "1", label: "Site 1", type: null, available, locked,
  });

  it("finds stays that complete once a lock ends", () => {
    const u = unit(["2030-06-10"], { "2030-06-11": "2030-06-05T08:00:00" });
    expect(findUpcomingStays(u, base)).toEqual([{ arrival: "2030-06-10", nights: 2, unlockAt: "2030-06-05T08:00:00" }]);
  });

  it("uses the latest unlock time among the needed nights", () => {
    const u = unit([], { "2030-06-10": "2030-06-05T08:00:00", "2030-06-11": "2030-06-06T08:00:00" });
    expect(findUpcomingStays(u, base)[0].unlockAt).toBe("2030-06-06T08:00:00");
  });

  it("ignores stays that are fully open or too short", () => {
    expect(findUpcomingStays(unit(["2030-06-10", "2030-06-11"], {}), base)).toEqual([]);
    expect(findUpcomingStays(unit([], { "2030-06-10": "2030-06-05T08:00:00" }), base)).toEqual([]);
  });
});
