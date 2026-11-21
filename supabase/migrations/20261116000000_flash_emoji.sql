-- Flash jobs show an emoji that matches the job (owner 2026-11-04): picked by the poster or matched from the title.
alter table public.flash_jobs add column if not exists emoji text not null default '⚡' check (length(emoji) <= 8);
create or replace function public.luda_flash_emoji(p_job uuid, p_emoji text) returns void
language sql security definer set search_path = public as $$ update flash_jobs set emoji = p_emoji where id = p_job $$;
revoke all on function public.luda_flash_emoji(uuid, text) from public, anon, authenticated;
