// Tiny data layer over Supabase's REST API (PostgREST) using the service-role key.
// Only Edge Functions hold that key; it must never be shipped in the app.
import type { Fetch } from './providers.ts'

export interface PaymentRow {
  reference: string; provider: 'paystack' | 'flutterwave'; purpose: string
  status: 'pending' | 'paid' | 'failed' | 'mismatch'
  amount_minor: number; currency: string; base_amount: number; base_currency: string; fx_rate: number
  email: string; item: Record<string, unknown>; provider_tx_id?: string | null
  created_at?: string; paid_at?: string | null
}

export interface Db {
  insert(row: PaymentRow): Promise<void>
  get(reference: string): Promise<PaymentRow | null>
  /** Moves a pending payment to a final status. Returns false if it was no longer pending (idempotent). */
  settle(reference: string, status: 'paid' | 'failed' | 'mismatch', providerTxId?: string): Promise<boolean>
  recentByEmail(email: string, sinceIso: string): Promise<number>
  log(reference: string, kind: string, payload?: unknown): Promise<void>
}

export function restDb(url: string, serviceKey: string, f: Fetch = fetch): Db {
  const base = `${url.replace(/\/$/, '')}/rest/v1`
  // Legacy service_role keys are JWTs (sent in both headers); newer `sb_secret_…` keys go in `apikey` only.
  const auth: Record<string, string> = serviceKey.startsWith('sb_') ? { apikey: serviceKey } : { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const h = (extra: Record<string, string> = {}) => ({ ...auth, 'content-type': 'application/json', ...extra })
  const ok = async (r: Response) => { if (!r.ok) throw new Error(`Database error ${r.status}: ${await r.text()}`); return r }
  const q = encodeURIComponent
  return {
    async insert(row) { await ok(await f(`${base}/payments`, { method: 'POST', headers: h({ prefer: 'return=minimal' }), body: JSON.stringify(row) })) },
    async get(ref) {
      const r = await ok(await f(`${base}/payments?reference=eq.${q(ref)}&limit=1`, { headers: h() }))
      return ((await r.json()) as PaymentRow[])[0] ?? null
    },
    async settle(ref, status, txId) {
      const r = await ok(await f(`${base}/payments?reference=eq.${q(ref)}&status=eq.pending`, {
        method: 'PATCH', headers: h({ prefer: 'return=representation' }),
        body: JSON.stringify({ status, provider_tx_id: txId ?? null, paid_at: status === 'paid' ? new Date().toISOString() : null }),
      }))
      return ((await r.json()) as unknown[]).length > 0
    },
    async recentByEmail(email, since) {
      const r = await ok(await f(`${base}/payments?email=eq.${q(email)}&created_at=gte.${q(since)}&select=reference`, { headers: h({ prefer: 'count=exact', range: '0-0' }) }))
      return Number(r.headers.get('content-range')?.split('/')[1] ?? 0)
    },
    async log(ref, kind, payload) {
      await f(`${base}/payment_events`, { method: 'POST', headers: h({ prefer: 'return=minimal' }), body: JSON.stringify({ reference: ref, kind, payload: payload ?? null }) }).catch(() => {})
    },
  }
}
