import "server-only";
import { findStays, findUpcomingStays, type Stay, type Unit } from "./availability";
import { formatLocalTime, formatShort, todayInCalifornia } from "./dates";
import { sendToUser } from "./push";
import { getAvailability } from "./reservecalifornia";
import { createAdminClient } from "./supabase/admin";

type AlertRow = {
  id: string;
  user_id: string;
  place_id: string;
  facility_id: string;
  facility_name: string;
  unit_ids: string[];
  start_date: string;
  end_date: string;
  min_nights: number;
  arrival_days: number[];
};

export type OpeningKind = "open" | "unlock";

export type Opening = Stay & {
  kind: OpeningKind;
  unitId: string;
  siteLabel: string;
  /** For "unlock" openings: when the site becomes bookable, California time. */
  unlockAt: string | null;
};

export type CheckSummary = {
  alerts: number;
  facilities: number;
  notified: number;
  errors: string[];
};

/**
 * Openings an alert matches, given the campground's current availability:
 * stays bookable now, and stays that will be once locked nights unlock.
 */
export function openingsForAlert(alert: AlertRow, units: Unit[], today: string): Opening[] {
  const criteria = {
    start: alert.start_date > today ? alert.start_date : today,
    end: alert.end_date,
    minNights: alert.min_nights,
    arrivalDays: alert.arrival_days,
  };
  const openings: Opening[] = [];
  for (const unit of units) {
    if (alert.unit_ids.length && !alert.unit_ids.includes(unit.unitId)) continue;
    const site = { unitId: unit.unitId, siteLabel: unit.label };
    for (const s of findStays(unit.available, criteria)) {
      openings.push({ ...s, ...site, kind: "open", unlockAt: null });
    }
    for (const s of findUpcomingStays(unit, criteria)) {
      openings.push({ ...s, ...site, kind: "unlock" });
    }
  }
  return openings.sort((a, b) => a.arrival.localeCompare(b.arrival) || a.siteLabel.localeCompare(b.siteLabel));
}

export function formatNotification(openings: Opening[]): string {
  const lines = openings.slice(0, 4).map((o) => {
    const stay = `${o.siteLabel}: ${formatShort(o.arrival)} (${o.nights} night${o.nights === 1 ? "" : "s"})`;
    return o.unlockAt ? `${stay}, unlocks ${formatLocalTime(o.unlockAt)}` : stay;
  });
  if (openings.length > 4) lines.push(`+${openings.length - 4} more`);
  return lines.join("\n");
}

/** Check every active alert and push notifications for new openings. */
export async function runCheck(): Promise<CheckSummary> {
  const db = createAdminClient();
  const today = todayInCalifornia();
  const summary: CheckSummary = { alerts: 0, facilities: 0, notified: 0, errors: [] };

  // Alerts whose date range has fully passed are switched off.
  await db.from("alerts").update({ active: false }).eq("active", true).lt("end_date", today);

  const { data: alerts, error } = await db
    .from("alerts")
    .select("id, user_id, place_id, facility_id, facility_name, unit_ids, start_date, end_date, min_nights, arrival_days")
    .eq("active", true);
  if (error) throw error;
  summary.alerts = alerts.length;

  // One set of API calls per campground, covering every alert on it.
  const byFacility = new Map<string, AlertRow[]>();
  for (const a of alerts as AlertRow[]) {
    byFacility.set(a.facility_id, [...(byFacility.get(a.facility_id) ?? []), a]);
  }
  summary.facilities = byFacility.size;

  for (const [facilityId, group] of byFacility) {
    const start = group.map((a) => (a.start_date > today ? a.start_date : today)).sort()[0];
    const end = group.map((a) => a.end_date).sort().at(-1)!;
    const checkedAt = new Date().toISOString();

    let units: Unit[];
    try {
      units = await getAvailability(facilityId, start, end);
    } catch (e) {
      const message = (e as Error).message;
      summary.errors.push(`${facilityId}: ${message}`);
      await db
        .from("alerts")
        .update({ last_checked_at: checkedAt, last_error: message })
        .in("id", group.map((a) => a.id));
      continue;
    }

    for (const alert of group) {
      try {
        summary.notified += await processAlert(db, alert, openingsForAlert(alert, units, today));
        await db.from("alerts").update({ last_checked_at: checkedAt, last_error: null }).eq("id", alert.id);
      } catch (e) {
        summary.errors.push(`alert ${alert.id}: ${(e as Error).message}`);
      }
    }
  }
  return summary;
}

async function processAlert(
  db: ReturnType<typeof createAdminClient>,
  alert: AlertRow,
  openings: Opening[],
): Promise<number> {
  const { data: seen, error } = await db
    .from("alert_openings")
    .select("unit_id, arrival, kind")
    .eq("alert_id", alert.id);
  if (error) throw error;

  const key = (o: { unit_id: string; arrival: string; kind: string }) => `${o.unit_id}|${o.arrival}|${o.kind}`;
  const current = openings.map((o) => ({ ...o, unit_id: o.unitId }));
  const seenKeys = new Set(seen.map(key));
  const currentKeys = new Set(current.map(key));

  // Forget openings that are gone, so they alert again if they come back.
  for (const g of seen.filter((s) => !currentKeys.has(key(s)))) {
    await db.from("alert_openings").delete().match({ alert_id: alert.id, unit_id: g.unit_id, arrival: g.arrival, kind: g.kind });
  }

  const fresh = current.filter((o) => !seenKeys.has(key(o)));
  let notified = 0;
  for (const kind of ["open", "unlock"] as const) {
    const batch = fresh.filter((o) => o.kind === kind);
    if (!batch.length) continue;
    const delivered = await sendToUser(alert.user_id, {
      title: kind === "open" ? `Campsite open: ${alert.facility_name}` : `Unlocking soon: ${alert.facility_name}`,
      body: formatNotification(batch),
      url: `/alerts/${alert.id}`,
      tag: `alert-${alert.id}-${kind}`,
    });
    // Only mark as notified if it actually reached a device, so users who
    // haven't enabled notifications yet still get told later.
    if (delivered === 0) continue;

    const { error: insertError } = await db.from("alert_openings").upsert(
      batch.map((o) => ({
        alert_id: alert.id,
        unit_id: o.unitId,
        arrival: o.arrival,
        kind: o.kind,
        site_label: o.siteLabel,
        nights: o.nights,
        unlock_at: o.unlockAt,
      })),
    );
    if (insertError) throw insertError;
    notified++;
  }
  return notified;
}
