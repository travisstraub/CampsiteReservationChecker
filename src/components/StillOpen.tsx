"use client";

import { useEffect, useState } from "react";
import type { Unit } from "@/lib/availability";
import { addDays, dateRange } from "@/lib/dates";

type Props = { facilityId: string; unitId: string; arrival: string; nights: number };

/** Re-checks ReserveCalifornia live to show whether an opening is still free. */
export default function StillOpen({ facilityId, unitId, arrival, nights }: Props) {
  const [status, setStatus] = useState<"checking" | "open" | "gone" | "error">("checking");

  useEffect(() => {
    const controller = new AbortController();
    const end = addDays(arrival, nights - 1);
    fetch(`/api/availability?facilityId=${facilityId}&start=${arrival}&end=${end}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { units } = (await res.json()) as { units: Unit[] };
        const unit = units.find((u) => u.unitId === unitId);
        const free = new Set(unit?.available ?? []);
        setStatus(dateRange(arrival, end).every((d) => free.has(d)) ? "open" : "gone");
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [facilityId, unitId, arrival, nights]);

  const styles = {
    checking: ["bg-line/60 text-muted", "Checking…"],
    open: ["bg-accent-soft text-accent", "✓ Still open"],
    gone: ["bg-danger/10 text-danger", "✗ No longer open"],
    error: ["bg-line/60 text-muted", "Couldn't check"],
  } as const;
  const [cls, label] = styles[status];
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
