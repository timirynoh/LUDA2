-- v1.38.0 (owner, 2026-11-20): Home banners can have a photo (made with an image AI or a real photo).
-- Stored as a compressed data URL (JPEG/PNG/WebP, max ~300 KB) so it needs no storage bucket and loads with the banner.
alter table public.banners add column if not exists image text not null default '' check (length(image) <= 420000);

create or replace function public.luda_banners_live() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'cta', cta, 'link', link, 'emoji', emoji, 'theme', theme, 'image', nullif(image, '')) order by sort, created_at desc), '[]'::jsonb)
    from banners where active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
$$;

create or replace function public.luda_banner_save(p_id uuid, p jsonb, p_by uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b banners%rowtype;
begin
  if p_id is null then
    insert into banners (title, body, cta, link, emoji, theme, image, starts_at, ends_at, active, sort, created_by)
    values (p->>'title', coalesce(p->>'body', ''), coalesce(p->>'cta', 'Open'), coalesce(p->>'link', '/'), coalesce(p->>'emoji', '✨'), coalesce(p->>'theme', 'mint'), coalesce(p->>'image', ''),
            nullif(p->>'starts_at', '')::timestamptz, nullif(p->>'ends_at', '')::timestamptz, coalesce((p->>'active')::boolean, true), coalesce((p->>'sort')::int, 0), p_by)
    returning * into b;
  else
    update banners set title = p->>'title', body = coalesce(p->>'body', ''), cta = coalesce(p->>'cta', 'Open'), link = coalesce(p->>'link', '/'),
      emoji = coalesce(p->>'emoji', '✨'), theme = coalesce(p->>'theme', 'mint'), image = coalesce(p->>'image', image), starts_at = nullif(p->>'starts_at', '')::timestamptz,
      ends_at = nullif(p->>'ends_at', '')::timestamptz, active = coalesce((p->>'active')::boolean, true), sort = coalesce((p->>'sort')::int, 0), updated_at = now()
    where id = p_id returning * into b;
    if not found then raise exception 'not_found'; end if;
  end if;
  return to_jsonb(b);
end $$;

revoke execute on function public.luda_banners_live() from public, anon, authenticated;
revoke execute on function public.luda_banner_save(uuid, jsonb, uuid) from public, anon, authenticated;
