-- Security hardening: verified phone numbers (one account per number), rate limits
-- against password guessing / spam, and a cool-down on money leaving after a password reset.

alter table public.profiles add column if not exists phone text;               -- E.164, e.g. +905338124455
alter table public.profiles add column if not exists phone_verified_at timestamptz;
alter table public.profiles add column if not exists money_hold_until timestamptz; -- no withdraw/send until then
create unique index if not exists profiles_phone_unique on public.profiles (phone) where phone is not null;

-- Sliding-window counters, e.g. key 'login:ada' or 'signup-ip:1.2.3.4'.
create table if not exists public.rate_hits (key text not null, at timestamptz not null default now());
create index if not exists rate_hits_key_at on public.rate_hits (key, at);
alter table public.rate_hits enable row level security;

-- Records one hit and says whether the caller is still under `p_max` hits in the last `p_seconds`.
create or replace function public.luda_hit(p_key text, p_max int, p_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));
  delete from rate_hits where key = p_key and at < now() - make_interval(secs => p_seconds);
  select count(*) into n from rate_hits where key = p_key;
  if n >= p_max then return false; end if;
  insert into rate_hits (key) values (p_key);
  return true;
end $$;
revoke all on function public.luda_hit(text, int, int) from public, anon, authenticated;

-- "Freeze my wallet": users can freeze themselves instantly; they can only unfreeze a freeze they made
-- (a freeze set by the Luda team stays until the team lifts it).
alter table public.profiles add column if not exists frozen_by text check (frozen_by in ('user', 'admin'));
