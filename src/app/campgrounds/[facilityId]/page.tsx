import Link from "next/link";
import { notFound } from "next/navigation";
import AvailabilityExplorer from "@/components/AvailabilityExplorer";
import { isIsoDate, todayInCalifornia } from "@/lib/dates";
import { bookingUrl, getCampground, getPark } from "@/lib/reservecalifornia";
import { getUser } from "@/lib/supabase/server";

export default async function CampgroundPage({ params, searchParams }: PageProps<"/campgrounds/[facilityId]">) {
  const { facilityId } = await params;
  const { start } = await searchParams;
  const today = todayInCalifornia();

  const campground = await getCampground(facilityId);
  if (!campground) notFound();
  const [park, user] = await Promise.all([getPark(campground.placeId), getUser()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/parks/${campground.placeId}`} className="text-sm text-muted hover:text-accent">
          ← {park?.name ?? "Park"}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">{campground.name}</h1>
          <a
            className="text-sm text-accent underline"
            href={bookingUrl(campground.placeId, facilityId)}
            target="_blank"
            rel="noreferrer"
          >
            Book on ReserveCalifornia ↗
          </a>
        </div>
      </div>
      <AvailabilityExplorer
        facilityId={facilityId}
        facilityName={campground.name}
        placeId={campground.placeId}
        placeName={park?.name ?? ""}
        today={today}
        initialStart={isIsoDate(start) && start >= today ? start : today}
        signedIn={Boolean(user)}
      />
    </div>
  );
}
