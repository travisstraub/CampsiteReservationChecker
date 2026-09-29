import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays, isIsoDate, todayInCalifornia } from "@/lib/dates";
import { getPark, listCampgrounds } from "@/lib/reservecalifornia";

export default async function ParkPage({ params, searchParams }: PageProps<"/parks/[placeId]">) {
  const { placeId } = await params;
  const sp = await searchParams;
  const today = todayInCalifornia();
  const date = isIsoDate(sp.date) && sp.date >= today ? sp.date : addDays(today, 1);
  const nights = Math.min(14, Math.max(1, Number(sp.nights) || 1));

  const park = await getPark(placeId);
  if (!park) notFound();
  const campgrounds = await listCampgrounds(placeId, date, nights);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-accent">← Search</Link>
        <h1 className="mt-1 text-2xl font-semibold">{park.name}</h1>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="date">Arrive</label>
          <input className="input" id="date" type="date" name="date" defaultValue={date} min={today} />
        </div>
        <div>
          <label className="label" htmlFor="nights">Nights</label>
          <input className="input w-24" id="nights" type="number" name="nights" min={1} max={14} defaultValue={nights} />
        </div>
        <button className="btn">Update</button>
      </form>

      {campgrounds.length === 0 ? (
        <p className="text-muted">No reservable campgrounds found for this park.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {campgrounds.map((c) => (
            <li key={c.facilityId}>
              <Link
                href={`/campgrounds/${c.facilityId}?start=${date}`}
                className="card flex items-center justify-between gap-3 hover:border-accent"
              >
                <span className="font-medium">{c.name}</span>
                {c.available !== null && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      c.available ? "bg-accent-soft text-accent" : "bg-line/60 text-muted"
                    }`}
                  >
                    {c.available ? "Sites open" : "Full"}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
