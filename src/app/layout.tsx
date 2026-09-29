import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "./auth/actions";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Campsite Watch", template: "%s · Campsite Watch" },
  description: "Search ReserveCalifornia campsites and get notified when sites open up.",
  appleWebApp: { capable: true, title: "Campsites", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121411" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="mr-auto flex items-center gap-2 text-base font-semibold">
              <span aria-hidden>⛺</span> Campsite Watch
            </Link>
            <Link href="/" className="hover:text-accent">Search</Link>
            {user ? (
              <>
                <Link href="/alerts" className="hover:text-accent">Alerts</Link>
                <Link href="/settings" className="hover:text-accent">Settings</Link>
                <form action={signOut}>
                  <button className="text-muted hover:text-accent">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="btn py-1.5">Sign in</Link>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </body>
    </html>
  );
}
