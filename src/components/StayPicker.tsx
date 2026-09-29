"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import Spinner from "./Spinner";
import Stepper from "./Stepper";

/** Arrival date and nights for a park; updates the page as you change them. */
export default function StayPicker({ date, nights, min }: { date: string; nights: number; min: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, startTransition] = useTransition();

  const go = (d: string, n: number) =>
    startTransition(() => router.replace(`${path}?date=${d}&nights=${n}`, { scroll: false }));

  return (
    <section>
      <h2 className="group-header flex items-center gap-2">
        Your stay {pending && <Spinner size={14} />}
      </h2>
      <div className="group-list md:max-w-md">
        <label className="row justify-between" htmlFor="arrive">
          <span>Arrive</span>
          <input
            id="arrive"
            className="h-9 rounded-lg bg-fill px-3 text-[17px] text-fg outline-none focus:ring-4 focus:ring-accent/25"
            type="date"
            min={min}
            value={date}
            onChange={(e) => e.target.value && go(e.target.value < min ? min : e.target.value, nights)}
          />
        </label>
        <div className="row justify-between py-1.5">
          <span>Nights</span>
          <Stepper label="Nights" value={nights} min={1} max={14} onChange={(n) => go(date, n)} />
        </div>
      </div>
    </section>
  );
}
