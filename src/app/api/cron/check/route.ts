import { timingSafeEqual } from "node:crypto";
import { runCheck } from "@/lib/checker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Called every few minutes by the GitHub Actions workflow in
// .github/workflows/check-availability.yml (or by Vercel Cron on a Pro plan).
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const summary = await runCheck();
  console.log("Availability check", summary);
  return Response.json(summary, { status: summary.errors.length ? 207 : 200 });
}
