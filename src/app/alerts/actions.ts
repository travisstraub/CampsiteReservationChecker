"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { daysBetween, isIsoDate, todayInCalifornia } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export type NewAlert = {
  placeId: string;
  placeName: string;
  facilityId: string;
  facilityName: string;
  unitIds: string[];
  siteLabels: string[];
  startDate: string;
  endDate: string;
  minNights: number;
  arrivalDays: number[];
};

const MAX_RANGE_DAYS = 365;

export async function createAlert(input: NewAlert): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Please sign in again." };

  const today = todayInCalifornia();
  const { startDate, endDate } = input;
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return { error: "Pick valid dates." };
  if (endDate < startDate) return { error: "The latest night must be after the earliest arrival." };
  if (endDate < today) return { error: "Those dates are in the past." };
  if (daysBetween(startDate, endDate) > MAX_RANGE_DAYS) return { error: "Keep the date range under a year." };
  const minNights = Math.trunc(input.minNights);
  if (!(minNights >= 1 && minNights <= 14)) return { error: "Minimum nights must be between 1 and 14." };
  if (!/^\d+$/.test(input.facilityId) || !/^\d+$/.test(input.placeId)) return { error: "Unknown campground." };

  const arrivalDays = [...new Set(input.arrivalDays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const unitIds = input.unitIds.map(String).slice(0, 100);

  const { error } = await supabase.from("alerts").insert({
    user_id: auth.user.id,
    place_id: input.placeId,
    place_name: String(input.placeName).slice(0, 200),
    facility_id: input.facilityId,
    facility_name: String(input.facilityName).slice(0, 200),
    unit_ids: unitIds,
    site_labels: input.siteLabels.map((s) => String(s).slice(0, 100)).slice(0, unitIds.length),
    start_date: startDate,
    end_date: endDate,
    min_nights: minNights,
    arrival_days: arrivalDays,
  });
  if (error) return { error: error.message };

  revalidatePath("/alerts");
  redirect("/alerts?created=1");
}

export async function setAlertActive(id: string, active: boolean) {
  const supabase = await createClient();
  await supabase.from("alerts").update({ active }).eq("id", id);
  revalidatePath("/alerts");
}

export async function deleteAlert(id: string) {
  const supabase = await createClient();
  await supabase.from("alerts").delete().eq("id", id);
  revalidatePath("/alerts");
}
