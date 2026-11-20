// Builds Env + Deps from Supabase secrets (Deno.env). Used by the "api" and "pay-webhook" functions.
import postgres from 'npm:postgres@3.4.5'
import { restDb } from './db.ts'
import type { Deps, Env } from './handlers.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void }

export function setup(): { env: Env; deps: Deps } {
  const g = (k: string) => Deno.env.get(k)
  // SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected by Supabase.
  // LUDA_SERVICE_KEY / LUDA_ANON_KEY let the owner supply keys by hand if ever needed.
  const serviceKey = g('LUDA_SERVICE_KEY') || g('SUPABASE_SERVICE_ROLE_KEY') || ''
  const env: Env = {
    APP_URL: g('APP_URL') ?? '', ALLOWED_ORIGINS: g('ALLOWED_ORIGINS'),
    SUPABASE_URL: g('SUPABASE_URL') ?? '', AUTH_KEY: g('LUDA_ANON_KEY') || g('SUPABASE_ANON_KEY') || serviceKey,
    PAYSTACK_SECRET_KEY: g('PAYSTACK_SECRET_KEY'), FLW_SECRET_KEY: g('FLW_SECRET_KEY'), FLW_SECRET_HASH: g('FLW_SECRET_HASH'),
    FX_FIXED_RATE: g('FX_FIXED_RATE'), FX_FALLBACK_RATE: g('FX_FALLBACK_RATE'), FX_MARGIN: g('FX_MARGIN'),
    DEPOSIT_FEE_PCT: g('DEPOSIT_FEE_PCT'), DEPOSIT_FEE_FLAT: g('DEPOSIT_FEE_FLAT'), DEPOSIT_FEE_FLAT_WAIVE_BELOW: g('DEPOSIT_FEE_FLAT_WAIVE_BELOW'),
    DEPOSIT_FEE_CAP: g('DEPOSIT_FEE_CAP'), WITHDRAW_FEE: g('WITHDRAW_FEE'),
    DOJAH_APP_ID: g('DOJAH_APP_ID'), DOJAH_SECRET_KEY: g('DOJAH_SECRET_KEY'), DOJAH_BASE_URL: g('DOJAH_BASE_URL'),
    SELL_OPERATORS: g('SELL_OPERATORS'), SERVICE_KEY: serviceKey, ADMIN_EMAILS: g('ADMIN_EMAILS'), PAYSTACK_CUSTOMER_PAYS_FEE: g('PAYSTACK_CUSTOMER_PAYS_FEE'), FLW_CUSTOMER_PAYS_FEE: g('FLW_CUSTOMER_PAYS_FEE'), DIDIT_API_KEY: g('DIDIT_API_KEY'), DIDIT_WORKFLOW_ID: g('DIDIT_WORKFLOW_ID'), DIDIT_WEBHOOK_SECRET: g('DIDIT_WEBHOOK_SECRET'), DIDIT_BASE_URL: g('DIDIT_BASE_URL'), TWILIO_ACCOUNT_SID: g('TWILIO_ACCOUNT_SID'), TWILIO_AUTH_TOKEN: g('TWILIO_AUTH_TOKEN'), TWILIO_VERIFY_SID: g('TWILIO_VERIFY_SID'), FOREIGN_CURRENCIES: g('FOREIGN_CURRENCIES'), FOREIGN_FEE_PCT: g('FOREIGN_FEE_PCT'), FX_TRY_RATES: g('FX_TRY_RATES'),
  }
  if (!serviceKey || !env.APP_URL) console.error('Luda: missing APP_URL or service key, see docs/GO_LIVE.md')
  // If Supabase's data API (PostgREST) gets stuck, wake it with a reload message straight through the database
  // (SUPABASE_DB_URL is injected by Supabase). This is what fixed the 2026-11-20 18:07 outage by hand.
  const dbUrl = g('SUPABASE_DB_URL')
  const heal = dbUrl ? async () => {
    const sql = postgres(dbUrl, { max: 1, prepare: false, connect_timeout: 5, idle_timeout: 2 })
    try { await sql`select pg_notify('pgrst', 'reload schema'), pg_notify('pgrst', 'reload config')` } finally { await sql.end({ timeout: 2 }) }
    console.log('Luda: database API was stuck; asked it to reconnect')
  } : undefined
  return { env, deps: { db: restDb(env.SUPABASE_URL, serviceKey, fetch, heal) } }
}

export const serve = (h: (r: Request) => Promise<Response>) => Deno.serve(h)
