-- v1.17.0: real phone notifications (Web Push). The server decides what to send and sends it, so alerts reach the
-- phone even when Luda is closed. Phones register a push subscription (endpoint + keys); the server's VAPID key pair
-- is generated once and kept here (never in the app or the repo).

create table if not exists push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,
  ua text,
  created_at timestamptz not null default now(),
  last_ok timestamptz,
  fails int not null default 0
);
create index if not exists push_subs_user on push_subs(user_id);

-- What each person was already alerted about (to-do keys), so nothing buzzes twice.
create table if not exists push_sent (
  user_id uuid not null references profiles(user_id) on delete cascade,
  key text not null,
  at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists app_keys (
  name text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);

alter table push_subs enable row level security;
alter table push_sent enable row level security;
alter table app_keys enable row level security;
revoke all on push_subs, push_sent, app_keys from anon, authenticated;

-- Save (or move) a phone's subscription to this account. A phone that switches accounts moves its endpoint.
create or replace function luda_push_save(p_user uuid, p_endpoint text, p_p256dh text, p_auth text, p_prefs jsonb, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into push_subs (user_id, endpoint, p256dh, auth, prefs, ua)
  values (p_user, p_endpoint, p_p256dh, p_auth, coalesce(p_prefs, '{}'::jsonb), left(p_ua, 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    prefs = excluded.prefs, ua = excluded.ua, fails = 0;
  -- at most 8 phones/browsers per account: drop the oldest
  delete from push_subs where id in (select id from push_subs where user_id = p_user order by created_at desc offset 8);
end $$;

create or replace function luda_push_prefs(p_user uuid, p_endpoint text, p_prefs jsonb) returns void
language sql security definer set search_path = public as $$
  update push_subs set prefs = coalesce(p_prefs, '{}'::jsonb) where user_id = p_user and endpoint = p_endpoint
$$;

create or replace function luda_push_remove(p_user uuid, p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint and (p_user is null or user_id = p_user)
$$;

create or replace function luda_push_subs(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth, 'prefs', prefs)), '[]'::jsonb)
  from push_subs where user_id = p_user
$$;

create or replace function luda_push_users(p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(u), '[]'::jsonb) from (select distinct user_id u from push_subs limit p_limit) x
$$;

-- Records to-do keys as alerted. Returns the keys that are new, and whether this is the account's first sweep
-- (then nothing is sent: old items shouldn't all buzz at once).
create or replace function luda_push_mark(p_user uuid, p_keys jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_first boolean; v_fresh jsonb;
begin
  v_first := not exists (select 1 from push_sent where user_id = p_user);
  with ins as (
    insert into push_sent (user_id, key)
    select p_user, k from jsonb_array_elements_text(coalesce(p_keys->'items', '[]'::jsonb)) k
    on conflict do nothing returning key
  ) select coalesce(jsonb_agg(key), '[]'::jsonb) into v_fresh from ins;
  if v_first and jsonb_array_length(coalesce(p_keys->'items', '[]'::jsonb)) = 0 then
    insert into push_sent (user_id, key) values (p_user, '_start') on conflict do nothing;
  end if;
  delete from push_sent where user_id = p_user and at < now() - interval '45 days' and key <> '_start';
  return jsonb_build_object('fresh', v_fresh, 'first', v_first);
end $$;

create or replace function luda_push_result(p_endpoint text, p_ok boolean, p_gone boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_gone then delete from push_subs where endpoint = p_endpoint;
  elsif p_ok then update push_subs set last_ok = now(), fails = 0 where endpoint = p_endpoint;
  else
    update push_subs set fails = fails + 1 where endpoint = p_endpoint;
    delete from push_subs where endpoint = p_endpoint and fails >= 20;
  end if;
end $$;

-- Server-only keys (VAPID). First writer wins, so two servers starting at once agree on one key pair.
create or replace function luda_app_key(p_name text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if p_value is not null then insert into app_keys (name, value) values (p_name, p_value) on conflict (name) do nothing; end if;
  select value into v from app_keys where name = p_name;
  return v;
end $$;

revoke execute on function luda_push_save(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function luda_push_prefs(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function luda_push_remove(uuid, text) from public, anon, authenticated;
revoke execute on function luda_push_subs(uuid) from public, anon, authenticated;
revoke execute on function luda_push_users(int) from public, anon, authenticated;
revoke execute on function luda_push_mark(uuid, jsonb) from public, anon, authenticated;
revoke execute on function luda_push_result(text, boolean, boolean) from public, anon, authenticated;
revoke execute on function luda_app_key(text, jsonb) from public, anon, authenticated;

create or replace function luda_bill_user(p_bill uuid) returns uuid
language sql stable security definer set search_path = public as $$ select user_id from bills where id = p_bill $$;
revoke execute on function luda_bill_user(uuid) from public, anon, authenticated;
