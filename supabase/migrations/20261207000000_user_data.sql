-- v1.25.0 (owner: 'when I log in on another phone my profile, picture and progress are gone'). Personal data that
-- used to live only on the phone now follows the account: profile (display name, bio, city, country), photo,
-- home-screen settings, class timetable, residency checklist, saved items and finished intro steps.
-- One row per account and section; the newest change wins (each write carries the time it was made on the phone).
create table if not exists public.user_data (
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  key        text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_data enable row level security;

create or replace function public.luda_user_data_get(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, jsonb_build_object('data', data, 'at', updated_at)), '{}'::jsonb) from user_data where user_id = p_user
$$;

-- Saves a section unless the server already has a newer copy (then that newer copy is returned and the phone takes it).
create or replace function public.luda_user_data_put(p_user uuid, p_key text, p_data jsonb, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r user_data%rowtype; at timestamptz := least(coalesce(p_at, now()), now());
begin
  insert into user_data (user_id, key, data, updated_at) values (p_user, p_key, p_data, at)
  on conflict (user_id, key) do update set data = excluded.data, updated_at = excluded.updated_at
    where user_data.updated_at <= excluded.updated_at
  returning * into r;
  if not found then select * into r from user_data where user_id = p_user and key = p_key; end if;
  return jsonb_build_object('data', r.data, 'at', r.updated_at, 'saved', r.updated_at = at);
end $$;

do $$ declare f text; begin
  foreach f in array array['luda_user_data_get(uuid)', 'luda_user_data_put(uuid,text,jsonb,timestamptz)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
