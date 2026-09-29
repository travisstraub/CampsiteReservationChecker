import { addDays, daysBetween, isIsoDate } from "@/lib/dates";
import { getAvailability } from "@/lib/reservecalifornia";

export const dynamic = "force-dynamic";

const MAX_DAYS = 62;

// GET /api/availability?facilityId=706&start=2026-10-01&end=2026-10-14
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const facilityId = params.get("facilityId") ?? "";
  const start = params.get("start");
  let end = params.get("end");

  if (!/^\d+$/.test(facilityId) || !isIsoDate(start) || !isIsoDate(end) || end < start) {
    return Response.json({ error: "facilityId, start and end (YYYY-MM-DD) are required" }, { status: 400 });
  }
  if (daysBetween(start, end) >= MAX_DAYS) end = addDays(start, MAX_DAYS - 1);

  try {
    const units = await getAvailability(facilityId, start, end);
    return Response.json(
      { start, end, units },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
