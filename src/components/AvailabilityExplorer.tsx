"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createAlert } from "@/app/alerts/actions";
import type { Unit } from "@/lib/availability";
import { addDays, dateRange, dayOfWeek, formatLocalTime, formatShort, WEEKDAYS } from "@/lib/dates";
import { BellIcon, CheckIcon, ChevronLeft, ChevronRight } from "./Icons";
import Spinner from "./Spinner";
import Stepper from "./Stepper";

type Props = {
  facilityId: string;
  facilityName: string;
  placeId: string;
  placeName: string;
  today: string;
  initialStart: string;
  signedIn: boolean;
};

const SPANS = [
  { days: 7, label: "Week" },
  { days: 14, label: "2 Weeks" },
  { days: 30, label: "Month" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function AvailabilityExplorer(props: Props) {
  const { facilityId, today, initialStart } = props;
  const [start, setStart] = useState(initialStart);
  const [span, setSpan] = useState(14);
  // Result of the last completed fetch, tagged with the URL it was for.
  const [result, setResult] = useState<{ url: string; units: Unit[] | null; error: string | null } | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLElement>(null);

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

  const hasOpening = (u: Unit) => u.available.some((d) => d >= start && d <= end);
  const visible = (units ?? []).filter((u) => !onlyOpen || hasOpening(u));
  const openCount = (units ?? []).filter(hasOpening).length;

  const toggle = (unitId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });

  const selectedUnits = (units ?? []).filter((u) => selected.has(u.unitId));
  const shift = (n: number) => {
    const next = addDays(start, n);
    setStart(next < today ? today : next);
  };

  return (
    <div className="space-y-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-icon" onClick={() => shift(-span)} disabled={start <= today} aria-label="Earlier dates">
            <ChevronLeft size={18} strokeWidth={2.2} />
          </button>
          <input
            aria-label="First date shown"
            className="input h-9 w-auto rounded-full px-3.5 text-[15px]"
            type="date"
            min={today}
            value={start}
            onChange={(e) => e.target.value && setStart(e.target.value < today ? today : e.target.value)}
          />
          <button type="button" className="btn-icon" onClick={() => shift(span)} aria-label="Later dates">
            <ChevronRight size={18} strokeWidth={2.2} />
          </button>
        </div>
        <div className="segmented flex w-full md:w-auto" role="group" aria-label="Range">
          {SPANS.map((s) => (
            <button key={s.days} type="button" className="flex-1" aria-pressed={s.days === span} onClick={() => setSpan(s.days)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-4 px-1">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">
              {formatShort(start)} – {formatShort(end)}
            </h2>
            <p className="h-[18px] text-[13px] text-muted">
              {!loading && units
                ? openCount
                  ? `${openCount} of ${units.length} sites have openings`
                  : "No openings in these dates"
                : ""}
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2.5 text-[15px]">
            Open only
            <Switch checked={onlyOpen} onChange={setOnlyOpen} label="Show only sites with openings" />
          </label>
        </div>
        {error ? (
          <div className="card py-10 text-center">
            <p className="font-medium">Couldn&apos;t load availability</p>
            <p className="mt-1 text-[15px] text-muted">ReserveCalifornia didn&apos;t respond. Try again in a moment.</p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[22px] bg-surface shadow-[var(--shadow)]">
            {loading && (
              <div className="absolute inset-0 z-20 flex min-h-40 items-center justify-center bg-surface/60 backdrop-blur-[2px]">
                <Spinner size={26} />
              </div>
            )}
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface py-3 pr-2 pl-4 text-left align-bottom text-[13px] font-medium text-muted">
                      Site
                    </th>
                    {days.map((d, i) => {
                      const dow = dayOfWeek(d);
                      const weekend = dow === 5 || dow === 6;
                      const day = Number(d.slice(8));
                      const showMonth = i === 0 || day === 1;
                      return (
                        <th key={d} className={`px-[3px] pt-2 pb-2 text-center font-normal ${weekend ? "bg-fill/50" : ""}`}>
                          <div className="h-3.5 text-[10px] font-semibold tracking-wide text-accent uppercase">
                            {showMonth ? MONTHS[Number(d.slice(5, 7)) - 1] : ""}
                          </div>
                          <div className="text-[11px] text-muted">{WEEKDAYS[dow][0]}</div>
                          <div className={`text-[13px] tabular-nums ${d === today ? "font-bold text-accent" : "font-medium"}`}>{day}</div>
                        </th>
                      );
                    })}
                    <th className="w-3" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((u) => {
                    const open = new Set(u.available);
                    const isSelected = selected.has(u.unitId);
                    return (
                      <tr key={u.key} className={isSelected ? "bg-accent-soft" : ""}>
                        <th
                          scope="row"
                          className={`sticky left-0 z-10 border-t border-line py-1 pr-2 pl-3 text-left font-normal ${
                            isSelected ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]" : "bg-surface"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggle(u.unitId)}
                            aria-pressed={isSelected}
                            className="flex min-h-9 items-center gap-2.5 rounded-lg pr-1 text-left"
                          >
                            <span
                              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition ${
                                isSelected ? "bg-accent text-white" : "ring-[1.5px] ring-faint ring-inset"
                              }`}
                            >
                              {isSelected && <CheckIcon size={14} strokeWidth={3} />}
                            </span>
                            <span className="max-w-[8.5rem] truncate text-[14px] md:max-w-[14rem]" title={u.label}>
                              {u.label}
                            </span>
                          </button>
                        </th>
                        {days.map((d) => {
                          const dow = dayOfWeek(d);
                          const weekend = dow === 5 || dow === 6;
                          const state = open.has(d) ? "open" : u.locked[d] ? "lock" : "none";
                          return (
                            <td key={d} className={`border-t border-line px-[3px] py-1 ${weekend && !isSelected ? "bg-fill/50" : ""}`}>
                              <div
                                title={`${u.label}, ${formatShort(d)}: ${
                                  state === "open"
                                    ? "available"
                                    : state === "lock"
                                      ? `unlocks ${formatLocalTime(u.locked[d])}`
                                      : "not available"
                                }`}
                                className={`mx-auto h-7 w-7 rounded-[8px] ${
                                  state === "open" ? "bg-open" : state === "lock" ? "bg-lock" : "bg-cell"
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td className="border-t border-line" aria-hidden />
                      </tr>
                    );
                  })}
                  {!loading && visible.length === 0 && (
                    <tr>
                      <td colSpan={days.length + 2} className="border-t border-line px-4 py-10 text-center text-muted">
                        {units?.length ? "No sites have openings in these dates." : "No sites found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-[13px] text-muted">
          <Legend className="bg-open">Available</Legend>
          <Legend className="bg-lock">Unlocks soon</Legend>
          <Legend className="bg-cell">Booked</Legend>
          <span className="w-full md:ml-auto md:w-auto">Select sites to watch only those.</span>
        </div>
      </section>

      <AlertForm
        ref={formRef}
        {...props}
        start={start}
        selectedUnits={selectedUnits}
        onClear={() => setSelected(new Set())}
      />

      {/* Floating selection bar */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-30 flex justify-center px-5 transition-all duration-300 md:bottom-8 ${
          selectedUnits.length ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
        aria-hidden={!selectedUnits.length}
      >
        <div className={`glass flex items-center gap-3 rounded-full py-2 pr-2 pl-5 shadow-[0_8px_32px_rgba(0,0,0,0.16)] ring-1 ring-line ${selectedUnits.length ? "pointer-events-auto" : ""}`}>
          <span className="text-[15px] font-medium whitespace-nowrap">
            {selectedUnits.length} site{selectedUnits.length === 1 ? "" : "s"}
          </span>
          <button type="button" className="text-[15px] text-accent" onClick={() => setSelected(new Set())} tabIndex={selectedUnits.length ? 0 : -1}>
            Clear
          </button>
          <button
            type="button"
            className="btn h-9 px-4"
            tabIndex={selectedUnits.length ? 0 : -1}
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <BellIcon size={16} strokeWidth={2.2} /> Set alert
          </button>
        </div>
      </div>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-[4px] ${className}`} />
      {children}
    </span>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-open" : "bg-fill-strong"}`}
    >
      <span
        className={`absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-200 ${
          checked ? "translate-x-[20px]" : ""
        }`}
      />
    </button>
  );
}

function AlertForm({
  ref, facilityId, facilityName, placeId, placeName, today, start, selectedUnits, signedIn, onClear,
}: Props & { ref: React.Ref<HTMLElement>; start: string; selectedUnits: Unit[]; onClear: () => void }) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(addDays(start, 30));
  const [minNights, setMinNights] = useState(1);
  const [arrivalDays, setArrivalDays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <section ref={ref} className="card flex scroll-mt-24 flex-col items-center gap-4 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <BellIcon size={26} />
        </span>
        <div>
          <h2 className="title-md">Get notified when a site opens</h2>
          <p className="mt-1 text-[15px] text-muted">Sign in to watch this campground. It only takes a minute.</p>
        </div>
        <Link className="btn" href={`/login?next=/campgrounds/${facilityId}`}>Sign in to create an alert</Link>
      </section>
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
    <section ref={ref} className="card scroll-mt-24 space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <BellIcon size={22} />
        </span>
        <div>
          <h2 className="title-md">Get notified</h2>
          <p className="text-[15px] text-muted">We&apos;ll check every few minutes and notify you when a match opens up.</p>
        </div>
      </div>

      <div>
        <span className="label">Sites</span>
        {selectedUnits.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {selectedUnits.map((u) => (
              <span key={u.unitId} className="badge bg-accent-soft py-1.5 text-accent">{u.label}</span>
            ))}
            <button type="button" className="text-[15px] text-accent" onClick={onClear}>Any site instead</button>
          </div>
        ) : (
          <p className="px-1 text-[15px]">
            Any site <span className="text-muted">· select sites in the grid to narrow it down</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:max-w-md">
        <div>
          <label className="label" htmlFor="alert-from">From</label>
          <input id="alert-from" className="input" type="date" min={today} value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="alert-to">To</label>
          <input id="alert-to" className="input" type="date" min={from} value={to}
            onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-6">
        <div>
          <span className="label">Minimum nights</span>
          <Stepper label="Nights" value={minNights} min={1} max={14} onChange={setMinNights} />
        </div>
        <div>
          <span className="label">Arrival days <span className="font-normal">· none = any day</span></span>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((name, i) => {
              const on = arrivalDays.includes(i);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[i]}
                  onClick={() => setArrivalDays(on ? arrivalDays.filter((d) => d !== i) : [...arrivalDays, i].sort())}
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-medium transition active:scale-95 ${
                    on ? "bg-accent text-white" : "bg-fill text-fg hover:bg-fill-strong"
                  }`}
                >
                  {name[0]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <p className="text-[15px] text-danger-ink" role="alert">{error}</p>}
      <button type="button" className="btn btn-lg w-full md:w-auto" disabled={pending} onClick={submit}>
        {pending ? "Creating…" : "Create Alert"}
      </button>
    </section>
  );
}
