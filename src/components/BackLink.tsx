import Link from "next/link";
import { ChevronLeft } from "./Icons";

/** iOS-style back button: chevron plus the parent page's name. */
export default function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-ml-1.5 inline-flex items-center gap-0.5 text-[17px] text-accent hover:opacity-80">
      <ChevronLeft size={22} strokeWidth={2.2} />
      {children}
    </Link>
  );
}
