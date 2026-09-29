import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import { ArrowUpRight, CalendarIcon, LockIcon } from "@/components/Icons";
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

const TIPS = [
  "Stay signed in to ReserveCalifornia in the browser you book from.",
  "Save your contact, payment and vehicle details in your ReserveCalifornia account ahead of time.",
  "Keep notifications on, and allow them through any Focus modes.",
  "When an alert arrives, book right away. Openings rarely last long.",
];

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
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <BackLink href="/alerts">Alerts</BackLink>
        <h1 className="title-lg mt-3">{alert.facility_name}</h1>
        <p className="mt-1 text-[17px] text-muted">{alert.place_name}</p>
      </div>

      {openings.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="title-md">Nothing open right now</p>
          <p className="mx-auto mt-1 max-w-sm text-[15px] text-muted">
            It may have just been booked. We&apos;ll keep checking and notify you when something opens.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {openings.map((o) => {
            const unlockPassed = o.kind === "unlock" && o.unlock_at !== null && o.unlock_at <= now;
            return (
              <li key={`${o.unit_id}-${o.arrival}-${o.kind}`} className="card space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">{o.kind === "open" ? "Available now" : "Unlocking soon"}</p>
                    <p className="title-md mt-0.5">{o.site_label}</p>
                  </div>
                  {o.kind === "open" ? (
                    <StillOpen facilityId={alert.facility_id} unitId={o.unit_id} arrival={o.arrival} nights={o.nights} />
                  ) : (
                    <span className="badge badge-lock">
                      <LockIcon size={12} strokeWidth={2.4} />
                      {unlockPassed ? "Unlocked" : formatLocalTime(o.unlock_at!)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-fill px-4 py-3">
                  <CalendarIcon size={22} className="shrink-0 text-muted" />
                  <div>
                    <p className="font-semibold">Arrive {formatShort(o.arrival)}</p>
                    <p className="text-[15px] text-muted">
                      {o.nights} night{o.nights === 1 ? "" : "s"} open{o.nights > 1 ? " in a row" : ""}
                    </p>
                  </div>
                </div>

                {o.kind === "unlock" && !unlockPassed && (
                  <p className="text-[15px] text-muted">
                    This site was just released. ReserveCalifornia holds it until{" "}
                    <span className="text-fg">{formatLocalTime(o.unlock_at!)}</span>, so be on the booking page a few minutes early.
                  </p>
                )}

                <div>
                  <a className="btn btn-lg w-full" href={book} target="_blank" rel="noreferrer">
                    Book on ReserveCalifornia <ArrowUpRight size={18} strokeWidth={2.2} />
                  </a>
                  <p className="mt-2.5 text-center text-[13px] text-muted">
                    Choose arrival {formatShort(o.arrival)}, then {o.site_label}.
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section>
        <h2 className="group-header">Book faster</h2>
        <ol className="group-list">
          {TIPS.map((tip, i) => (
            <li key={tip} className="row items-start py-3.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
                {i + 1}
              </span>
              <span className="text-[15px] leading-snug">{tip}</span>
            </li>
          ))}
        </ol>
        <p className="group-footer">
          {alert.last_checked_at
            ? `Last checked ${new Date(alert.last_checked_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })}.`
            : "Not checked yet."}
        </p>
      </section>
    </div>
  );
}
