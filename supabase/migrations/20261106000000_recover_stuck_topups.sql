-- A top-up the provider later confirms as paid must be credited even if Luda had marked it
-- "failed" (e.g. the customer retried on the same checkout) or "mismatch" (e.g. the provider
-- added its own fee on top). The server only calls this after re-verifying with the provider;
-- crediting stays exactly-once (status check here + unique ledger entry per reference).
create or replace function public.luda_deposit_paid(p_reference text, p_tx text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype;
begin
  update payments set status = 'paid', provider_tx_id = p_tx, paid_at = now()
   where reference = p_reference and status in ('pending', 'failed', 'mismatch') and purpose = 'deposit'
  returning * into p;
  if not found then return jsonb_build_object('ok', true, 'already', true); end if;
  return luda_post(jsonb_build_array(jsonb_build_object(
    'user_id', p.user_id, 'currency', p.credit_currency, 'amount_minor', p.credit_minor, 'kind', 'deposit', 'ref', p.reference,
    'meta', jsonb_build_object('provider', p.provider, 'charged', p.amount_minor, 'charged_currency', p.currency, 'fee', p.fee_minor))));
end $$;
revoke all on function public.luda_deposit_paid(text, text) from public, anon, authenticated;
