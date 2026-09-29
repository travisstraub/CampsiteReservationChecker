"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/settings/actions";
import { AppMark, BellIcon, PlusIcon, ShareIcon } from "./Icons";

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

  const statusText = {
    loading: "Checking…",
    unsupported: "Not supported in this browser",
    "needs-install": "Add to Home Screen first",
    denied: "Blocked",
    off: "Off",
    on: "On",
  }[status];

  return (
    <section>
      <h2 className="group-header">Notifications</h2>
      <div className="group-list">
        <div className="row">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger text-white">
            <BellIcon size={18} strokeWidth={2} />
          </span>
          <span className="flex-1">This device</span>
          <span className={`text-[17px] ${status === "on" ? "text-open-ink" : "text-muted"}`}>{statusText}</span>
        </div>

        {status === "off" && (
          <button className="row row-hover text-accent" onClick={enable} disabled={pending}>
            {pending ? "Turning on…" : "Turn On Notifications"}
          </button>
        )}
        {status === "on" && (
          <>
            <button className="row row-hover text-accent" onClick={test} disabled={pending}>
              Send Test Notification
            </button>
            <button className="row row-hover text-danger-ink" onClick={disable} disabled={pending}>
              Turn Off on This Device
            </button>
          </>
        )}
      </div>

      {message && (
        <p className={`group-footer ${message.kind === "error" ? "text-danger-ink" : "text-open-ink"}`} role="status">
          {message.text}
        </p>
      )}
      {!message && (
        <p className="group-footer">
          {status === "denied"
            ? "Notifications are blocked for this site. On iPhone, go to Settings › Notifications › Campsites and allow them, then reload."
            : status === "unsupported"
              ? "This browser can't receive web notifications. On iPhone, open this site in Safari and add it to your Home Screen (iOS 16.4 or later)."
              : deviceCount
                ? `Alerts go to ${deviceCount} device${deviceCount === 1 ? "" : "s"} on your account. Turn notifications on for each one you want alerts on.`
                : "No devices are receiving alerts yet."}
        </p>
      )}

      {status === "needs-install" && <InstallSteps />}
    </section>
  );
}

function InstallSteps() {
  const steps = [
    { icon: <CompassBadge />, text: <>Open this page in <b>Safari</b>.</> },
    { icon: <ShareIcon size={20} className="text-accent" />, text: <>Tap <b>Share</b> in the toolbar.</> },
    { icon: <PlusIcon size={20} className="text-fg" />, text: <>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</> },
    { icon: <AppMark size={22} />, text: <>Open <b>Campsites</b> from your Home Screen and return here.</> },
  ];
  return (
    <div className="mt-8">
      <h2 className="group-header">Add to Home Screen</h2>
      <ol className="group-list">
        {steps.map((s, i) => (
          <li key={i} className="row">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fill">{s.icon}</span>
            <span className="text-[15px]">{s.text}</span>
          </li>
        ))}
      </ol>
      <p className="group-footer">Apple lets web apps send notifications once they&apos;re on your Home Screen (iOS 16.4 or later).</p>
    </div>
  );
}

function CompassBadge() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#0a84ff" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" fill="#fff" />
    </svg>
  );
}
