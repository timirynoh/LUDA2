-- Real-time document KYC with Didit (passport / ID / residence permit + live selfie + face match),
-- for students of every nationality. Dojah (NIN/BVN) stays as an option for Nigerians.
alter table public.profiles add column if not exists kyc_session_id text;   -- latest Didit session
alter table public.profiles add column if not exists kyc_doc_hash text;     -- SHA-256 of document type+country+number (never the number itself)
alter table public.profiles add column if not exists kyc_country text;
-- One identity document can verify only one Luda account.
create unique index if not exists profiles_kyc_doc_unique on public.profiles (kyc_doc_hash) where kyc_doc_hash is not null;
-- "pending" = submitted, Didit is still deciding (or a manual review is running).
alter table public.profiles drop constraint if exists profiles_kyc_status_check;
alter table public.profiles add constraint profiles_kyc_status_check check (kyc_status in ('none', 'pending', 'verified', 'failed'));
