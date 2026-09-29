import { addDays, dayOfWeek } from "./dates";

export type Unit = {
  /** Key of the unit in the grid response, e.g. "1772.1" */
  key: string;
  /** ReserveCalifornia UnitId; stable, so alerts store this. */
  unitId: string;
  label: string;
  type: string | null;
  /** Sorted ISO dates on which the unit can be booked. */
  available: string[];
};

export type Stay = { arrival: string; nights: number };

export type StayCriteria = {
  start: string;
  end: string;
  minNights: number;
  /** 0 = Sunday … 6 = Saturday; empty means any day. */
  arrivalDays: number[];
};

type Slice = {
  Date?: string;
  IsFree?: boolean;
  IsBlocked?: boolean;
  IsWalkin?: boolean;
  Lock?: unknown;
};

type GridUnit = {
  UnitId?: number | string;
  Name?: string;
  ShortName?: string;
  UnitTypeName?: string;
  Slices?: Record<string, Slice>;
};

export type GridResponse = {
  Facility?: { Units?: Record<string, GridUnit> | null } | null;
};

function sliceAvailable(s: Slice): boolean {
  return Boolean(s.IsFree) && !s.IsBlocked && !s.IsWalkin && !s.Lock;
}

/** Parse the /search/grid response into units with their available dates. */
export function parseGrid(grid: GridResponse | null | undefined): Unit[] {
  const units = grid?.Facility?.Units ?? {};
  return Object.entries(units).map(([key, u]) => {
    const available = Object.entries(u.Slices ?? {})
      .filter(([, s]) => sliceAvailable(s))
      .map(([k, s]) => String(s.Date ?? k).slice(0, 10))
      .sort();
    return {
      key,
      unitId: String(u.UnitId ?? key),
      label: u.Name || u.ShortName || key,
      type: u.UnitTypeName ?? null,
      available: [...new Set(available)],
    };
  });
}

/** Merge units from several grid windows of the same facility. */
export function mergeUnits(lists: Unit[][]): Unit[] {
  const byKey = new Map<string, Unit>();
  for (const list of lists) {
    for (const u of list) {
      const prev = byKey.get(u.key);
      if (!prev) byKey.set(u.key, { ...u, available: [...u.available] });
      else prev.available = [...new Set([...prev.available, ...u.available])].sort();
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/**
 * Find bookable stays: for each run of consecutive available nights within the
 * date range that is at least `minNights` long, return the earliest allowed
 * arrival and how many nights are open from there.
 */
export function findStays(available: string[], c: StayCriteria): Stay[] {
  const dates = [...new Set(available)].filter((d) => d >= c.start && d <= c.end).sort();
  const stays: Stay[] = [];
  let run: string[] = [];

  const flush = () => {
    if (run.length >= c.minNights) {
      let arrivals = run.slice(0, run.length - c.minNights + 1);
      if (c.arrivalDays.length) {
        arrivals = arrivals.filter((a) => c.arrivalDays.includes(dayOfWeek(a)));
      }
      if (arrivals.length) {
        const arrival = arrivals[0];
        stays.push({ arrival, nights: run.length - run.indexOf(arrival) });
      }
    }
    run = [];
  };

  for (const d of dates) {
    if (run.length && d !== addDays(run[run.length - 1], 1)) flush();
    run.push(d);
  }
  flush();
  return stays;
}
