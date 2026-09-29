import type { Metadata } from "next";
import Link from "next/link";
import { BellIcon, ChevronRight } from "@/components/Icons";
import NotificationSettings from "@/components/NotificationSettings";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../auth/actions";

export const metadata: Metadata = { title: "Account" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: auth }, { count: devices }, { count: alerts }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("active", true),
  ]);
  const email = auth.user?.email ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="title-lg">Account</h1>

      <div className="group-list">
        <div className="row gap-4 py-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#a1a1a6] to-[#7c7c80] text-[24px] font-medium text-white uppercase">
            {email.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[19px] font-semibold">{email}</p>
            <p className="text-[15px] text-muted">Campsite Watch account</p>
          </div>
        </div>
        <Link href="/alerts" className="row row-hover">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <BellIcon size={18} strokeWidth={2} />
          </span>
          <span className="flex-1">Alerts</span>
          <span className="text-muted">{alerts ?? 0} active</span>
          <ChevronRight size={18} className="text-faint" />
        </Link>
      </div>

      <NotificationSettings deviceCount={devices ?? 0} />

      <div className="group-list">
        <form action={signOut}>
          <button className="row row-hover justify-center text-danger-ink">Sign Out</button>
        </form>
      </div>
    </div>
  );
}
