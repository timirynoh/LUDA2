// Builds Env + Deps from Supabase secrets (Deno.env). Used by every pay-* function.
import { restDb } from './db.ts'
import type { Deps, Env } from './handlers.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void }

export function setup(): { env: Env; deps: Deps } {
  const g = (k: string) => Deno.env.get(k)
  const env: Env = {
    APP_URL: g('APP_URL') ?? '', ALLOWED_ORIGINS: g('ALLOWED_ORIGINS'),
    PAYSTACK_SECRET_KEY: g('PAYSTACK_SECRET_KEY'), FLW_SECRET_KEY: g('FLW_SECRET_KEY'), FLW_SECRET_HASH: g('FLW_SECRET_HASH'),
    CHARGE_CURRENCY: g('CHARGE_CURRENCY'), FX_FIXED_RATE: g('FX_FIXED_RATE'), FX_FALLBACK_RATE: g('FX_FALLBACK_RATE'), FX_MARGIN: g('FX_MARGIN'),
  }
  // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically on Supabase.
  return { env, deps: { db: restDb(g('SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!) } }
}

export const serve = (h: (r: Request) => Promise<Response>) => Deno.serve(h)
