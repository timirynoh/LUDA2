-- v1.33.0: escrow services paused "until further notice" (owner, 2026-11-18). Nothing is deleted: tables, functions
-- and flows stay, so it can ship again later (server secret ESCROW_ENABLED=true + app ESCROW flag in config.ts).
-- While paused: no new P2P ads/orders, no Verified Exchanger bond, no Market purchases through Luda, no Flash
-- 'pay through Luda'. Bills keep working (prepaid service). Flash stays as cash-only, Market as listings-only.

-- 1. Money already held for Flash requests nobody has accepted yet goes back to the poster (the request is cancelled).
--    The ledger trigger writes the inbox line ('… refunded') automatically.
do $$
declare j record;
begin
  for j in
    select f.id from public.flash_jobs f
    join public.escrows e on e.id = f.escrow_id
    where f.status = 'open' and e.status = 'held'
  loop
    perform public.luda_flash_finish(j.id, 'poster', 'Flash payments through Luda are paused. Your money is back in your wallet.');
  end loop;
end $$;

-- 2. P2P ads are paused (not removed), so they can come back with the service.
update public.p2p_ads set status = 'paused' where status = 'active';

-- 3. Market as listings only: sellers can add a WhatsApp number so buyers can reach them.
alter table public.listings add column if not exists contact text;
create or replace function public.luda_market_contact(p_listing uuid, p_seller uuid, p_contact text) returns void
language sql security definer set search_path = public as $$
  update listings set contact = nullif(p_contact, ''), updated_at = now() where id = p_listing and seller = p_seller;
$$;
revoke execute on function public.luda_market_contact(uuid, uuid, text) from public, anon, authenticated;
