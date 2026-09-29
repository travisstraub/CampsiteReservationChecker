import { notFound } from "next/navigation";
import AvailabilityExplorer from "@/components/AvailabilityExplorer";
import BackLink from "@/components/BackLink";
import { ArrowUpRight } from "@/components/Icons";
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
    <div className="space-y-8">
      <div>
        <BackLink href={`/parks/${campground.placeId}`}>{park?.name ?? "Park"}</BackLink>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="title-lg">{campground.name}</h1>
          <a
            className="btn-tinted btn-sm"
            href={bookingUrl(campground.placeId, facilityId)}
            target="_blank"
            rel="noreferrer"
          >
            ReserveCalifornia <ArrowUpRight size={14} strokeWidth={2.2} />
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
