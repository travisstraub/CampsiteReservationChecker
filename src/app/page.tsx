import Link from "next/link";
import { searchParks } from "@/lib/reservecalifornia";

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
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">Find a California state park campsite</h1>
        <p className="mt-1 text-muted">
          Search ReserveCalifornia, see which sites are open, and get a notification when the one you want frees up.
        </p>
      </section>

      <form className="flex gap-2" action="/">
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Park name, e.g. Sonoma Coast, Big Sur, Doheny"
          aria-label="Search parks"
          autoFocus={!query}
        />
        <button className="btn">Search</button>
      </form>

      {error && <p className="card text-danger">Couldn&apos;t reach ReserveCalifornia: {error}</p>}

      {query && !error && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">
            {results.length ? `${results.length} park${results.length === 1 ? "" : "s"}` : "No parks match"}
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {results.map((p) => (
              <li key={p.placeId}>
                <Link href={`/parks/${p.placeId}`} className="block px-4 py-3 hover:bg-accent-soft">
                  <span className="font-medium">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
