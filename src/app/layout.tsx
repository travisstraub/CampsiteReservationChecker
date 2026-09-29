import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { TabBar, TopBar } from "@/components/Nav";
import { getUser } from "@/lib/supabase/server";
import "./globals.css";

// SF Pro is used on Apple devices via the system font stack; Inter is the
// closest match everywhere else.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Campsite Watch", template: "%s · Campsite Watch" },
  description: "Search ReserveCalifornia campsites and get notified when sites open up.",
  appleWebApp: { capable: true, title: "Campsites", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <TopBar signedIn={Boolean(user)} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+96px)] md:px-8 md:pt-10 md:pb-20">
          {children}
        </main>
        <TabBar />
      </body>
    </html>
  );
}
