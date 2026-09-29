"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createAlert } from "@/app/alerts/actions";
import type { Unit } from "@/lib/availability";
import { addDays, dateRange, dayOfWeek, formatLocalTime, WEEKDAYS } from "@/lib/dates";

type Props = {
  facilityId: string;
  facilityName: string;
  placeId: string;
  placeName: string;
  today: string;
  initialStart: string;
  signedIn: boolean;
};

const SPANS = [7, 14, 30];

export default function AvailabilityExplorer(props: Props) {
  const { facilityId, today, initialStart, signedIn } = props;
  const [start, setStart] = useState(initialStart);
  const [span, setSpan] = useState(14);
  // Result of the last completed fetch, tagged with the URL it was for.
  const [result, setResult] = useState<{ url: string; units: Unit[] | null; error: string | null } | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const end = addDays(start, span - 1);
  const days = useMemo(() => dateRange(start, end), [start, end]);

  const url = `/api/availability?facilityId=${facilityId}&start=${start}&end=${end}`;
  const loading = result?.url !== url;
  const units = result?.units ?? null;
  const error = loading ? null : (result?.error ?? null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setResult({ url, units: body.units, error: null });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setResult({ url, units: null, error: e.message });
      });
    return () => controller.abort();
  }, [url]);

  const visible = (units ?? []).filter(
    (u) => !onlyOpen || u.available.some((d) => d >= start && d <= end),
  );

  const toggle = (unitId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });

  const selectedUnits = (units ?? []).filter((u) => selected.has(u.unitId));

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="start">From</label>
          <input
            id="start"
            className="input"
            type="date"
            min={today}
            value={start}
            onChange={(e) => e.target.value && setStart(e.target.value < today ? today : e.target.value)}
          />
        </div>
        <div>
          <span className="label">Show</span>
          <div className="flex gap-1">
            {SPANS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpan(s)}
                className={s === span ? "btn px-3" : "btn-secondary px-3"}
              >
                {s} days
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" className="btn-secondary px-3" disabled={start <= today}
            onClick={() => setStart(addDays(start, -span) < today ? today : addDays(start, -span))}>
            ← Earlier
          </button>
          <button type="button" className="btn-secondary px-3" onClick={() => setStart(addDays(start, span))}>
            Later →
          </button>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Only sites with openings
        </label>
      </div>

      {error ? (
        <p className="card text-danger">Couldn&apos;t load availability: {error}</p>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/70 text-sm text-muted">
              Loading…
            </div>
          )}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium">Site</th>
                {days.map((d) => {
                  const dow = dayOfWeek(d);
                  return (
                    <th key={d} className={`px-1 py-2 text-center text-xs font-normal ${dow === 5 || dow === 6 ? "text-fg" : "text-muted"}`}>
                      <div>{WEEKDAYS[dow][0]}</div>
                      <div className="font-medium">{Number(d.slice(8))}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => {
                const open = new Set(u.available);
                const isSelected = selected.has(u.unitId);
                return (
                  <tr key={u.key} className={`border-t border-line ${isSelected ? "bg-accent-soft" : ""}`}>
                    <th scope="row" className={`sticky left-0 z-10 px-3 py-1.5 text-left font-normal ${isSelected ? "bg-accent-soft" : "bg-surface"}`}>
                      <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                        <input type="checkbox" checked={isSelected} onChange={() => toggle(u.unitId)} />
                        <span>{u.label}</span>
                      </label>
                    </th>
                    {days.map((d) => (
                      <td key={d} className="px-0.5 py-1.5">
                        <div
                          title={`${u.label} ${d}: ${
                            open.has(d)
                              ? "available"
                              : u.locked[d]
                                ? `locked until ${formatLocalTime(u.locked[d])}`
                                : "not available"
                          }`}
                          className={`mx-auto h-6 w-6 rounded ${
                            open.has(d) ? "bg-open" : u.locked[d] ? "bg-lock/70" : "bg-line/60"
                          }`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={days.length + 1} className="px-3 py-6 text-center text-muted">
                    {units?.length ? "No sites have openings in these dates." : "No sites found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-open" /> Available</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-line" /> Booked or closed</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-lock/70" /> Just released, unlocks soon</span>
        <span>Tick sites to watch just those.</span>
      </p>

      <AlertForm {...props} start={start} selectedUnits={selectedUnits} signedIn={signedIn}
        onClear={() => setSelected(new Set())} />
    </div>
  );
}

function AlertForm({
  facilityId, facilityName, placeId, placeName, today, start, selectedUnits, signedIn, onClear,
}: Props & { start: string; selectedUnits: Unit[]; onClear: () => void }) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(addDays(start, 30));
  const [minNights, setMinNights] = useState(1);
  const [arrivalDays, setArrivalDays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p>Want a notification when a site opens up here?</p>
        <Link className="btn" href={`/login?next=/campgrounds/${facilityId}`}>Sign in to create an alert</Link>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createAlert({
        placeId,
        placeName,
        facilityId,
        facilityName,
        unitIds: selectedUnits.map((u) => u.unitId),
        siteLabels: selectedUnits.map((u) => u.label),
        startDate: from,
        endDate: to,
        minNights,
        arrivalDays,
      });
      if (result?.error) setError(result.error);
    });
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Notify me when a site opens</h2>
        <p className="text-sm text-muted">
          {selectedUnits.length ? (
            <>
              Watching {selectedUnits.map((u) => u.label).join(", ")}.{" "}
              <button type="button" className="text-accent underline" onClick={onClear}>Watch any site</button>
            </>
          ) : (
            "Watching any site in this campground. Tick sites in the grid to narrow it down."
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="alert-from">Earliest arrival</label>
          <input id="alert-from" className="input" type="date" min={today} value={from}
            onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="alert-to">Latest night</label>
          <input id="alert-to" className="input" type="date" min={from} value={to}
            onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="alert-nights">Minimum nights</label>
          <input id="alert-nights" className="input" type="number" min={1} max={14} value={minNights}
            onChange={(e) => setMinNights(Number(e.target.value) || 1)} />
        </div>
      </div>

      <div>
        <span className="label">Arrival days <span className="font-normal text-muted">(none selected = any day)</span></span>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((name, i) => {
            const on = arrivalDays.includes(i);
            return (
              <button key={name} type="button" aria-pressed={on}
                className={on ? "btn px-3" : "btn-secondary px-3"}
                onClick={() => setArrivalDays(on ? arrivalDays.filter((d) => d !== i) : [...arrivalDays, i].sort())}>
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <button type="button" className="btn" disabled={pending} onClick={submit}>
        {pending ? "Creating…" : "Create alert"}
      </button>
    </section>
  );
}
