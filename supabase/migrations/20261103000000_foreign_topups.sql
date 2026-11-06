-- Top-ups in other currencies (USD, GHS, KES, UGX, ZMW, XAF) via Flutterwave, credited to the Lira wallet.
-- payments.currency stays the charged currency; the new credit_currency says which wallet receives credit_minor.
alter table public.payments add column if not exists credit_currency text not null default 'NGN';

create or replace function public.luda_deposit_paid(p_reference text, p_tx text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype;
begin
  update payments set status = 'paid', provider_tx_id = p_tx, paid_at = now()
   where reference = p_reference and status = 'pending' and purpose = 'deposit'
  returning * into p;
  if not found then return jsonb_build_object('ok', true, 'already', true); end if;
  return luda_post(jsonb_build_array(jsonb_build_object(
    'user_id', p.user_id, 'currency', p.credit_currency, 'amount_minor', p.credit_minor, 'kind', 'deposit', 'ref', p.reference,
    'meta', jsonb_build_object('provider', p.provider, 'charged', p.amount_minor, 'charged_currency', p.currency, 'fee', p.fee_minor))));
end $$;
revoke all on function public.luda_deposit_paid(text, text) from public, anon, authenticated;
