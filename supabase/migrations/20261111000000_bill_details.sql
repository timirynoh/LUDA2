-- Bill pay v2: the details the provider needs (name on the bill, district, IBAN, month…) and the time we promise.
alter table public.bills add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.bills add column if not exists eta_at timestamptz;

create or replace function public.luda_bill_create(p_user uuid, p_type text, p_provider text, p_account text, p_amount bigint, p_fee bigint, p_files text[], p_details jsonb, p_eta timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eid uuid; b bills%rowtype;
begin
  eid := luda_hold('bill', p_user, null, 'TRY', p_amount + p_fee, p_fee,
    jsonb_build_object('type', p_type, 'provider', p_provider, 'account', right(p_account, 4)));
  insert into bills (user_id, type, provider, account_ref, amount_minor, fee_minor, escrow_id, files, details, eta_at)
  values (p_user, p_type, p_provider, p_account, p_amount, p_fee, eid, coalesce(p_files, '{}'), coalesce(p_details, '{}'::jsonb), p_eta) returning * into b;
  return to_jsonb(b);
end $$;
revoke all on function public.luda_bill_create(uuid,text,text,text,bigint,bigint,text[],jsonb,timestamptz) from public, anon, authenticated;
