"use client";

import { MinusIcon, PlusIcon } from "./Icons";

type Props = { value: number; min: number; max: number; onChange: (v: number) => void; label: string };

/** iOS-style − / + stepper. */
export default function Stepper({ value, min, max, onChange, label }: Props) {
  return (
    <div className="inline-flex h-11 items-center rounded-xl bg-fill" role="group" aria-label={label}>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center text-fg disabled:text-faint"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Fewer ${label.toLowerCase()}`}
      >
        <MinusIcon size={18} strokeWidth={2.2} />
      </button>
      <span className="min-w-8 text-center text-[17px] font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center text-fg disabled:text-faint"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`More ${label.toLowerCase()}`}
      >
        <PlusIcon size={18} strokeWidth={2.2} />
      </button>
    </div>
  );
}
