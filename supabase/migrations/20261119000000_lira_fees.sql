-- Lira fees (v1.9.0, owner 2026-11-04): every Luda fee is priced and shown in lira.
-- Withdrawal fee: taken from the Lira wallet when it has enough, otherwise the same value in Naira.
-- P2P fee: priced in lira (0.5%, min ₺1, max ₺25), collected from the held Naira at the trade's own rate.

alter table public.withdrawals add column if not exists fee_currency text not null default 'NGN';
alter table public.p2p_orders add column if not exists fee_try bigint;

create or replace function public.luda_withdraw2(p_user uuid, p_reference text, p_amount bigint, p_fee bigint, p_fee_cur text,
  p_bank_code text, p_bank_name text, p_account text, p_name text, p_recipient text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lines jsonb;
begin
  if p_fee_cur not in ('NGN', 'TRY') then raise exception 'bad_currency'; end if;
  insert into withdrawals (reference, user_id, amount_minor, fee_minor, fee_currency, bank_code, bank_name, account_number, account_name, recipient_code)
  values (p_reference, p_user, p_amount, p_fee, p_fee_cur, p_bank_code, p_bank_name, p_account, p_name, p_recipient);
  lines := jsonb_build_array(jsonb_build_object('user_id', p_user, 'currency', 'NGN', 'amount_minor', -p_amount, 'kind', 'withdraw', 'ref', p_reference,
           'meta', jsonb_build_object('bank', p_bank_name, 'account', right(p_account, 4))));
  if p_fee > 0 then
    lines := lines || jsonb_build_object('user_id', p_user, 'currency', p_fee_cur, 'amount_minor', -p_fee, 'kind', 'withdraw_fee', 'ref', p_reference);
  end if;
  return luda_post(lines);
end $$;

-- Failed/reversed gives the money and the fee back once, each in the currency it was taken in.
create or replace function public.luda_withdraw_settle(p_reference text, p_status text, p_transfer text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w withdrawals%rowtype; lines jsonb;
begin
  if p_status not in ('paid', 'failed', 'reversed') then raise exception 'bad_status'; end if;
  update withdrawals set status = p_status, transfer_code = coalesce(p_transfer, transfer_code), note = p_note, updated_at = now()
   where reference = p_reference
     and (status = 'processing' or (status = 'paid' and p_status = 'reversed'))
  returning * into w;
  if not found then return jsonb_build_object('ok', true, 'already', true); end if;
  if p_status = 'paid' then return jsonb_build_object('ok', true, 'status', 'paid'); end if;
  if w.fee_currency = w.currency or w.fee_minor = 0 then
    lines := jsonb_build_array(jsonb_build_object('user_id', w.user_id, 'currency', w.currency,
             'amount_minor', w.amount_minor + case when w.fee_currency = w.currency then w.fee_minor else 0 end, 'kind', 'withdraw_reversal', 'ref', w.reference,
             'meta', jsonb_build_object('reason', p_status)));
  else
    lines := jsonb_build_array(
      jsonb_build_object('user_id', w.user_id, 'currency', w.currency, 'amount_minor', w.amount_minor, 'kind', 'withdraw_reversal', 'ref', w.reference, 'meta', jsonb_build_object('reason', p_status)),
      jsonb_build_object('user_id', w.user_id, 'currency', w.fee_currency, 'amount_minor', w.fee_minor, 'kind', 'withdraw_reversal', 'ref', w.reference, 'meta', jsonb_build_object('reason', p_status, 'fee', true)));
  end if;
  return luda_post(lines);
end $$;

create or replace function public.luda_p2p_set_fee_try(p_order uuid, p_fee bigint) returns void
language sql security definer set search_path = public as $$
  update p2p_orders set fee_try = p_fee where id = p_order and fee_try is null
$$;

revoke all on function public.luda_withdraw2(uuid, text, bigint, bigint, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.luda_withdraw_settle(text, text, text, text) from public, anon, authenticated;
revoke all on function public.luda_p2p_set_fee_try(uuid, bigint) from public, anon, authenticated;
