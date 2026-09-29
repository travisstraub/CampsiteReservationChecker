"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppMark, BellIcon, PersonIcon, SearchIcon } from "./Icons";

const TABS = [
  { href: "/", label: "Search", icon: SearchIcon, match: (p: string) => p === "/" || p.startsWith("/parks") || p.startsWith("/campgrounds") },
  { href: "/alerts", label: "Alerts", icon: BellIcon, match: (p: string) => p.startsWith("/alerts") },
  { href: "/settings", label: "Account", icon: PersonIcon, match: (p: string) => p.startsWith("/settings") || p === "/login" || p === "/signup" },
];

/** Frosted top bar; on phones the sections move to a bottom tab bar. */
export function TopBar({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  return (
    <header className="glass sticky top-0 z-40 border-b border-line pt-[env(safe-area-inset-top)]">
      <nav className="mx-auto flex h-12 max-w-5xl items-center gap-6 px-5 md:px-8">
        <Link href="/" className="mr-auto flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]">
          <AppMark size={26} />
          Campsite Watch
        </Link>
        <div className="hidden items-center gap-7 md:flex">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`text-[14px] transition-colors ${t.match(path) ? "font-medium text-fg" : "text-muted hover:text-fg"}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {!signedIn && path !== "/login" && path !== "/signup" && (
          <Link href="/login" className="btn btn-sm md:ml-1">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Sections"
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex h-[52px] max-w-md items-stretch justify-around">
        {TABS.map((t) => {
          const active = t.match(path);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-normal ${active ? "text-accent" : "text-muted"}`}
            >
              <Icon size={24} strokeWidth={active ? 2.1 : 1.8} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
