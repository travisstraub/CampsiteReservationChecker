"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/settings/actions";

type Status = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function NotificationSettings({ deviceCount }: { deviceCount: number }) {
  const [status, setStatus] = useState<Status>("loading");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        // iOS only exposes Web Push to sites added to the Home Screen.
        setStatus(isIos() && !isStandalone() ? "needs-install" : "unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
      if (sub) {
        // Re-save in case the subscription was rotated or registered under another account.
        await savePushSubscription(sub.toJSON());
      }
      setStatus(sub ? "on" : Notification.permission === "denied" ? "denied" : "off");
    })().catch((e: Error) => {
      setStatus("unsupported");
      setMessage({ kind: "error", text: e.message });
    });
  }, []);

  const enable = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        // Must be called directly from a user gesture on iOS.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!key) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured on the server.");
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        const result = await savePushSubscription(sub.toJSON());
        if (result.error) throw new Error(result.error);
        setSubscription(sub);
        setStatus("on");
        setMessage({ kind: "ok", text: "Notifications are on for this device." });
      } catch (e) {
        setMessage({ kind: "error", text: (e as Error).message });
      }
    });

  const disable = () =>
    startTransition(async () => {
      if (!subscription) return;
      await removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
      setSubscription(null);
      setStatus("off");
      setMessage({ kind: "ok", text: "Notifications are off for this device." });
    });

  const test = () =>
    startTransition(async () => {
      const result = await sendTestPush();
      setMessage(result.error
        ? { kind: "error", text: result.error }
        : { kind: "ok", text: `Test sent to ${result.delivered} device${result.delivered === 1 ? "" : "s"}.` });
    });

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Notifications on this device</h2>
        <p className="text-sm text-muted">
          {deviceCount
            ? `Alerts go to ${deviceCount} device${deviceCount === 1 ? "" : "s"} on your account.`
            : "No devices are receiving alerts yet."}
        </p>
      </div>

      {status === "loading" && <p className="text-sm text-muted">Checking…</p>}

      {status === "needs-install" && <InstallSteps />}

      {status === "unsupported" && (
        <p className="text-sm">
          This browser doesn&apos;t support web notifications. On iPhone, open this site in Safari and add it to your Home
          Screen (iOS 16.4 or later).
        </p>
      )}

      {status === "denied" && (
        <p className="text-sm">
          Notifications are blocked for this site. On iPhone go to <b>Settings → Notifications → Campsites</b> and allow
          them; in a desktop browser, allow notifications in the site settings. Then reload this page.
        </p>
      )}

      {status === "off" && (
        <button className="btn" onClick={enable} disabled={pending}>
          {pending ? "Turning on…" : "Turn on notifications"}
        </button>
      )}

      {status === "on" && (
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={test} disabled={pending}>Send test notification</button>
          <button className="btn-secondary" onClick={disable} disabled={pending}>Turn off on this device</button>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.kind === "error" ? "text-danger" : "text-accent"}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}

function InstallSteps() {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">On iPhone, add this app to your Home Screen first:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Open this page in <b>Safari</b>.</li>
        <li>Tap the <b>Share</b> button (the square with an arrow pointing up).</li>
        <li>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</li>
        <li>Open <b>Campsites</b> from your Home Screen, sign in, and come back to Settings.</li>
      </ol>
      <p className="text-muted">Apple only lets web apps send notifications once they&apos;re on the Home Screen (iOS 16.4+).</p>
    </div>
  );
}
