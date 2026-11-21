-- Fingerprint / Face ID (WebAuthn passkeys bound to the phone) to approve payments instead of typing the PIN.
-- We store only the public key; the private key never leaves the phone's secure chip.
create table if not exists public.passkeys (
  id          text primary key,                 -- credential id (base64url)
  user_id     uuid not null references public.profiles (user_id) on delete cascade,
  public_key  text not null,                    -- SPKI, base64url
  alg         int not null,                     -- -7 = ES256, -257 = RS256
  counter     bigint not null default 0,
  device      text,
  created_at  timestamptz not null default now()
);
create index if not exists passkeys_user on public.passkeys (user_id);
alter table public.passkeys enable row level security;

-- One short-lived challenge per user for the next fingerprint check (single use).
alter table public.profiles add column if not exists bio_challenge text;
alter table public.profiles add column if not exists bio_challenge_exp timestamptz;

-- One account per email (case-insensitive). Usernames are already unique.
create unique index if not exists profiles_email_unique on public.profiles (lower(email));
