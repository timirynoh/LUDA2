// TL -> charge-currency rate for checkout. A fixed rate set by the owner wins;
// otherwise a live rate; otherwise the fallback rate. A margin covers FX costs.
import type { Fetch } from './providers.ts'

export interface FxEnv { CHARGE_CURRENCY?: string; FX_FIXED_RATE?: string; FX_FALLBACK_RATE?: string; FX_MARGIN?: string }

export async function chargeRate(base: string, env: FxEnv, f: Fetch = fetch): Promise<{ currency: string; rate: number; source: string }> {
  const currency = (env.CHARGE_CURRENCY || 'NGN').toUpperCase()
  const margin = env.FX_MARGIN ? Number(env.FX_MARGIN) : 0.008
  if (base === currency) return { currency, rate: 1, source: 'same' }
  let rate = Number(env.FX_FIXED_RATE || 0), source = 'fixed'
  if (!rate) {
    try {
      const r = await f(`https://open.er-api.com/v6/latest/${base}`, { signal: AbortSignal.timeout(5000) })
      rate = Number(((await r.json()) as { rates?: Record<string, number> }).rates?.[currency] ?? 0); source = 'live'
    } catch { rate = 0 }
  }
  if (!rate) { rate = Number(env.FX_FALLBACK_RATE || 0); source = 'fallback' }
  if (!rate || !Number.isFinite(rate)) throw new Error('No exchange rate available, try again shortly')
  return { currency, rate: rate * (1 + margin), source }
}
