import type { Metadata } from "next";
import Link from "next/link";
import { formatLocalTime, formatShort, WEEKDAYS } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { deleteAlert, setAlertActive } from "./actions";

export const metadata: Metadata = { title: "Alerts" };

type AlertRow = {
  id: string;
  place_id: string;
  place_name: string;
  facility_id: string;
  facility_name: string;
  site_labels: string[];
  start_date: string;
  end_date: string;
  min_nights: number;
  arrival_days: number[];
  active: boolean;
  last_checked_at: string | null;
  last_error: string | null;
  alert_openings: { site_label: string; arrival: string; nights: number; kind: "open" | "unlock"; unlock_at: string | null }[];
};

export default async function AlertsPage({ searchParams }: PageProps<"/alerts">) {
  const { created } = await searchParams;
  const supabase = await createClient();
  const [{ data: alerts, error }, { count: devices }] = await Promise.all([
    supabase
      .from("alerts")
      .select("*, alert_openings(site_label, arrival, nights, kind, unlock_at)")
      .order("created_at", { ascending: false })
      .returns<AlertRow[]>(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Your alerts</h1>
        <Link href="/" className="btn">New alert</Link>
      </div>

      {created && <p className="card border-accent text-accent">Alert created. We&apos;ll check for openings every few minutes.</p>}

      {!devices && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-accent">
          <p>Notifications aren&apos;t turned on for any of your devices yet, so you won&apos;t be alerted.</p>
          <Link href="/settings" className="btn">Turn on notifications</Link>
        </div>
      )}

      {error && <p className="text-danger">{error.message}</p>}

      {alerts?.length === 0 && (
        <p className="text-muted">No alerts yet. Search for a campground and create one from its availability page.</p>
      )}

      <ul className="space-y-3">
        {alerts?.map((a) => (
          <li key={a.id} className={`card space-y-2 ${a.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/campgrounds/${a.facility_id}?start=${a.start_date}`} className="font-semibold hover:text-accent">
                  {a.facility_name}
                </Link>
                <div className="text-sm text-muted">{a.place_name}</div>
              </div>
              <div className="flex gap-2">
                <form action={setAlertActive.bind(null, a.id, !a.active)}>
                  <button className="btn-secondary px-3 py-1">{a.active ? "Pause" : "Resume"}</button>
                </form>
                <form action={deleteAlert.bind(null, a.id)}>
                  <button className="btn-secondary px-3 py-1 text-danger">Delete</button>
                </form>
              </div>
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-muted">Dates: </dt><dd className="inline">{formatShort(a.start_date)} – {formatShort(a.end_date)}</dd></div>
              <div><dt className="inline text-muted">Sites: </dt><dd className="inline">{a.site_labels.length ? a.site_labels.join(", ") : "Any"}</dd></div>
              <div><dt className="inline text-muted">Min nights: </dt><dd className="inline">{a.min_nights}</dd></div>
              <div><dt className="inline text-muted">Arrive on: </dt><dd className="inline">{a.arrival_days.length ? a.arrival_days.map((d) => WEEKDAYS[d]).join(", ") : "Any day"}</dd></div>
            </dl>
            {a.alert_openings.length > 0 && (
              <div className="rounded-lg bg-accent-soft p-3 text-sm">
                {(["open", "unlock"] as const).map((kind) => {
                  const list = a.alert_openings
                    .filter((o) => o.kind === kind)
                    .toSorted((x, y) => x.arrival.localeCompare(y.arrival));
                  if (!list.length) return null;
                  return (
                    <div key={kind} className="mb-2">
                      <p className={`font-medium ${kind === "open" ? "text-accent" : "text-lock"}`}>
                        {kind === "open" ? "Open now:" : "Unlocking soon:"}
                      </p>
                      <ul className="mt-1">
                        {list.map((o) => (
                          <li key={`${o.site_label}-${o.arrival}`}>
                            {o.site_label}: {formatShort(o.arrival)} ({o.nights} night{o.nights === 1 ? "" : "s"})
                            {o.unlock_at && `, unlocks ${formatLocalTime(o.unlock_at)}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                <Link className="btn mt-1" href={`/alerts/${a.id}`}>
                  Book it →
                </Link>
              </div>
            )}
            <p className="text-xs text-muted">
              {a.last_error
                ? <span className="text-danger">Last check failed: {a.last_error}</span>
                : a.last_checked_at
                  ? `Last checked ${new Date(a.last_checked_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })}`
                  : "Not checked yet"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
