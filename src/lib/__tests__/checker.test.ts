import { describe, expect, it } from "vitest";
import type { Unit } from "../availability";
import { formatNotification, openingsForAlert } from "../checker";

const units: Unit[] = [
  { key: "a", unitId: "11", label: "Site 1", type: null, available: ["2030-06-01", "2030-06-02"] },
  { key: "b", unitId: "12", label: "Site 2", type: null, available: ["2030-06-03"] },
];

const alert = {
  id: "x",
  user_id: "u",
  place_id: "718",
  facility_id: "706",
  facility_name: "Wright's Beach",
  unit_ids: [] as string[],
  start_date: "2030-06-01",
  end_date: "2030-06-30",
  min_nights: 1,
  arrival_days: [] as number[],
};

describe("openingsForAlert", () => {
  it("matches any site when no sites are selected", () => {
    expect(openingsForAlert(alert, units, "2030-01-01").map((o) => o.siteLabel)).toEqual(["Site 1", "Site 2"]);
  });

  it("matches only selected unit IDs", () => {
    const o = openingsForAlert({ ...alert, unit_ids: ["12"] }, units, "2030-01-01");
    expect(o).toEqual([{ arrival: "2030-06-03", nights: 1, unitId: "12", siteLabel: "Site 2" }]);
  });

  it("ignores nights before today", () => {
    const o = openingsForAlert({ ...alert, unit_ids: ["11"] }, units, "2030-06-02");
    expect(o).toEqual([{ arrival: "2030-06-02", nights: 1, unitId: "11", siteLabel: "Site 1" }]);
  });
});

describe("formatNotification", () => {
  it("summarises openings", () => {
    const text = formatNotification("Wright's Beach", openingsForAlert(alert, units, "2030-01-01"));
    expect(text).toBe("Site 1: Sat, Jun 1 (2 nights)\nSite 2: Mon, Jun 3 (1 night)");
  });
});
