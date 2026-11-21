import { useEffect, useState } from 'react'
import { FX_API } from '../config'
import { CURRENCIES, FALLBACK_RATES } from './data'

export interface Rates { rates: Record<string, number>; live: boolean; updated: number }

let cache: Rates | null = null
let inflight: Promise<Rates> | null = null

async function fetchRates(): Promise<Rates> {
  try {
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 6000)
    const r = await fetch(FX_API, { signal: ctl.signal })
    clearTimeout(to)
    const j = await r.json()
    if (j?.result !== 'success') throw new Error('bad payload')
    const rates: Record<string, number> = { ...FALLBACK_RATES }
    for (const c of Object.keys(CURRENCIES)) if (j.rates[c]) rates[c] = j.rates[c]
    return { rates, live: true, updated: (j.time_last_update_unix ?? Date.now() / 1000) * 1000 }
  } catch {
    return { rates: FALLBACK_RATES, live: false, updated: Date.now() }
  }
}

export function useRates() {
  const [r, setR] = useState<Rates>(cache ?? { rates: FALLBACK_RATES, live: false, updated: Date.now() })
  useEffect(() => {
    if (cache) return
    inflight ??= fetchRates()
    inflight.then((x) => { cache = x; setR(x) })
  }, [])
  return r
}

/** Convert `amount` of `from` into `to` using USD-based cross rates. */
export const convert = (rates: Record<string, number>, amount: number, from: string, to: string) =>
  (amount / (rates[from] ?? 1)) * (rates[to] ?? 1)

export function fmt(amount: number, cur: string, opts: { compact?: boolean } = {}) {
  const sym = CURRENCIES[cur]?.symbol ?? cur
  const digits = Math.abs(amount) >= 1000 || ['NGN', 'XAF', 'CDF', 'UGX', 'KES', 'SDG'].includes(cur) ? 0 : 2
  const n = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits, minimumFractionDigits: digits,
    notation: opts.compact && Math.abs(amount) >= 1e6 ? 'compact' : 'standard',
  }).format(amount)
  return sym.length > 2 ? `${n} ${sym}` : `${sym}${n}`
}
