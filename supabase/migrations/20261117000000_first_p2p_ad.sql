-- The first live P2P listing (owner's request 2026-11-04): the Luda owner @rynoh sells lira for Naira at the market
-- rate of the day (₦26.97 per ₺1 from the live /api/rate), ₺100–₺5,000 per order, bank transfer or cash in Gönyeli,
-- Lefkoşa. Only if @rynoh is ID-verified and has no ad yet; the price can be changed any time in Exchange → P2P → My ad.
insert into public.p2p_ads (user_id, side, asset, price, min_try, max_try, available_try, methods, city, area, terms)
select p.user_id, 'sell', 'TRY', 26.97, 10000, 500000, 500000, '{bank,cash}', 'lefkosa', 'Gönyeli',
       'Luda team. Bank transfer or cash in Gönyeli, Lefkoşa. I reply fast.'
  from public.profiles p
 where p.username = 'rynoh' and p.kyc_status = 'verified' and not p.frozen
   and not exists (select 1 from public.p2p_ads a where a.user_id = p.user_id and a.status in ('active', 'paused'));
