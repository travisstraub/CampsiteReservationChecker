import "server-only";
import { mergeUnits, parseGrid, type GridResponse, type Unit } from "./availability";
import { toRcDate, windows } from "./dates";

// ReserveCalifornia's website is backed by this (unofficial, undocumented) API.
// RC_API_URL can point at a mock server for local development.
const API = process.env.RC_API_URL ?? "https://calirdr.usedirect.com/RDR/rdr";
const GRID_WINDOW_DAYS = 30;

const HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  Origin: "https://www.reservecalifornia.com",
  Referer: "https://www.reservecalifornia.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
};

export type Park = { placeId: string; name: string; description: string | null };
export type Campground = {
  facilityId: string;
  placeId: string;
  name: string;
  /** Sites free on the searched date, when the API reports it. */
  available: number | null;
};

export function bookingUrl(placeId: string | null, facilityId: string): string {
  return placeId
    ? `https://www.reservecalifornia.com/Web/#!park/${placeId}/${facilityId}`
    : "https://www.reservecalifornia.com/";
}

async function rc<T>(path: string, init?: { body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init?.body ? "POST" : "GET",
      headers: HEADERS,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    // Node reports every network failure as "fetch failed"; the reason is in `cause`.
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    const reason = cause?.code ?? cause?.message ?? (e as Error).message;
    console.error(`ReserveCalifornia ${path} request failed`, e);
    throw new Error(`ReserveCalifornia ${path} request failed: ${reason}`);
  }
  if (!res.ok) throw new Error(`ReserveCalifornia ${path} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

// The park and campground lists are a few MB and rarely change, so keep them in
// memory for the life of the serverless instance.
const TTL_MS = 12 * 60 * 60 * 1000;
const memo = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load().catch((e) => {
    memo.delete(key);
    throw e;
  });
  memo.set(key, { at: Date.now(), value });
  return value;
}

type RawPlace = { PlaceId: number | string; Name?: string; Description?: string; IsActive?: boolean };
type RawFacility = {
  FacilityId: number | string;
  PlaceId: number | string;
  Name?: string;
  IsActive?: boolean;
};

export function listParks(): Promise<Park[]> {
  return cached("parks", async () => {
    const raw = await rc<RawPlace[]>("/fd/places");
    return raw
      .filter((p) => p.IsActive !== false && p.Name)
      .map((p) => ({
        placeId: String(p.PlaceId),
        name: p.Name!.trim(),
        description: p.Description?.trim() || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

function listFacilities(): Promise<RawFacility[]> {
  return cached("facilities", () => rc<RawFacility[]>("/fd/facilities"));
}

export async function searchParks(query: string): Promise<Park[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const parks = await listParks();
  return parks.filter((p) => words.every((w) => p.name.toLowerCase().includes(w))).slice(0, 50);
}

export async function getPark(placeId: string): Promise<Park | null> {
  return (await listParks()).find((p) => p.placeId === placeId) ?? null;
}

/** Campgrounds in a park, with free-site counts for `date` when available. */
export async function listCampgrounds(placeId: string, date: string, nights: number): Promise<Campground[]> {
  try {
    type PlaceSearch = {
      SelectedPlace?: {
        Facilities?: Record<string, { FacilityId: number; Name: string; Available?: number }>;
      };
    };
    const res = await rc<PlaceSearch>("/search/place", {
      body: {
        PlaceId: placeId,
        StartDate: toRcDate(date),
        Nights: String(nights),
        CountNearby: false,
        IsADA: false,
        UnitCategoryId: 0,
        SleepingUnitId: 0,
        MinVehicleLength: 0,
        UnitTypesGroupIds: [],
      },
    });
    const facilities = Object.values(res.SelectedPlace?.Facilities ?? {});
    if (facilities.length) {
      return facilities
        .map((f) => ({
          facilityId: String(f.FacilityId),
          placeId,
          name: f.Name,
          available: typeof f.Available === "number" ? f.Available : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    // Fall back to the static list below.
  }
  const all = await listFacilities();
  return all
    .filter((f) => String(f.PlaceId) === placeId && f.IsActive !== false && f.Name)
    .map((f) => ({ facilityId: String(f.FacilityId), placeId, name: f.Name!, available: null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCampground(facilityId: string): Promise<{ name: string; placeId: string } | null> {
  const f = (await listFacilities()).find((x) => String(x.FacilityId) === facilityId);
  return f ? { name: f.Name ?? `Campground ${facilityId}`, placeId: String(f.PlaceId) } : null;
}

async function fetchGrid(facilityId: string, start: string, end: string): Promise<GridResponse> {
  return rc<GridResponse>("/search/grid", {
    body: {
      FacilityId: facilityId,
      StartDate: toRcDate(start),
      EndDate: toRcDate(end),
      IsADA: false,
      MinVehicleLength: 0,
      UnitCategoryId: 0,
      UnitTypesGroupIds: [],
      SleepingUnitId: 0,
      InSeasonOnly: false,
      WebOnly: true,
      UnitSort: "orderby",
    },
  });
}

/** Site-by-site availability for a campground over [start, end]. */
export async function getAvailability(facilityId: string, start: string, end: string): Promise<Unit[]> {
  const lists: Unit[][] = [];
  for (const [s, e] of windows(start, end, GRID_WINDOW_DAYS)) {
    lists.push(parseGrid(await fetchGrid(facilityId, s, e)));
  }
  return mergeUnits(lists);
}
