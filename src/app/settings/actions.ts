"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { sendToUser } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

type SerializedSubscription = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function savePushSubscription(sub: SerializedSubscription): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Please sign in again." };
  const { endpoint, keys } = sub;
  if (!endpoint?.startsWith("https://") || !keys?.p256dh || !keys?.auth) {
    return { error: "The browser returned an invalid push subscription." };
  }

  // Service-role client: the same device may previously have been registered
  // to a different account, whose row the user can't see through RLS.
  const db = createAdminClient();
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await db.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: (await headers()).get("user-agent")?.slice(0, 300) ?? null,
  });
  revalidatePath("/settings");
  return error ? { error: error.message } : {};
}

export async function removePushSubscription(endpoint: string) {
  const user = await getUser();
  if (!user) return;
  await createAdminClient().from("push_subscriptions").delete().match({ endpoint, user_id: user.id });
  revalidatePath("/settings");
}

export async function sendTestPush(): Promise<{ error?: string; delivered?: number }> {
  const user = await getUser();
  if (!user) return { error: "Please sign in again." };
  try {
    const delivered = await sendToUser(user.id, {
      title: "Campsite Watch",
      body: "Notifications are working. You'll get one like this when a site opens up.",
      url: "/alerts",
      tag: "test",
    });
    return delivered ? { delivered } : { error: "No devices are subscribed yet." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
