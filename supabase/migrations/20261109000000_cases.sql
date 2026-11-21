-- Support cases / appeals: a user explains a problem (ID check, payment, withdrawal, frozen account…)
-- and can attach photos; the owner answers and resolves from the admin page.
create table if not exists public.cases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (user_id) on delete cascade,
  category    text not null check (category in ('kyc', 'payment', 'withdrawal', 'account', 'other')),
  subject     text not null,
  reference   text,                 -- e.g. a top-up / withdrawal reference
  status      text not null default 'open' check (status in ('open', 'waiting_user', 'resolved', 'rejected')),
  resolution  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cases_status on public.cases (status, updated_at desc);
create index if not exists cases_user on public.cases (user_id, created_at desc);

create table if not exists public.case_messages (
  id          bigserial primary key,
  case_id     uuid not null references public.cases (id) on delete cascade,
  author      text not null check (author in ('user', 'admin')),
  author_name text,
  body        text not null,
  files       text[] not null default '{}', -- paths in the private "case-files" storage bucket
  at          timestamptz not null default now()
);
create index if not exists case_messages_case on public.case_messages (case_id, id);

alter table public.cases enable row level security;
alter table public.case_messages enable row level security;

-- Private bucket for case photos (only the server can read/write; the owner sees them via short-lived links).
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('case-files', 'case-files', false) on conflict (id) do nothing;
  end if;
end $$;
