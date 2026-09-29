import Link from "next/link";
import { BellIcon, ChevronRight, MapPinIcon, SearchIcon, TentIcon } from "@/components/Icons";
import { searchParks } from "@/lib/reservecalifornia";

const SUGGESTIONS = ["Big Sur", "Sonoma Coast", "Crystal Cove", "Doheny", "Humboldt", "Anza-Borrego"];

const STEPS = [
  { icon: SearchIcon, title: "Search", text: "Find a state park and see every site's availability, night by night." },
  { icon: BellIcon, title: "Watch", text: "Pick sites and dates. We check ReserveCalifornia every few minutes." },
  { icon: TentIcon, title: "Book", text: "Get a notification the moment a site opens, then book it in a tap." },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  let results: Awaited<ReturnType<typeof searchParks>> = [];
  let error: string | null = null;
  if (query) {
    try {
      results = await searchParks(query);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  return (
    <div className="space-y-10 md:space-y-14">
      <section className={`text-center ${query ? "pt-0" : "pt-6 md:pt-14"}`}>
        {!query && (
          <>
            <p className="eyebrow">California State Parks</p>
            <h1 className="title-xl mx-auto mt-2 max-w-3xl">Find your campsite.</h1>
            <p className="mx-auto mt-4 max-w-xl text-[19px] leading-snug text-muted md:text-[21px]">
              See what&apos;s open on ReserveCalifornia, and get notified the moment the site you want frees up.
            </p>
          </>
        )}

        <form action="/" className={`relative mx-auto max-w-2xl ${query ? "" : "mt-8 md:mt-10"}`}>
          <SearchIcon size={20} className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-muted" />
          <input
            className="h-14 w-full rounded-2xl bg-surface pr-28 pl-13 text-[17px] shadow-[var(--shadow)] outline-none ring-1 ring-line transition placeholder:text-faint focus:ring-4 focus:ring-accent/25"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search parks"
            aria-label="Search parks"
            enterKeyHint="search"
            autoComplete="off"
          />
          <button className="btn btn-sm absolute top-1/2 right-3 h-9 -translate-y-1/2 px-4">Search</button>
        </form>

        {!query && (
          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <Link key={s} href={`/?q=${encodeURIComponent(s)}`} className="btn-gray btn-sm font-normal">
                {s}
              </Link>
            ))}
          </div>
        )}
      </section>

      {query && (
        <section className="mx-auto max-w-2xl">
          {error ? (
            <p className="card text-center text-danger-ink">Couldn&apos;t reach ReserveCalifornia. Please try again in a moment.</p>
          ) : results.length === 0 ? (
            <div className="py-10 text-center">
              <p className="title-md">No parks found</p>
              <p className="mt-1 text-muted">Try a shorter name, like &ldquo;Big Sur&rdquo; or &ldquo;Doheny&rdquo;.</p>
            </div>
          ) : (
            <>
              <h2 className="group-header">
                {results.length} park{results.length === 1 ? "" : "s"} matching &ldquo;{query}&rdquo;
              </h2>
              <ul className="group-list">
                {results.map((p) => (
                  <li key={p.placeId}>
                    <Link href={`/parks/${p.placeId}`} className="row row-hover">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-open-soft text-open-ink">
                        <MapPinIcon size={18} />
                      </span>
                      <span className="flex-1">{p.name}</span>
                      <ChevronRight size={18} className="text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {!query && (
        <section className="grid gap-3 md:grid-cols-3 md:gap-4">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="card flex gap-4 p-5 md:block md:p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon size={22} />
              </span>
              <div>
                <p className="eyebrow md:mt-4">Step {i + 1}</p>
                <h3 className="title-md mt-0.5">{title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted">{text}</p>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
