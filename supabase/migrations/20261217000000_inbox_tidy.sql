-- v1.37.3 (owner: 'notifications I already read keep popping up like new'):
-- 1. The inbox list keeps unread items and items read in the last 24 hours; older read items are left out.
-- 2. luda_known_device: a 'new sign-in' alert is only sent for a phone/browser the account hasn't used before.
create or replace function public.luda_inbox(p_user uuid, p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'emoji', emoji, 'title', title, 'body', body, 'url', url, 'read', read_at is not null, 'at', created_at) order by id desc)
      from (select * from inbox where user_id = p_user and (read_at is null or read_at > now() - interval '24 hours') order by id desc limit p_limit) x), '[]'::jsonb),
    'unread', (select count(*) from inbox where user_id = p_user and read_at is null))
$$;

create or replace function public.luda_known_device(p_user uuid, p_dev text) returns boolean
language plpgsql security definer set search_path = public as $$
declare known boolean;
begin
  if coalesce(p_dev, '') = '' then return false; end if;
  select exists (select 1 from account_signals where user_id = p_user and kind = 'dev' and hash = left(p_dev, 64)) into known;
  insert into account_signals (user_id, kind, hash) values (p_user, 'dev', left(p_dev, 64))
    on conflict (user_id, kind, hash) do update set last_at = now();
  return known;
end $$;
revoke all on function public.luda_known_device(uuid, text) from public, anon, authenticated;
revoke all on function public.luda_inbox(uuid, int) from public, anon, authenticated;
