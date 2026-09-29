import Link from "next/link";
import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import { ChevronRight } from "@/components/Icons";
import StayPicker from "@/components/StayPicker";
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
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <BackLink href="/">Search</BackLink>
        <h1 className="title-lg mt-3">{park.name}</h1>
      </div>

      <StayPicker date={date} nights={nights} min={today} />

      <section>
        <h2 className="group-header">Campgrounds</h2>
        {campgrounds.length === 0 ? (
          <p className="card text-muted">No campgrounds here can be booked online.</p>
        ) : (
          <ul className="group-list">
            {campgrounds.map((c) => (
              <li key={c.facilityId}>
                <Link href={`/campgrounds/${c.facilityId}?start=${date}`} className="row row-hover min-h-[60px]">
                  <span className="flex-1 font-medium">{c.name}</span>
                  {c.available !== null &&
                    (c.available ? (
                      <span className="badge badge-open">
                        <span className="h-1.5 w-1.5 rounded-full bg-open" /> Available
                      </span>
                    ) : (
                      <span className="badge badge-muted">Full</span>
                    ))}
                  <ChevronRight size={18} className="text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="group-footer">Availability for the dates above. Open a campground to see every site.</p>
      </section>
    </div>
  );
}
