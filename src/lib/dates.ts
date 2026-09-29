// Dates are handled as ISO "YYYY-MM-DD" strings throughout. Arithmetic is done
// in UTC so it never shifts across DST boundaries.

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_RE.test(value) && !Number.isNaN(parse(value).getTime());
}

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return parse(iso).getUTCDay();
}

/** Today's date in California, where every ReserveCalifornia park is. */
export function todayInCalifornia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Current local time in California as "YYYY-MM-DDTHH:MM:SS" (no zone). */
export function nowInCalifornia(now: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/** "8:00 AM Tue, Oct 6" for a California-local "YYYY-MM-DDTHH:MM:SS". */
export function formatLocalTime(local: string): string {
  const [h, m] = local.slice(11, 16).split(":").map(Number);
  const time = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return `${time} ${formatShort(local.slice(0, 10))}`;
}

/** ReserveCalifornia's API wants MM-DD-YYYY. */
export function toRcDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}

export function formatShort(iso: string): string {
  return parse(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Split [start, end] into consecutive windows of at most `size` days. */
export function windows(start: string, end: string, size: number): [string, string][] {
  const out: [string, string][] = [];
  let s = start;
  while (s <= end) {
    const e = addDays(s, size - 1) < end ? addDays(s, size - 1) : end;
    out.push([s, e]);
    s = addDays(e, 1);
  }
  return out;
}
