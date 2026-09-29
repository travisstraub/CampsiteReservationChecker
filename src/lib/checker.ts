import "server-only";
import { findStays, type Stay, type Unit } from "./availability";
import { formatShort, todayInCalifornia } from "./dates";
import { sendToUser } from "./push";
import { bookingUrl, getAvailability } from "./reservecalifornia";
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

export type Opening = Stay & { unitId: string; siteLabel: string };

export type CheckSummary = {
  alerts: number;
  facilities: number;
  notified: number;
  errors: string[];
};

/** Openings an alert matches, given the campground's current availability. */
export function openingsForAlert(alert: AlertRow, units: Unit[], today: string): Opening[] {
  const start = alert.start_date > today ? alert.start_date : today;
  const openings: Opening[] = [];
  for (const unit of units) {
    if (alert.unit_ids.length && !alert.unit_ids.includes(unit.unitId)) continue;
    const stays = findStays(unit.available, {
      start,
      end: alert.end_date,
      minNights: alert.min_nights,
      arrivalDays: alert.arrival_days,
    });
    for (const s of stays) openings.push({ ...s, unitId: unit.unitId, siteLabel: unit.label });
  }
  return openings.sort((a, b) => a.arrival.localeCompare(b.arrival) || a.siteLabel.localeCompare(b.siteLabel));
}

export function formatNotification(facilityName: string, openings: Opening[]): string {
  const lines = openings
    .slice(0, 4)
    .map((o) => `${o.siteLabel}: ${formatShort(o.arrival)} (${o.nights} night${o.nights === 1 ? "" : "s"})`);
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
    .select("unit_id, arrival")
    .eq("alert_id", alert.id);
  if (error) throw error;

  const key = (unitId: string, arrival: string) => `${unitId}|${arrival}`;
  const seenKeys = new Set(seen.map((s) => key(s.unit_id, s.arrival)));
  const currentKeys = new Set(openings.map((o) => key(o.unitId, o.arrival)));

  // Forget openings that are gone, so they alert again if they come back.
  const gone = seen.filter((s) => !currentKeys.has(key(s.unit_id, s.arrival)));
  for (const g of gone) {
    await db.from("alert_openings").delete().match({ alert_id: alert.id, unit_id: g.unit_id, arrival: g.arrival });
  }

  const fresh = openings.filter((o) => !seenKeys.has(key(o.unitId, o.arrival)));
  if (!fresh.length) return 0;

  const delivered = await sendToUser(alert.user_id, {
    title: `Campsite open: ${alert.facility_name}`,
    body: formatNotification(alert.facility_name, fresh),
    url: bookingUrl(alert.place_id, alert.facility_id),
    tag: `alert-${alert.id}`,
  });
  // Only mark as notified if it actually reached a device, so users who
  // haven't enabled notifications yet still get told later.
  if (delivered === 0) return 0;

  const { error: insertError } = await db.from("alert_openings").upsert(
    fresh.map((o) => ({
      alert_id: alert.id,
      unit_id: o.unitId,
      arrival: o.arrival,
      site_label: o.siteLabel,
      nights: o.nights,
    })),
  );
  if (insertError) throw insertError;
  return 1;
}
