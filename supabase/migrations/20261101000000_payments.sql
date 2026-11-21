-- Luda payments (Phase 1: pay for things via Paystack / Flutterwave).
-- Only the server (service role, inside Edge Functions) can read or write these
-- tables. The app never talks to them directly, so RLS is on with no policies.

create table if not exists public.payments (
  reference        text primary key,                 -- our unguessable reference, sent to the provider
  provider         text not null check (provider in ('paystack', 'flutterwave')),
  purpose          text not null,                    -- e.g. 'ticket'
  status           text not null default 'pending'
                   check (status in ('pending', 'paid', 'failed', 'mismatch')),
  amount_minor     bigint not null check (amount_minor > 0), -- what we charge, in kobo (NGN x 100)
  currency         text not null,                    -- charge currency, e.g. 'NGN'
  base_amount      numeric not null,                 -- price in the item's own currency (TL for tickets)
  base_currency    text not null,
  fx_rate          numeric not null,                 -- base -> charge rate used, incl. margin
  email            text not null,
  item             jsonb not null,                   -- what was bought (validated server-side)
  provider_tx_id   text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);

-- Append-only audit log: every init, webhook and verification is recorded.
create table if not exists public.payment_events (
  id          bigserial primary key,
  reference   text not null,
  kind        text not null,                         -- init | webhook | verify | paid | mismatch | failed
  payload     jsonb,
  at          timestamptz not null default now()
);
create index if not exists payment_events_ref on public.payment_events (reference);

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
