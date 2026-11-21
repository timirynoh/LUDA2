-- v1.16.0: Nearby directory on the server. Real places come from OpenStreetMap (Overpass), fetched by the
-- server and kept here per city + category, so phones never talk to Overpass (it throttles and times out)
-- and everyone sees the same saved list. Refreshed at most once a week; an old copy is served if a refresh fails.
create table if not exists places_cache (
  city text not null,
  cat text not null,
  places jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (city, cat)
);
alter table places_cache enable row level security;
revoke all on places_cache from anon, authenticated;

create or replace function luda_places_get(p_city text, p_cat text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('places', places, 'fetchedAt', fetched_at,
    'ageHours', extract(epoch from now() - fetched_at) / 3600)
    from places_cache where city = p_city and cat = p_cat), null)
$$;

create or replace function luda_places_put(p_city text, p_cat text, p_places jsonb) returns void
language sql security definer set search_path = public as $$
  insert into places_cache (city, cat, places, fetched_at) values (p_city, p_cat, coalesce(p_places->'items', '[]'::jsonb), now())
  on conflict (city, cat) do update set places = excluded.places, fetched_at = now()
$$;

revoke execute on function luda_places_get(text, text) from public, anon, authenticated;
revoke execute on function luda_places_put(text, text, jsonb) from public, anon, authenticated;
