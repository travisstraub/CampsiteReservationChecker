import type { Metadata } from "next";
import NotificationSettings from "@/components/NotificationSettings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: auth }, { count }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">Signed in as {auth.user?.email}</p>
      </div>
      <NotificationSettings deviceCount={count ?? 0} />
      <p className="text-sm text-muted">
        Turn notifications on for each phone or computer you want alerts on. Tapping an alert opens the campground on
        ReserveCalifornia so you can book right away.
      </p>
    </div>
  );
}
