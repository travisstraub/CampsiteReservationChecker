-- Track "unlocking soon" openings (sites locked after a cancellation) separately
-- from sites that are open now, so each kind is notified once.
alter table public.alert_openings
  add column kind text not null default 'open' check (kind in ('open', 'unlock')),
  -- When the lock ends, in California local time.
  add column unlock_at timestamp;

alter table public.alert_openings drop constraint alert_openings_pkey;
alter table public.alert_openings add primary key (alert_id, unit_id, arrival, kind);
