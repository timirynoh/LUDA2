// Builds Env + Deps from Supabase secrets (Deno.env). Used by every pay-* function.
import { restDb } from './db.ts'
import type { Deps, Env } from './handlers.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void }

export function setup(): { env: Env; deps: Deps } {
  const g = (k: string) => Deno.env.get(k)
  const env: Env = {
    APP_URL: g('APP_URL') ?? '', ALLOWED_ORIGINS: g('ALLOWED_ORIGINS'),
    PAYSTACK_SECRET_KEY: g('PAYSTACK_SECRET_KEY'), FLW_SECRET_KEY: g('FLW_SECRET_KEY'), FLW_SECRET_HASH: g('FLW_SECRET_HASH'),
    CHARGE_CURRENCY: g('CHARGE_CURRENCY'), FX_FIXED_RATE: g('FX_FIXED_RATE'), FX_FALLBACK_RATE: g('FX_FALLBACK_RATE'), FX_MARGIN: g('FX_MARGIN'), SELL_OPERATORS: g('SELL_OPERATORS'),
  }
  // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically on Supabase.
  // LUDA_SERVICE_KEY lets the owner supply a secret key by hand if the automatic one is ever missing.
  const key = g('LUDA_SERVICE_KEY') || g('SUPABASE_SERVICE_ROLE_KEY')
  if (!key || !env.APP_URL) console.error('Luda payments: missing APP_URL or service key, see docs/GO_LIVE.md')
  return { env, deps: { db: restDb(g('SUPABASE_URL')!, key ?? '') } }
}

export const serve = (h: (r: Request) => Promise<Response>) => Deno.serve(h)
