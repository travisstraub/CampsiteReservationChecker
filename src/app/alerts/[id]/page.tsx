import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StillOpen from "@/components/StillOpen";
import { formatLocalTime, formatShort, nowInCalifornia } from "@/lib/dates";
import { bookingUrl } from "@/lib/reservecalifornia";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Opening" };

type Opening = {
  unit_id: string;
  site_label: string;
  arrival: string;
  nights: number;
  kind: "open" | "unlock";
  unlock_at: string | null;
};

type AlertRow = {
  id: string;
  place_id: string;
  place_name: string;
  facility_id: string;
  facility_name: string;
  last_checked_at: string | null;
  alert_openings: Opening[];
};

// Where a notification lands: exactly what to book, whether it's still free,
// and a button straight to the campground on ReserveCalifornia.
export default async function AlertOpeningsPage({ params }: PageProps<"/alerts/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: alert } = await supabase
    .from("alerts")
    .select("id, place_id, place_name, facility_id, facility_name, last_checked_at, alert_openings(unit_id, site_label, arrival, nights, kind, unlock_at)")
    .eq("id", id)
    .maybeSingle<AlertRow>();
  if (!alert) notFound();

  const now = nowInCalifornia();
  const openings = alert.alert_openings.toSorted(
    (a, b) => a.kind.localeCompare(b.kind) || a.arrival.localeCompare(b.arrival) || a.site_label.localeCompare(b.site_label),
  );
  const book = bookingUrl(alert.place_id, alert.facility_id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/alerts" className="text-sm text-muted hover:text-accent">← All alerts</Link>
        <h1 className="mt-1 text-2xl font-semibold">{alert.facility_name}</h1>
        <p className="text-muted">{alert.place_name}</p>
      </div>

      {openings.length === 0 ? (
        <p className="card text-muted">
          Nothing matching this alert is open right now. It may have just been booked. We&apos;ll keep checking.
        </p>
      ) : (
        <ul className="space-y-3">
          {openings.map((o) => {
            const unlocked = o.kind === "unlock" && o.unlock_at !== null && o.unlock_at <= now;
            return (
              <li key={`${o.unit_id}-${o.arrival}-${o.kind}`} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{o.site_label}</p>
                    <p>
                      Arrive <b>{formatShort(o.arrival)}</b> · {o.nights} night{o.nights === 1 ? "" : "s"} open
                    </p>
                  </div>
                  {o.kind === "open" ? (
                    <StillOpen facilityId={alert.facility_id} unitId={o.unit_id} arrival={o.arrival} nights={o.nights} />
                  ) : (
                    <span className="rounded-full bg-lock-soft px-2.5 py-0.5 text-xs font-medium text-lock">
                      {unlocked ? "Unlock time passed" : `Unlocks ${formatLocalTime(o.unlock_at!)}`}
                    </span>
                  )}
                </div>
                {o.kind === "unlock" && (
                  <p className="text-sm text-muted">
                    This site was just released, and ReserveCalifornia holds it until the unlock time. Be ready on
                    the booking page a few minutes early.
                  </p>
                )}
                <a className="btn w-full py-3 text-base" href={book} target="_blank" rel="noreferrer">
                  Book on ReserveCalifornia ↗
                </a>
                <p className="text-xs text-muted">
                  On ReserveCalifornia, pick arrival <b>{formatShort(o.arrival)}</b>, the number of nights, then{" "}
                  <b>{o.site_label}</b>.
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <details className="card">
        <summary className="cursor-pointer font-medium">How to book faster</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>Stay signed in to ReserveCalifornia in the browser you&apos;ll book from, so you don&apos;t lose time logging in.</li>
          <li>Save your contact, payment and vehicle details in your ReserveCalifornia account ahead of time.</li>
          <li>Keep this app&apos;s notifications on, and turn off Focus modes that would silence them.</li>
          <li>Openings go fast. When a notification arrives, tap it and book right away; checking other dates first can cost you the site.</li>
        </ol>
      </details>

      <p className="text-xs text-muted">
        {alert.last_checked_at
          ? `Last checked ${new Date(alert.last_checked_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })}`
          : "Not checked yet"}
      </p>
    </div>
  );
}
