-- Real-money features on the server wallet: savings pots, assisted bill pay, marketplace and Flash help.
-- Money that is "on its way" (a bill being paid, an item not yet received, a job not yet done) sits in an
-- ESCROW: it leaves the payer's wallet when the escrow opens and goes, exactly once, either to the payee
-- (minus Luda's fee), to Luda (a bill Luda paid), or back to the payer.
-- Every money move goes through luda_post (atomic, never negative, frozen accounts can't be debited).

/* ------------------------------- escrow ------------------------------- */
create table if not exists public.escrows (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('bill', 'market', 'flash')),
  payer        uuid not null references public.profiles (user_id),
  payee        uuid references public.profiles (user_id),
  currency     text not null check (currency in ('NGN', 'TRY')),
  amount_minor bigint not null check (amount_minor > 0), -- taken from the payer
  fee_minor    bigint not null default 0 check (fee_minor >= 0 and fee_minor <= amount_minor), -- kept by Luda on release
  status       text not null default 'held' check (status in ('held', 'released', 'refunded')),
  note         text,
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);
create index if not exists escrows_status on public.escrows (status, created_at desc);
alter table public.escrows enable row level security;

-- Takes the money from the payer's wallet and opens the escrow.
create or replace function public.luda_hold(p_kind text, p_payer uuid, p_payee uuid, p_currency text, p_amount bigint, p_fee bigint, p_meta jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare e escrows%rowtype;
begin
  insert into escrows (kind, payer, payee, currency, amount_minor, fee_minor) values (p_kind, p_payer, p_payee, p_currency, p_amount, p_fee) returning * into e;
  perform luda_post(jsonb_build_array(jsonb_build_object('user_id', p_payer, 'currency', p_currency, 'amount_minor', -p_amount,
    'kind', p_kind || '_pay', 'ref', e.id::text, 'meta', coalesce(p_meta, '{}'::jsonb))));
  return e.id;
end $$;

-- Closes an escrow once: 'payee' (amount - fee to the payee), 'luda' (Luda used the money, e.g. paid the bill) or 'payer' (full refund).
create or replace function public.luda_settle(p_escrow uuid, p_to text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare e escrows%rowtype;
begin
  if p_to not in ('payee', 'luda', 'payer') then raise exception 'bad_target'; end if;
  update escrows set status = case when p_to = 'payer' then 'refunded' else 'released' end, note = p_note, settled_at = now()
   where id = p_escrow and status = 'held' and (p_to <> 'payee' or payee is not null)
  returning * into e;
  if not found then return 'already'; end if;
  if p_to = 'payer' then
    perform luda_post(jsonb_build_array(jsonb_build_object('user_id', e.payer, 'currency', e.currency, 'amount_minor', e.amount_minor,
      'kind', e.kind || '_refund', 'ref', e.id::text, 'meta', jsonb_build_object('note', p_note))));
  elsif p_to = 'payee' and e.amount_minor - e.fee_minor > 0 then
    perform luda_post(jsonb_build_array(jsonb_build_object('user_id', e.payee, 'currency', e.currency, 'amount_minor', e.amount_minor - e.fee_minor,
      'kind', e.kind || '_earn', 'ref', e.id::text, 'meta', jsonb_build_object('fee', e.fee_minor))));
  end if;
  return e.status;
end $$;

/* ------------------------------ savings pots ------------------------------ */
create table if not exists public.pots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (user_id),
  name          text not null,
  emoji         text not null default '🎯',
  currency      text not null check (currency in ('NGN', 'TRY')),
  goal_minor    bigint not null default 0 check (goal_minor >= 0),
  balance_minor bigint not null default 0 check (balance_minor >= 0),
  locked_until  timestamptz,
  closed        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists pots_user on public.pots (user_id, created_at);
alter table public.pots enable row level security;

create or replace function public.luda_pot_create(p_user uuid, p_name text, p_emoji text, p_currency text, p_goal bigint, p_locked_until timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t pots%rowtype;
begin
  if (select count(*) from pots where user_id = p_user and not closed) >= 10 then raise exception 'too_many_pots'; end if;
  insert into pots (user_id, name, emoji, currency, goal_minor, locked_until) values (p_user, p_name, p_emoji, p_currency, p_goal, p_locked_until) returning * into t;
  return to_jsonb(t);
end $$;

-- p_amount > 0: wallet → pot. p_amount < 0: pot → wallet (not while the pot is locked).
create or replace function public.luda_pot_move(p_user uuid, p_pot uuid, p_amount bigint, p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t pots%rowtype;
begin
  if p_amount = 0 then raise exception 'bad_amount'; end if;
  select * into t from pots where id = p_pot and user_id = p_user and not closed for update;
  if not found then raise exception 'not_available'; end if;
  if p_amount < 0 and t.locked_until is not null and t.locked_until > now() then raise exception 'pot_locked'; end if;
  if t.balance_minor + p_amount < 0 then raise exception 'insufficient_funds'; end if;
  perform luda_post(jsonb_build_array(jsonb_build_object('user_id', p_user, 'currency', t.currency, 'amount_minor', -p_amount,
    'kind', case when p_amount > 0 then 'pot_in' else 'pot_out' end, 'ref', p_ref, 'meta', jsonb_build_object('pot', t.name, 'emoji', t.emoji))));
  update pots set balance_minor = balance_minor + p_amount where id = p_pot returning * into t;
  return to_jsonb(t);
end $$;

create or replace function public.luda_pot_close(p_user uuid, p_pot uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update pots set closed = true where id = p_pot and user_id = p_user and not closed and balance_minor = 0;
  if not found then raise exception 'not_available'; end if;
end $$;

/* ------------------------------ assisted bill pay ------------------------------ */
create table if not exists public.bills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (user_id),
  type         text not null check (type in ('electricity', 'water', 'internet', 'phone', 'rent', 'other')),
  provider     text not null,
  account_ref  text not null,   -- subscriber / customer / phone number as on the bill
  amount_minor bigint not null check (amount_minor > 0), -- the bill (TRY)
  fee_minor    bigint not null default 0,
  escrow_id    uuid not null references public.escrows (id),
  status       text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  files        text[] not null default '{}', -- the user's photo of the bill (private storage)
  receipt      text[] not null default '{}', -- the team's payment receipt (private storage)
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists bills_user on public.bills (user_id, created_at desc);
create index if not exists bills_status on public.bills (status, created_at);
alter table public.bills enable row level security;

create or replace function public.luda_bill_create(p_user uuid, p_type text, p_provider text, p_account text, p_amount bigint, p_fee bigint, p_files text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eid uuid; b bills%rowtype;
begin
  eid := luda_hold('bill', p_user, null, 'TRY', p_amount + p_fee, p_fee,
    jsonb_build_object('type', p_type, 'provider', p_provider, 'account', right(p_account, 4)));
  insert into bills (user_id, type, provider, account_ref, amount_minor, fee_minor, escrow_id, files)
  values (p_user, p_type, p_provider, p_account, p_amount, p_fee, eid, coalesce(p_files, '{}')) returning * into b;
  return to_jsonb(b);
end $$;

-- The team paid it (money stays with Luda, which paid the provider) or couldn't (full refund incl. fee).
create or replace function public.luda_bill_settle(p_bill uuid, p_paid boolean, p_note text, p_receipt text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bills%rowtype; r text;
begin
  select * into b from bills where id = p_bill and status = 'pending' for update;
  if not found then return jsonb_build_object('ok', false, 'already', true); end if;
  r := luda_settle(b.escrow_id, case when p_paid then 'luda' else 'payer' end, p_note);
  update bills set status = case when p_paid then 'paid' else 'refunded' end, note = p_note,
         receipt = case when p_paid then coalesce(p_receipt, '{}') else receipt end, updated_at = now()
   where id = p_bill returning * into b;
  return jsonb_build_object('ok', true, 'bill', to_jsonb(b));
end $$;

/* ------------------------------ marketplace ------------------------------ */
create table if not exists public.listings (
  id           uuid primary key default gen_random_uuid(),
  seller       uuid not null references public.profiles (user_id),
  title        text not null,
  description  text not null default '',
  category     text not null default 'other',
  city         text not null default '',
  price_minor  bigint not null check (price_minor > 0), -- TRY
  photos       text[] not null default '{}',
  status       text not null default 'active' check (status in ('active', 'reserved', 'sold', 'removed')),
  buyer        uuid references public.profiles (user_id),
  escrow_id    uuid references public.escrows (id),
  reserved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists listings_status on public.listings (status, created_at desc);
create index if not exists listings_seller on public.listings (seller, created_at desc);
alter table public.listings enable row level security;

-- Buyer pays into escrow; the item is reserved for them.
create or replace function public.luda_market_create(p_id uuid, p_seller uuid, p_title text, p_description text, p_category text, p_city text, p_price bigint, p_photos text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l listings%rowtype;
begin
  if (select count(*) from listings where seller = p_seller and status in ('active', 'reserved')) >= 20 then raise exception 'not_available'; end if;
  insert into listings (id, seller, title, description, category, city, price_minor, photos)
  values (p_id, p_seller, p_title, p_description, p_category, p_city, p_price, coalesce(p_photos, '{}')) returning * into l;
  return to_jsonb(l) - 'buyer' - 'escrow_id';
end $$;

create or replace function public.luda_market_remove(p_listing uuid, p_seller uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update listings set status = 'removed', updated_at = now() where id = p_listing and seller = p_seller and status = 'active';
  if not found then raise exception 'not_available'; end if;
end $$;

-- p_fee_pct: Luda's share, taken from what the seller receives.
create or replace function public.luda_market_buy(p_listing uuid, p_buyer uuid, p_fee_pct numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l listings%rowtype; eid uuid;
begin
  select * into l from listings where id = p_listing for update;
  if not found or l.status <> 'active' then raise exception 'not_available'; end if;
  if l.seller = p_buyer then raise exception 'own_listing'; end if;
  eid := luda_hold('market', p_buyer, l.seller, 'TRY', l.price_minor, least(round(l.price_minor * greatest(p_fee_pct, 0))::bigint, l.price_minor), jsonb_build_object('item', l.title));
  update listings set status = 'reserved', buyer = p_buyer, escrow_id = eid, reserved_at = now(), updated_at = now() where id = p_listing returning * into l;
  return to_jsonb(l);
end $$;

-- 'seller': buyer got the item → seller paid (sold). 'buyer': refund → item back on sale (unless removed).
create or replace function public.luda_market_finish(p_listing uuid, p_to text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l listings%rowtype; r text;
begin
  select * into l from listings where id = p_listing and status = 'reserved' for update;
  if not found then return jsonb_build_object('ok', false, 'already', true); end if;
  r := luda_settle(l.escrow_id, case when p_to = 'seller' then 'payee' else 'payer' end, p_note);
  update listings set status = case when p_to = 'seller' then 'sold' else 'active' end,
         buyer = case when p_to = 'seller' then buyer else null end,
         escrow_id = case when p_to = 'seller' then escrow_id else null end,
         reserved_at = case when p_to = 'seller' then reserved_at else null end, updated_at = now()
   where id = p_listing returning * into l;
  return jsonb_build_object('ok', true, 'listing', to_jsonb(l));
end $$;

/* ------------------------------ Flash help ------------------------------ */
create table if not exists public.flash_jobs (
  id           uuid primary key default gen_random_uuid(),
  poster       uuid not null references public.profiles (user_id),
  title        text not null,
  details      text not null default '',
  city         text not null default '',
  reward_minor bigint not null check (reward_minor > 0), -- TRY
  status       text not null default 'open' check (status in ('open', 'taken', 'done', 'cancelled')),
  helper       uuid references public.profiles (user_id),
  escrow_id    uuid not null references public.escrows (id),
  taken_at     timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists flash_status on public.flash_jobs (status, created_at desc);
alter table public.flash_jobs enable row level security;

-- The reward is held when the job is posted, so helpers know the money is really there.
create or replace function public.luda_flash_post(p_poster uuid, p_title text, p_details text, p_city text, p_reward bigint, p_fee bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eid uuid; j flash_jobs%rowtype;
begin
  eid := luda_hold('flash', p_poster, null, 'TRY', p_reward, least(p_fee, p_reward), jsonb_build_object('job', p_title));
  insert into flash_jobs (poster, title, details, city, reward_minor, escrow_id) values (p_poster, p_title, p_details, p_city, p_reward, eid) returning * into j;
  return to_jsonb(j);
end $$;

create or replace function public.luda_flash_take(p_job uuid, p_helper uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j flash_jobs%rowtype;
begin
  select * into j from flash_jobs where id = p_job for update;
  if not found or j.status <> 'open' then raise exception 'not_available'; end if;
  if j.poster = p_helper then raise exception 'own_listing'; end if;
  update escrows set payee = p_helper where id = j.escrow_id and status = 'held';
  update flash_jobs set status = 'taken', helper = p_helper, taken_at = now(), updated_at = now() where id = p_job returning * into j;
  return to_jsonb(j);
end $$;

-- The helper can't do it after all: the job goes back on the board (the reward stays held).
create or replace function public.luda_flash_drop(p_job uuid, p_helper uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j flash_jobs%rowtype;
begin
  select * into j from flash_jobs where id = p_job and helper = p_helper and status = 'taken' for update;
  if not found then raise exception 'not_available'; end if;
  update escrows set payee = null where id = j.escrow_id and status = 'held';
  update flash_jobs set status = 'open', helper = null, taken_at = null, updated_at = now() where id = p_job returning * into j;
  return to_jsonb(j);
end $$;

-- 'helper': job done → helper paid. 'poster': cancelled → reward back to the poster.
create or replace function public.luda_flash_finish(p_job uuid, p_to text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j flash_jobs%rowtype; r text;
begin
  select * into j from flash_jobs where id = p_job and status in ('open', 'taken') for update;
  if not found or (p_to = 'helper' and j.status <> 'taken') then return jsonb_build_object('ok', false, 'already', true); end if;
  r := luda_settle(j.escrow_id, case when p_to = 'helper' then 'payee' else 'payer' end, p_note);
  update flash_jobs set status = case when p_to = 'helper' then 'done' else 'cancelled' end, updated_at = now() where id = p_job returning * into j;
  return jsonb_build_object('ok', true, 'job', to_jsonb(j));
end $$;

/* ------------------------------ reads ------------------------------ */
-- Usernames only (never emails or money details of other people).
create or replace function public.luda_uname(p uuid) returns text language sql stable security definer set search_path = public as $$ select username from profiles where user_id = p $$;

create or replace function public.luda_features_mine(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pots', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from pots t where t.user_id = p_user and not t.closed), '[]'::jsonb),
    'bills', coalesce((select jsonb_agg(to_jsonb(b) - 'escrow_id' order by b.created_at desc) from (select * from bills where user_id = p_user order by created_at desc limit 30) b), '[]'::jsonb)
  )
$$;

-- Active listings (newest first) + the caller's own listings and purchases.
create or replace function public.luda_market_list(p_user uuid, p_city text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
        select to_jsonb(l) - 'buyer' - 'escrow_id' || jsonb_build_object('seller_name', luda_uname(l.seller)) x
          from listings l where l.status = 'active' and (p_city is null or p_city = '' or l.city = p_city) order by l.created_at desc limit 60) s), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(to_jsonb(l) - 'escrow_id' || jsonb_build_object('buyer_name', luda_uname(l.buyer)) order by l.created_at desc)
        from listings l where l.seller = p_user and l.status <> 'removed'), '[]'::jsonb),
    'bought', coalesce((select jsonb_agg(to_jsonb(l) - 'escrow_id' || jsonb_build_object('seller_name', luda_uname(l.seller)) order by l.updated_at desc)
        from listings l where l.buyer = p_user), '[]'::jsonb)
  )
$$;

create or replace function public.luda_flash_list(p_user uuid, p_city text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', coalesce((select jsonb_agg(to_jsonb(j) - 'escrow_id' || jsonb_build_object('poster_name', luda_uname(j.poster)) order by j.created_at desc)
        from (select * from flash_jobs where status = 'open' and (p_city is null or p_city = '' or city = p_city) order by created_at desc limit 60) j), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(to_jsonb(j) - 'escrow_id' || jsonb_build_object('helper_name', luda_uname(j.helper)) order by j.created_at desc)
        from (select * from flash_jobs where poster = p_user order by created_at desc limit 30) j), '[]'::jsonb),
    'helping', coalesce((select jsonb_agg(to_jsonb(j) - 'escrow_id' || jsonb_build_object('poster_name', luda_uname(j.poster)) order by j.updated_at desc)
        from (select * from flash_jobs where helper = p_user order by updated_at desc limit 30) j), '[]'::jsonb)
  )
$$;

-- Money a payee is owed that the payer never confirmed: released after a waiting period, unless a support case
-- about it is open. Market: 7 days after paying. Flash: 3 days after the helper took the job.
create or replace function public.luda_auto_release(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; x record;
begin
  for x in select id from listings where seller = p_user and status = 'reserved' and reserved_at < now() - interval '7 days'
            and not exists (select 1 from cases c where c.reference = listings.id::text and c.status in ('open', 'waiting_user')) loop
    perform luda_market_finish(x.id, 'seller', 'Released automatically after 7 days'); n := n + 1;
  end loop;
  for x in select id from flash_jobs where helper = p_user and status = 'taken' and taken_at < now() - interval '3 days'
            and not exists (select 1 from cases c where c.reference = flash_jobs.id::text and c.status in ('open', 'waiting_user')) loop
    perform luda_flash_finish(x.id, 'helper', 'Released automatically after 3 days'); n := n + 1;
  end loop;
  return n;
end $$;

-- Admin: bills to pay and money in escrow.
create or replace function public.luda_admin_bills(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object('username', luda_uname(b.user_id)) order by b.created_at), '[]'::jsonb)
    from (select * from bills where p_status is null or status = p_status order by created_at desc limit 100) b
$$;

create or replace function public.luda_admin_escrows(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select to_jsonb(e) || jsonb_build_object('payer_name', luda_uname(e.payer), 'payee_name', luda_uname(e.payee),
      'item', coalesce((select jsonb_build_object('type', 'market', 'id', l.id, 'title', l.title, 'status', l.status) from listings l where l.escrow_id = e.id),
                       (select jsonb_build_object('type', 'flash', 'id', j.id, 'title', j.title, 'status', j.status) from flash_jobs j where j.escrow_id = e.id),
                       (select jsonb_build_object('type', 'bill', 'id', b.id, 'title', b.provider, 'status', b.status) from bills b where b.escrow_id = e.id))) x
      from escrows e where p_status is null or e.status = p_status order by e.created_at desc limit 100) s
$$;

do $$ declare f text; begin
  foreach f in array array[
    'luda_hold(text,uuid,uuid,text,bigint,bigint,jsonb)', 'luda_settle(uuid,text,text)',
    'luda_pot_create(uuid,text,text,text,bigint,timestamptz)', 'luda_pot_move(uuid,uuid,bigint,text)', 'luda_pot_close(uuid,uuid)',
    'luda_bill_create(uuid,text,text,text,bigint,bigint,text[])', 'luda_bill_settle(uuid,boolean,text,text[])',
    'luda_market_create(uuid,uuid,text,text,text,text,bigint,text[])', 'luda_market_remove(uuid,uuid)', 'luda_market_buy(uuid,uuid,numeric)', 'luda_market_finish(uuid,text,text)',
    'luda_flash_post(uuid,text,text,text,bigint,bigint)', 'luda_flash_take(uuid,uuid)', 'luda_flash_drop(uuid,uuid)', 'luda_flash_finish(uuid,text,text)',
    'luda_uname(uuid)', 'luda_features_mine(uuid)', 'luda_market_list(uuid,text)', 'luda_flash_list(uuid,text)', 'luda_auto_release(uuid)',
    'luda_admin_bills(text)', 'luda_admin_escrows(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
