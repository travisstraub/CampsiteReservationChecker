-- Campsite Watch schema. Run in the Supabase SQL editor (or `supabase db push`).

-- A user's alert for one campground.
create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id        text not null,
  place_name      text not null,
  facility_id     text not null,
  facility_name   text not null,
  -- ReserveCalifornia UnitIds; empty = any site in the campground.
  unit_ids        text[] not null default '{}',
  -- Human-readable names for unit_ids, for display only.
  site_labels     text[] not null default '{}',
  start_date      date not null,
  end_date        date not null,
  min_nights      int  not null default 1 check (min_nights between 1 and 14),
  -- 0 = Sunday … 6 = Saturday; empty = any arrival day.
  arrival_days    int[] not null default '{}',
  active          boolean not null default true,
  last_checked_at timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  check (end_date >= start_date)
);
create index alerts_user_idx on public.alerts (user_id);
create index alerts_active_idx on public.alerts (active, facility_id);

-- Openings we've already notified about, so each one is only sent once.
-- Rows are removed when the opening disappears, so it re-alerts if it reopens.
create table public.alert_openings (
  alert_id    uuid not null references public.alerts (id) on delete cascade,
  unit_id     text not null,
  arrival     date not null,
  site_label  text not null,
  nights      int  not null,
  notified_at timestamptz not null default now(),
  primary key (alert_id, unit_id, arrival)
);

-- Web Push subscriptions, one per browser/device a user enabled notifications on.
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Row level security: users can only see and change their own rows.
-- The cron job uses the service-role key, which bypasses RLS.
alter table public.alerts enable row level security;
alter table public.alert_openings enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "own alerts" on public.alerts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own alert openings" on public.alert_openings
  for select to authenticated
  using (exists (select 1 from public.alerts a where a.id = alert_id and a.user_id = (select auth.uid())));

create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
