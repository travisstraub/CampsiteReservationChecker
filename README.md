# Campsite Watch

Campsite Watch is a web app for finding campsites through [ReserveCalifornia](https://www.reservecalifornia.com/) and getting a **phone notification** when a site you want opens up. It runs on Vercel.

- **Search** California state parks. You see each campground and how many sites are open.
- **Availability grid**: see which sites are free, night by night, for 7, 14 or 30 days.
- **Alerts**: watch a campground, or only the sites you tick, for a date range. You can set a minimum number of nights and allowed arrival days (for example, Fri/Sat only).
- **Notifications** use Web Push. On **iPhone**, add the site to your Home Screen from Safari (iOS 16.4+), then turn on notifications in **Settings**. Web Push also works in desktop Chrome, Edge, Firefox and Safari, and on Android. Tapping a notification opens the campground on ReserveCalifornia so you can book it.
- **Accounts**: email/password sign-ups through Supabase Auth.

## How it works

```
GitHub Actions (every 5 min) ──► /api/cron/check on Vercel
                                   │  loads active alerts (Supabase)
                                   │  one availability lookup per campground (ReserveCalifornia)
                                   │  finds new openings and skips ones already sent
                                   └► Web Push to each of the user's devices
```

Vercel's free Hobby plan only runs cron jobs once a day, so a GitHub Actions schedule calls the check endpoint instead (`.github/workflows/check-availability.yml`). If you're on Vercel Pro, you can use Vercel Cron instead; it sends the same `Authorization: Bearer $CRON_SECRET` header.

Each opening is sent once. If the site is booked and later opens up again, you're notified again. An opening only counts as sent once it reaches at least one of your devices, so if you create an alert before turning on notifications, you'll still hear about openings that are already there.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Under **Authentication → URL Configuration**, set **Site URL** to your Vercel URL and add `https://<your-app>.vercel.app/auth/confirm` to **Redirect URLs**.
4. Copy the project URL, the publishable key and the secret key from **Project Settings → API Keys**.

Email confirmation is on by default. Supabase's built-in email sender is rate-limited, so for real use set up custom SMTP under **Authentication → Emails**.

### 2. Web Push keys

```bash
npx web-push generate-vapid-keys
```

### 3. Vercel

Import the repo into Vercel and set these environment variables (see `.env.example`):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works) |
| `SUPABASE_SECRET_KEY` | Supabase secret key (or legacy `SUPABASE_SERVICE_ROLE_KEY`). Server only. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key |
| `VAPID_PRIVATE_KEY` | VAPID private key |
| `VAPID_SUBJECT` | `mailto:you@example.com`. Apple rejects placeholder addresses. |
| `CRON_SECRET` | A long random string, for example from `openssl rand -hex 32` |

### 4. GitHub Actions schedule

In the GitHub repo, go to **Settings → Secrets and variables → Actions** and add:

- **Variable** `APP_URL`: your deployed URL, for example `https://campsite-watch.vercel.app`
- **Secret** `CRON_SECRET`: the same value you set in Vercel

Then open **Actions → Check campsite availability → Run workflow** to test it. The response lists how many alerts and campgrounds were checked, and any errors.

GitHub may delay scheduled runs by a few minutes when it's busy. In public repos, it pauses schedules after 60 days without commits.

### 5. On your iPhone

1. Open the site in **Safari**, tap **Share → Add to Home Screen**.
2. Open **Campsites** from the Home Screen and sign in.
3. Go to **Settings → Turn on notifications**, allow them, then tap **Send test notification**.

Repeat this on every device you want alerts on.

## Development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
npm test          # unit tests (vitest)
npm run lint
npm run typecheck
```

Set `RC_API_URL` to point the app at a mock server instead of the live ReserveCalifornia API.

## Caveats

- ReserveCalifornia has no public API. The app uses the same undocumented `calirdr.usedirect.com` endpoints as its website, which may change or block requests from cloud servers. Errors appear on each alert ("Last check failed: …") and in the workflow output.
- Please don't check more often than every 5 minutes.
- A notification tells you a site is open. You still have to book it yourself on ReserveCalifornia.
