import { addDays, dateRange, dayOfWeek, nowInCalifornia } from "./dates";

export type Unit = {
  /** Key of the unit in the grid response, e.g. "1772.1" */
  key: string;
  /** ReserveCalifornia UnitId; stable, so alerts store this. */
  unitId: string;
  label: string;
  type: string | null;
  /** Sorted ISO dates on which the unit can be booked. */
  available: string[];
  /**
   * Nights that are temporarily locked (e.g. just cancelled) but not booked,
   * mapped to when the lock ends, in California time ("YYYY-MM-DDTHH:MM:SS").
   */
  locked: Record<string, string>;
};

export type Stay = { arrival: string; nights: number };
export type UpcomingStay = Stay & { unlockAt: string };

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
  ReservationId?: number | null;
  /** When set, the night is locked until this California-local timestamp. */
  Lock?: unknown;
};

type GridUnit = {
  UnitId?: number | string;
  Name?: string;
  ShortName?: string;
  UnitTypeName?: string;
  AllowWebBooking?: boolean;
  IsWebViewable?: boolean;
  Slices?: Record<string, Slice>;
};

export type GridResponse = {
  Facility?: { Units?: Record<string, GridUnit> | null } | null;
};

/** The lock's end time as "YYYY-MM-DDTHH:MM:SS", or null if it isn't a timestamp. */
function lockUntil(lock: unknown): string | null {
  if (typeof lock !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(lock)) return null;
  return lock.length >= 19 ? lock.slice(0, 19) : `${lock.slice(0, 16)}:00`;
}

/**
 * Parse the /search/grid response into units with their available and locked
 * nights. `now` is the current California-local time; locks that have already
 * expired are ignored.
 */
export function parseGrid(grid: GridResponse | null | undefined, now: string = nowInCalifornia()): Unit[] {
  const units = grid?.Facility?.Units ?? {};
  // Skip sites that can't be booked online (e.g. first-come, first-served).
  const bookable = Object.entries(units).filter(
    ([, u]) => u.AllowWebBooking !== false && u.IsWebViewable !== false,
  );
  return bookable.map(([key, u]) => {
    const available: string[] = [];
    const locked: Record<string, string> = {};
    for (const [k, slice] of Object.entries(u.Slices ?? {})) {
      const date = String(slice.Date ?? k).slice(0, 10);
      if (slice.IsBlocked || slice.IsWalkin) continue;
      const until = lockUntil(slice.Lock);
      // An unrecognised lock value is treated as locked, with no known end.
      const isLocked = until ? until > now : Boolean(slice.Lock);
      if (isLocked) {
        if (until && !slice.ReservationId) locked[date] = until;
      } else if (slice.IsFree) {
        available.push(date);
      }
    }
    return {
      key,
      unitId: String(u.UnitId ?? key),
      label: u.Name || u.ShortName || key,
      type: u.UnitTypeName ?? null,
      available: [...new Set(available)].sort(),
      locked,
    };
  });
}

/** Merge units from several grid windows of the same facility. */
export function mergeUnits(lists: Unit[][]): Unit[] {
  const byKey = new Map<string, Unit>();
  for (const list of lists) {
    for (const u of list) {
      const prev = byKey.get(u.key);
      if (!prev) byKey.set(u.key, { ...u, available: [...u.available], locked: { ...u.locked } });
      else {
        prev.available = [...new Set([...prev.available, ...u.available])].sort();
        Object.assign(prev.locked, u.locked);
      }
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

/**
 * Stays that would qualify once locked nights unlock: stays over the unit's
 * available and locked nights where at least one of the first `minNights`
 * nights is still locked. `unlockAt` is when the last of those locks ends.
 */
export function findUpcomingStays(unit: Unit, c: StayCriteria): UpcomingStay[] {
  const lockedDates = Object.keys(unit.locked);
  if (!lockedDates.length) return [];
  const open = new Set(unit.available);
  return findStays([...unit.available, ...lockedDates], c).flatMap((stay) => {
    const needed = dateRange(stay.arrival, addDays(stay.arrival, c.minNights - 1));
    const locks = needed.filter((d) => !open.has(d)).map((d) => unit.locked[d]);
    return locks.length ? [{ ...stay, unlockAt: locks.sort().at(-1)! }] : [];
  });
}
