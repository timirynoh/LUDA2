-- v1.35.0: residency fees (state hospital medicals, tax office permit fee) are paid like bills: the student pastes the
-- payment page link from the official site + a screenshot, pays Luda at checkout, the team pays it and adds the receipt.
alter table public.bills drop constraint if exists bills_type_check;
alter table public.bills add constraint bills_type_check check (type in ('electricity', 'water', 'internet', 'phone', 'rent', 'other', 'residency'));

insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-bills-residency', 'help', 'bills', 5, 'Can Luda pay my residency permit fees?', 'Yes. Bills → Residency fees. Pick State hospital (medicals) or Tax office (permit fee). On the official site, tap the payment button, copy the payment page link and take a screenshot showing the amount. Paste the link in Luda, add the screenshot and pay by card, bank transfer or USSD. The Luda team pays it on that page and adds the official receipt. Never send your portal password: we only need the payment page.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
