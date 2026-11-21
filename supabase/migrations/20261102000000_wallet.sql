-- Luda real-money wallet: accounts, balances (NGN + TRY), ledger, tickets, withdrawals.
-- Every balance change goes through luda_post(), which applies all lines of a
-- movement in one transaction, never lets a balance go below zero, and is
-- idempotent: the same (user, currency, kind, ref) can only be posted once.
-- The app never touches these tables directly: only Edge Functions (service role).

create table if not exists public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  username         text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  full_name        text not null check (length(full_name) between 2 and 80),
  email            text not null,
  country          text,
  kyc_status       text not null default 'none' check (kyc_status in ('none', 'verified', 'failed')),
  kyc_name         text,           -- legal name returned by the KYC provider
  kyc_dob          date,
  kyc_id_type      text,           -- nin | bvn
  kyc_id_last4     text,
  kyc_at           timestamptz,
  kyc_tries        int not null default 0,
  kyc_tries_day    date,
  pin_hash         text,
  pin_salt         text,
  pin_fails        int not null default 0,
  pin_locked_until timestamptz,
  frozen           boolean not null default false, -- set by the owner to stop all money movement
  created_at       timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id       uuid not null references public.profiles (user_id) on delete restrict,
  currency      text not null check (currency in ('NGN', 'TRY')),
  balance_minor bigint not null default 0 check (balance_minor >= 0), -- kobo / kuruş
  primary key (user_id, currency)
);

create table if not exists public.ledger (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles (user_id) on delete restrict,
  currency      text not null,
  amount_minor  bigint not null check (amount_minor <> 0), -- + credit, - debit
  balance_after bigint not null,
  kind          text not null, -- deposit | withdraw | withdraw_fee | withdraw_reversal | convert | send | receive | ticket
  ref           text not null,
  meta          jsonb,
  at            timestamptz not null default now(),
  unique (user_id, currency, kind, ref)
);
create index if not exists ledger_user_at on public.ledger (user_id, at desc);

create table if not exists public.tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (user_id),
  code         text not null unique,
  item         jsonb not null,
  base_amount  numeric not null, -- TL price
  paid_minor   bigint not null,
  paid_currency text not null,
  status       text not null default 'valid' check (status in ('valid', 'used', 'refunded')),
  created_at   timestamptz not null default now()
);
create index if not exists tickets_user on public.tickets (user_id, created_at desc);

