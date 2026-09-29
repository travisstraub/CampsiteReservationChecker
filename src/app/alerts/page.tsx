import type { Metadata } from "next";
import Link from "next/link";
import { BellIcon, ChevronRight, LockIcon, PlusIcon, TentIcon } from "@/components/Icons";
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

function summary(a: AlertRow): string {
  const parts = [
    `${formatShort(a.start_date)} – ${formatShort(a.end_date)}`,
    a.site_labels.length ? a.site_labels.join(", ") : "Any site",
    `${a.min_nights}+ night${a.min_nights === 1 ? "" : "s"}`,
  ];
  if (a.arrival_days.length) parts.push(`Arrive ${a.arrival_days.map((d) => WEEKDAYS[d]).join(", ")}`);
  return parts.join(" · ");
}

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
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-end justify-between gap-4">
        <h1 className="title-lg">Alerts</h1>
        <Link href="/" className="btn-tinted btn-sm" aria-label="New alert">
          <PlusIcon size={16} strokeWidth={2.4} /> New
        </Link>
      </div>

      {created && (
        <p className="flex items-center gap-2 rounded-2xl bg-open-soft px-4 py-3 text-[15px] text-open-ink">
          Alert created. We&apos;ll check every few minutes.
        </p>
      )}

      {!devices && (
        <Link href="/settings" className="card row-hover flex items-center gap-4 transition-colors">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger-ink">
            <BellIcon size={22} />
          </span>
          <div className="flex-1">
            <p className="font-semibold">Turn on notifications</p>
            <p className="text-[15px] text-muted">None of your devices will be alerted until you do.</p>
          </div>
          <ChevronRight size={18} className="text-faint" />
        </Link>
      )}

      {error && <p className="text-danger-ink">{error.message}</p>}

      {alerts?.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-accent-soft text-accent">
            <TentIcon size={34} />
          </span>
          <h2 className="title-md mt-5">No alerts yet</h2>
          <p className="mt-1 max-w-sm text-muted">
            Find a campground, choose your dates, and we&apos;ll tell you when a site opens.
          </p>
          <Link href="/" className="btn mt-6">Find a campground</Link>
        </div>
      )}

      <ul className="space-y-4">
        {alerts?.map((a) => {
          const open = a.alert_openings.filter((o) => o.kind === "open");
          const unlocking = a.alert_openings.filter((o) => o.kind === "unlock");
          const nextUnlock = unlocking.map((o) => o.unlock_at).filter(Boolean).sort()[0];
          return (
            <li key={a.id} className={`card space-y-4 ${a.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/campgrounds/${a.facility_id}?start=${a.start_date}`} className="title-md block hover:text-accent">
                    {a.facility_name}
                  </Link>
                  <p className="text-[15px] text-muted">{a.place_name}</p>
                </div>
                {a.last_error ? (
                  <span className="badge badge-danger">Check failed</span>
                ) : a.active ? (
                  <span className="badge badge-open"><span className="h-1.5 w-1.5 rounded-full bg-open" /> Watching</span>
                ) : (
                  <span className="badge badge-muted">Paused</span>
                )}
              </div>

              <p className="text-[15px]">{summary(a)}</p>

              {(open.length > 0 || unlocking.length > 0) && (
                <Link href={`/alerts/${a.id}`} className="group-list flex flex-col shadow-none ring-1 ring-line">
                  {open.length > 0 && (
                    <span className="row row-hover">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-open" />
                      <span className="flex-1 font-medium">{open.length} open now</span>
                      <span className="text-[15px] font-medium text-accent">Book</span>
                      <ChevronRight size={18} className="text-faint" />
                    </span>
                  )}
                  {unlocking.length > 0 && (
                    <span className="row row-hover">
                      <LockIcon size={16} className="shrink-0 text-lock" />
                      <span className="flex-1 text-[15px]">
                        {unlocking.length} unlocking{nextUnlock ? ` · ${formatLocalTime(nextUnlock)}` : " soon"}
                      </span>
                      <ChevronRight size={18} className="text-faint" />
                    </span>
                  )}
                </Link>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <p className="text-[13px] text-muted">
                  {a.last_error
                    ? `Last check failed: ${a.last_error}`
                    : a.last_checked_at
                      ? `Checked ${new Date(a.last_checked_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })}`
                      : "Not checked yet"}
                </p>
                <div className="flex gap-1">
                  <form action={setAlertActive.bind(null, a.id, !a.active)}>
                    <button className="btn-gray btn-sm">{a.active ? "Pause" : "Resume"}</button>
                  </form>
                  <form action={deleteAlert.bind(null, a.id)}>
                    <button className="btn-sm inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium text-danger-ink hover:bg-danger-soft">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
