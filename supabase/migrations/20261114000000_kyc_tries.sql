-- ID checks (owner's rule 2026-11-04): 2 attempts per day; remember when the current attempt started so the app can
-- stop waiting after a few minutes and offer "try again" or "contact the Luda team".
alter table public.profiles add column if not exists kyc_started_at timestamptz;