create table if not exists public.withdrawals (
  reference       text primary key,
  user_id         uuid not null references public.profiles (user_id),
  amount_minor    bigint not null check (amount_minor > 0),
  fee_minor       bigint not null default 0,
  currency        text not null default 'NGN',
  bank_code       text not null,
  bank_name       text,
  account_number  text not null,
  account_name    text not null,
  provider        text not null default 'paystack',
  recipient_code  text,
  transfer_code   text,
  status          text not null default 'processing' check (status in ('processing', 'paid', 'failed', 'reversed')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists withdrawals_user on public.withdrawals (user_id, created_at desc);

-- Deposits reuse the payments table from Phase 1.
alter table public.payments add column if not exists user_id uuid references public.profiles (user_id);
alter table public.payments add column if not exists fee_minor bigint not null default 0;
alter table public.payments add column if not exists credit_minor bigint; -- what lands in the wallet

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger enable row level security;
alter table public.tickets enable row level security;
alter table public.withdrawals enable row level security;

/* ------------------------------ money functions ------------------------------ */

-- entries: [{user_id, currency, amount_minor, kind, ref, meta}]
create or replace function public.luda_post(entries jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb; bal bigint; out jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) = 0 then raise exception 'bad_entries'; end if;
  -- frozen accounts can still RECEIVE refunds/reversals, but cannot be debited
  if exists (select 1 from jsonb_array_elements(entries) x join profiles p on p.user_id = (x->>'user_id')::uuid
             where p.frozen and (x->>'amount_minor')::bigint < 0) then
    raise exception 'account_frozen';
  end if;
  for e in select value from jsonb_array_elements(entries) order by value->>'user_id', value->>'currency' loop
    insert into wallets (user_id, currency) values ((e->>'user_id')::uuid, e->>'currency') on conflict do nothing;
  end loop;
  begin
    -- same lock order everywhere avoids deadlocks
    for e in select value from jsonb_array_elements(entries) order by value->>'user_id', value->>'currency' loop
      update wallets set balance_minor = balance_minor + (e->>'amount_minor')::bigint
       where user_id = (e->>'user_id')::uuid and currency = e->>'currency'
         and balance_minor + (e->>'amount_minor')::bigint >= 0
      returning balance_minor into bal;
      if not found then raise exception 'insufficient_funds'; end if;
      insert into ledger (user_id, currency, amount_minor, balance_after, kind, ref, meta)
      values ((e->>'user_id')::uuid, e->>'currency', (e->>'amount_minor')::bigint, bal, e->>'kind', e->>'ref', e->'meta');
      out := out || jsonb_build_object('user_id', e->>'user_id', 'currency', e->>'currency', 'balance_minor', bal);
    end loop;
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true); -- already posted: nothing changed
  end;
  return jsonb_build_object('ok', true, 'balances', out);
end $$;

-- Marks a pending deposit paid and credits the wallet, once.
create or replace function public.luda_deposit_paid(p_reference text, p_tx text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype;
begin
  update payments set status = 'paid', provider_tx_id = p_tx, paid_at = now()
   where reference = p_reference and status = 'pending' and purpose = 'deposit'
  returning * into p;
  if not found then return jsonb_build_object('ok', true, 'already', true); end if;
  return luda_post(jsonb_build_array(jsonb_build_object(
    'user_id', p.user_id, 'currency', p.currency, 'amount_minor', p.credit_minor, 'kind', 'deposit', 'ref', p.reference,
    'meta', jsonb_build_object('provider', p.provider, 'charged', p.amount_minor, 'fee', p.fee_minor))));
end $$;

-- Pays for a ticket from the wallet and stores it, in one transaction.
create or replace function public.luda_buy_ticket(p_user uuid, p_currency text, p_amount bigint, p_base numeric, p_code text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tickets%rowtype; r jsonb;
begin
  insert into tickets (user_id, code, item, base_amount, paid_minor, paid_currency)
  values (p_user, p_code, p_item, p_base, p_amount, p_currency) returning * into t;
  r := luda_post(jsonb_build_array(jsonb_build_object('user_id', p_user, 'currency', p_currency, 'amount_minor', -p_amount,
       'kind', 'ticket', 'ref', t.id::text, 'meta', jsonb_build_object('label', p_item->>'label', 'code', p_code))));
  return jsonb_build_object('ok', true, 'ticket', to_jsonb(t), 'post', r);
end $$;

-- Takes amount + fee from the wallet and records a withdrawal to send.
create or replace function public.luda_withdraw(p_user uuid, p_reference text, p_amount bigint, p_fee bigint, p_bank_code text,
  p_bank_name text, p_account text, p_name text, p_recipient text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lines jsonb;
begin
  insert into withdrawals (reference, user_id, amount_minor, fee_minor, bank_code, bank_name, account_number, account_name, recipient_code)
  values (p_reference, p_user, p_amount, p_fee, p_bank_code, p_bank_name, p_account, p_name, p_recipient);
  lines := jsonb_build_array(jsonb_build_object('user_id', p_user, 'currency', 'NGN', 'amount_minor', -p_amount, 'kind', 'withdraw', 'ref', p_reference,
           'meta', jsonb_build_object('bank', p_bank_name, 'account', right(p_account, 4))));
  if p_fee > 0 then
    lines := lines || jsonb_build_object('user_id', p_user, 'currency', 'NGN', 'amount_minor', -p_fee, 'kind', 'withdraw_fee', 'ref', p_reference);
  end if;
  return luda_post(lines);
end $$;

-- Final status of a withdrawal. failed/reversed gives the money (and fee) back, once.
create or replace function public.luda_withdraw_settle(p_reference text, p_status text, p_transfer text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w withdrawals%rowtype;
begin
  if p_status not in ('paid', 'failed', 'reversed') then raise exception 'bad_status'; end if;
  update withdrawals set status = p_status, transfer_code = coalesce(p_transfer, transfer_code), note = p_note, updated_at = now()
   where reference = p_reference
     and (status = 'processing' or (status = 'paid' and p_status = 'reversed'))
  returning * into w;
  if not found then return jsonb_build_object('ok', true, 'already', true); end if;
  if p_status = 'paid' then return jsonb_build_object('ok', true, 'status', 'paid'); end if;
  return luda_post(jsonb_build_array(jsonb_build_object('user_id', w.user_id, 'currency', w.currency,
         'amount_minor', w.amount_minor + w.fee_minor, 'kind', 'withdraw_reversal', 'ref', w.reference,
         'meta', jsonb_build_object('reason', p_status))));
end $$;

-- Sum of a user's movements of some kinds over the last N hours (for daily limits), as a positive number.
create or replace function public.luda_spent(p_user uuid, p_currency text, p_kinds text[], p_hours int) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(abs(sum(amount_minor)), 0)::bigint from ledger
   where user_id = p_user and currency = p_currency and kind = any (p_kinds) and at > now() - make_interval(hours => p_hours)
$$;

-- Only the server may call these.
revoke all on function public.luda_post(jsonb) from public, anon, authenticated;
revoke all on function public.luda_deposit_paid(text, text) from public, anon, authenticated;
revoke all on function public.luda_buy_ticket(uuid, text, bigint, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.luda_withdraw(uuid, text, bigint, bigint, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.luda_withdraw_settle(text, text, text, text) from public, anon, authenticated;
revoke all on function public.luda_spent(uuid, text, text[], int) from public, anon, authenticated;
