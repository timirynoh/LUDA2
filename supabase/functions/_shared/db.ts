// Data layer. Production uses Supabase's REST API (PostgREST) with the service key;
// tests use the same interface over a real Postgres (PGlite). Money only ever moves
// through the SQL functions in migrations/*_wallet.sql.
import type { Fetch } from './providers.ts'

export interface PaymentRow {
  reference: string; provider: 'paystack' | 'flutterwave'; purpose: string
  status: 'pending' | 'paid' | 'failed' | 'mismatch'
  amount_minor: number; currency: string; base_amount: number; base_currency: string; fx_rate: number
  email: string; item: Record<string, unknown>; provider_tx_id?: string | null
  user_id?: string | null; fee_minor?: number; credit_minor?: number | null; credit_currency?: string
  created_at?: string; paid_at?: string | null
}

export interface Profile {
  user_id: string; username: string; full_name: string; email: string; country?: string | null
  kyc_status: 'none' | 'pending' | 'verified' | 'failed'; kyc_session_id?: string | null; kyc_doc_hash?: string | null; kyc_country?: string | null; kyc_at?: string | null; kyc_name?: string | null; kyc_dob?: string | null; kyc_id_type?: string | null; kyc_id_last4?: string | null
  kyc_tries: number; kyc_tries_day?: string | null; kyc_started_at?: string | null; university?: string | null; terms_version?: number; terms_at?: string | null; passcode_hash?: string | null; passcode_salt?: string | null; passcode_fails?: number; passcode_locked_until?: string | null; last_seen?: string | null; lang?: string
  pin_hash?: string | null; pin_salt?: string | null; pin_fails: number; pin_locked_until?: string | null
  frozen: boolean; created_at?: string; bio_challenge?: string | null; bio_challenge_exp?: string | null
  phone?: string | null; phone_verified_at?: string | null; money_hold_until?: string | null; frozen_by?: 'user' | 'admin' | null; is_admin?: boolean; invited_by?: string | null; streak?: number; last_checkin?: string | null
}

export interface Passkey { id: string; user_id: string; public_key: string; alg: number; counter: number; device?: string | null; created_at?: string }

export interface LedgerRow { id: number; currency: string; amount_minor: number; balance_after: number; kind: string; ref: string; meta: Record<string, unknown> | null; at: string }
export interface TicketRow { id: string; code: string; item: Record<string, unknown>; base_amount: number; paid_minor: number; paid_currency: string; status: string; created_at: string }
export interface WithdrawalRow {
  reference: string; user_id: string; amount_minor: number; fee_minor: number; currency: string; bank_code: string; bank_name: string | null
  account_number: string; account_name: string; status: 'processing' | 'paid' | 'failed' | 'reversed'; recipient_code?: string | null
  transfer_code?: string | null; note?: string | null; provider?: string | null; created_at: string
}
export interface Entry { user_id: string; currency: string; amount_minor: number; kind: string; ref: string; meta?: Record<string, unknown> }

export interface CaseRow { id: string; user_id: string; category: string; subject: string; reference: string | null; status: 'open' | 'waiting_user' | 'resolved' | 'rejected'; resolution: string | null; created_at: string; updated_at: string; user?: { username: string; full_name: string; email: string; kyc_status: string } }
export interface CaseMessage { id: number; case_id: string; author: 'user' | 'admin'; author_name: string | null; body: string; files: string[]; at: string }

export class MoneyError extends Error {}

export interface Db {
  // payments (deposits)
  insert(row: PaymentRow): Promise<void>
  get(reference: string): Promise<PaymentRow | null>
  settle(reference: string, status: 'paid' | 'failed' | 'mismatch', providerTxId?: string): Promise<boolean>
  recentByEmail(email: string, sinceIso: string): Promise<number>
  log(reference: string, kind: string, payload?: unknown): Promise<void>
  // accounts
  profile(userId: string): Promise<Profile | null>
  profileByUsername(username: string): Promise<Profile | null>
  profileByEmail(email: string): Promise<Profile | null>
  profileByPhone(phone: string): Promise<Profile | null>
  profileByKycSession(sessionId: string): Promise<Profile | null>
  /** Sliding-window rate limit: true = allowed (and counted). */
  hit(key: string, max: number, seconds: number): Promise<boolean>
  createProfile(p: Pick<Profile, 'user_id' | 'username' | 'full_name' | 'email'> & { country?: string }): Promise<Profile | 'taken'>
  updateProfile(userId: string, patch: Partial<Profile>): Promise<void>
  // reads
  balances(userId: string): Promise<Record<string, number>>
  history(userId: string, limit: number): Promise<LedgerRow[]>
  tickets(userId: string, limit: number): Promise<TicketRow[]>
  withdrawal(reference: string): Promise<WithdrawalRow | null>
  withdrawals(userId: string, limit: number): Promise<WithdrawalRow[]>
  depositedSince(userId: string, sinceIso: string, creditCurrency: string): Promise<number>
  pendingDeposits(userId: string, sinceIso: string): Promise<PaymentRow[]>
  deposits(userId: string, limit: number): Promise<PaymentRow[]>
  // money (SQL functions); MoneyError('insufficient_funds' | 'account_frozen') on refusal
  post(entries: Entry[]): Promise<{ duplicate?: boolean }>
  depositPaid(reference: string, providerTx: string): Promise<void>
  buyTicket(userId: string, currency: string, amountMinor: number, baseAmount: number, code: string, item: Record<string, unknown>): Promise<TicketRow>
  withdraw(userId: string, reference: string, amountMinor: number, feeMinor: number, feeCur: 'NGN' | 'TRY', bankCode: string, bankName: string, account: string, name: string, recipient: string): Promise<void>
  /** Calls one of the luda_* SQL functions with named arguments (wallet features). */
  fn<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>
  setWithdrawal(reference: string, patch: { provider?: string; recipient_code?: string | null; transfer_code?: string | null }): Promise<void>
  withdrawSettle(reference: string, status: 'paid' | 'failed' | 'reversed', transferCode?: string | null, note?: string | null): Promise<void>
  spent(userId: string, currency: string, kinds: string[], hours: number): Promise<number>
  // support cases
  createCase(c: Pick<CaseRow, 'user_id' | 'category' | 'subject' | 'reference'>): Promise<CaseRow>
  getCase(id: string): Promise<CaseRow | null>
  updateCase(id: string, patch: Partial<CaseRow>): Promise<void>
  userCases(userId: string, limit: number): Promise<CaseRow[]>
  listCases(status: string | null, limit: number): Promise<CaseRow[]>
  addCaseMessage(m: Pick<CaseMessage, 'case_id' | 'author' | 'author_name' | 'body' | 'files'>): Promise<void>
  caseMessages(caseIds: string[]): Promise<CaseMessage[]>
  // owner admin
  adminOverview(): Promise<Record<string, any>>
  searchProfiles(q: string, limit: number): Promise<Profile[]>
  listDeposits(status: string | null, q: string | null, limit: number): Promise<PaymentRow[]>
  listWithdrawals(status: string | null, limit: number): Promise<WithdrawalRow[]>
  refundTicket(ticketId: string): Promise<{ ok: boolean; reason?: string }>
  // fingerprint keys
  passkeys(userId: string): Promise<Passkey[]>
  addPasskey(k: Omit<Passkey, 'counter' | 'created_at'>): Promise<void>
  setPasskeyCounter(id: string, counter: number): Promise<void>
  removePasskey(userId: string, id: string): Promise<void>
}

export const MONEY_ERRORS = ['insufficient_funds', 'account_frozen', 'not_available', 'pot_locked', 'too_many_pots', 'own_listing', 'not_found', 'own_post', 'name_taken', 'not_member', 'owner_cannot_leave', 'too_many_ads', 'too_many_methods', 'p2p_limits', 'p2p_method', 'appeal_too_early', 'not_enough_points', 'rewards_budget', 'already_invited', 'invite_too_late', 'too_many_fees', 'already_reviewed', 'too_soon', 'too_small', 'rate_moved', 'fx_daily_cap', 'already_applied', 'not_pending', 'not_active']

export function restDb(url: string, serviceKey: string, f: Fetch = fetch): Db {
  const base = `${url.replace(/\/$/, '')}/rest/v1`
  // Legacy service_role keys are JWTs (sent in both headers); newer `sb_secret_…` keys go in `apikey` only.
  const auth: Record<string, string> = serviceKey.startsWith('sb_') ? { apikey: serviceKey } : { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const h = (extra: Record<string, string> = {}) => ({ ...auth, 'content-type': 'application/json', ...extra })
  const q = encodeURIComponent
  async function call(path: string, init: RequestInit = {}) {
    const r = await f(`${base}/${path}`, { ...init, headers: h(init.headers as Record<string, string>) })
    if (!r.ok) {
      const t = await r.text()
      const known = MONEY_ERRORS.find((m) => t.includes(m))
      if (known) throw new MoneyError(known)
      if (r.status === 409 || t.includes('23505')) throw new MoneyError('conflict')
      throw new Error(`Database error ${r.status}: ${t.slice(0, 200)}`)
    }
    return r
  }
  const rows = async <T>(path: string) => (await (await call(path)).json()) as T[]
  // SQL functions that return nothing ('returns void') answer with an EMPTY body on the live server (PostgREST 204),
  // which made .json() throw 'Unexpected end of JSON input' (v1.28.1: Luda HQ 'Mark as paid' failed after the PIN).
  const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
    const text = await (await call(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })).text()
    return (text.trim() ? JSON.parse(text) : null) as T
  }
  const since = (iso: string) => q(iso)
  return {
    async insert(row) { await call('payments', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(row) }) },
    async get(ref) { return (await rows<PaymentRow>(`payments?reference=eq.${q(ref)}&limit=1`))[0] ?? null },
    async settle(ref, status, txId) {
      const r = await call(`payments?reference=eq.${q(ref)}&status=eq.pending`, {
        method: 'PATCH', headers: { prefer: 'return=representation' },
        body: JSON.stringify({ status, provider_tx_id: txId ?? null, paid_at: status === 'paid' ? new Date().toISOString() : null }),
      })
      return ((await r.json()) as unknown[]).length > 0
    },
    async recentByEmail(email, s) {
      const r = await call(`payments?email=eq.${q(email)}&created_at=gte.${since(s)}&select=reference`, { headers: { prefer: 'count=exact', range: '0-0' } })
      return Number(r.headers.get('content-range')?.split('/')[1] ?? 0)
    },
    async log(ref, kind, payload) {
      await call('payment_events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ reference: ref, kind, payload: payload ?? null }) }).catch(() => {})
    },
    async profile(id) { return (await rows<Profile>(`profiles?user_id=eq.${q(id)}&limit=1`))[0] ?? null },
    async profileByUsername(u) { return (await rows<Profile>(`profiles?username=eq.${q(u)}&limit=1`))[0] ?? null },
    async profileByKycSession(sid) { return (await rows<Profile>(`profiles?kyc_session_id=eq.${q(sid)}&limit=1`))[0] ?? null },
    async profileByPhone(ph) { return (await rows<Profile>(`profiles?phone=eq.${q(ph)}&limit=1`))[0] ?? null },
    async hit(key, max, seconds) { return Boolean(await rpc('luda_hit', { p_key: key, p_max: max, p_seconds: seconds })) },
    async profileByEmail(e) { return (await rows<Profile>(`profiles?email=ilike.${q(e.replace(/[%_\\*]/g, ''))}&limit=1`))[0] ?? null },
    async createProfile(p) {
      try {
        const r = await call('profiles', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(p) })
        return ((await r.json()) as Profile[])[0]
      } catch (e) { if (e instanceof MoneyError && e.message === 'conflict') return 'taken'; throw e }
    },
    async updateProfile(id, patch) { await call(`profiles?user_id=eq.${q(id)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify(patch) }) },
    async balances(id) {
      const out: Record<string, number> = { NGN: 0, TRY: 0 }
      for (const w of await rows<{ currency: string; balance_minor: number }>(`wallets?user_id=eq.${q(id)}&select=currency,balance_minor`)) out[w.currency] = Number(w.balance_minor)
      return out
    },
    history: (id, n) => rows<LedgerRow>(`ledger?user_id=eq.${q(id)}&order=id.desc&limit=${n}`),
    tickets: (id, n) => rows<TicketRow>(`tickets?user_id=eq.${q(id)}&order=created_at.desc&limit=${n}`),
    async withdrawal(ref) { return (await rows<WithdrawalRow>(`withdrawals?reference=eq.${q(ref)}&limit=1`))[0] ?? null },
    withdrawals: (id, n) => rows<WithdrawalRow>(`withdrawals?user_id=eq.${q(id)}&order=created_at.desc&limit=${n}`),
    deposits: (id, n) => rows<PaymentRow>(`payments?user_id=eq.${q(id)}&purpose=eq.deposit&order=created_at.desc&limit=${n}`),
    pendingDeposits: (id, s) => rows<PaymentRow>(`payments?user_id=eq.${q(id)}&purpose=eq.deposit&status=in.(pending,mismatch)&created_at=gte.${since(s)}&order=created_at.desc&limit=5`),
    async depositedSince(id, s, cc) {
      const r = await rows<{ credit_minor: number }>(`payments?user_id=eq.${q(id)}&purpose=eq.deposit&credit_currency=eq.${q(cc)}&status=in.(pending,paid)&created_at=gte.${since(s)}&select=credit_minor`)
      return r.reduce((a, x) => a + Number(x.credit_minor ?? 0), 0)
    },
    async post(entries) { return rpc('luda_post', { entries }) },
    async depositPaid(ref, tx) { await rpc('luda_deposit_paid', { p_reference: ref, p_tx: tx }) },
    async buyTicket(u, cur, amt, baseAmt, code, item) {
      return (await rpc<{ ticket: TicketRow }>('luda_buy_ticket', { p_user: u, p_currency: cur, p_amount: amt, p_base: baseAmt, p_code: code, p_item: item })).ticket
    },
    async withdraw(u, ref, amt, fee, feeCur, bank, bankName, acct, name, rcp) {
      await rpc('luda_withdraw2', { p_user: u, p_reference: ref, p_amount: amt, p_fee: fee, p_fee_cur: feeCur, p_bank_code: bank, p_bank_name: bankName, p_account: acct, p_name: name, p_recipient: rcp })
    },
    fn: (name, args) => rpc(name, args),
    async setWithdrawal(ref, patch) { await call(`withdrawals?reference=eq.${q(ref)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }) },
    async withdrawSettle(ref, status, tc, note) { await rpc('luda_withdraw_settle', { p_reference: ref, p_status: status, p_transfer: tc ?? null, p_note: note ?? null }) },
    async spent(u, cur, kinds, hours) { return Number(await rpc('luda_spent', { p_user: u, p_currency: cur, p_kinds: kinds, p_hours: hours })) },
    async createCase(c) { const r = await call('cases', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(c) }); return ((await r.json()) as CaseRow[])[0] },
    async getCase(id) { return (await rows<CaseRow>(`cases?id=eq.${q(id)}&select=*,user:profiles(username,full_name,email,kyc_status)&limit=1`))[0] ?? null },
    async updateCase(id, patch) { await call(`cases?id=eq.${q(id)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }) },
    userCases: (u, n) => rows<CaseRow>(`cases?user_id=eq.${q(u)}&order=updated_at.desc&limit=${n}`),
    listCases: (st, n) => rows<CaseRow>(`cases?select=*,user:profiles(username,full_name,email,kyc_status)${st ? `&status=in.(${st.split(',').map(q).join(',')})` : ''}&order=updated_at.desc&limit=${n}`),
    async addCaseMessage(m) { await call('case_messages', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(m) }) },
    caseMessages: (ids) => (ids.length ? rows<CaseMessage>(`case_messages?case_id=in.(${ids.map(q).join(',')})&order=id.asc`) : Promise.resolve([])),
    async adminOverview() { return rpc('luda_admin_overview', {}) },
    searchProfiles(qs, n) {
      const s = qs.replace(/[^\w@.+ -]/g, '').trim()
      const filter = s ? `&or=(username.ilike.*${q(s)}*,email.ilike.*${q(s)}*,full_name.ilike.*${q(s)}*,phone.ilike.*${q(s)}*)` : ''
      return rows<Profile>(`profiles?select=*${filter}&order=created_at.desc&limit=${n}`)
    },
    listDeposits(st, qs, n) {
      const s = (qs ?? '').replace(/[^\w@.-]/g, '')
      return rows<PaymentRow>(`payments?purpose=eq.deposit${st ? `&status=eq.${q(st)}` : ''}${s ? `&or=(reference.ilike.*${q(s)}*,email.ilike.*${q(s)}*)` : ''}&order=created_at.desc&limit=${n}`)
    },
    listWithdrawals: (st, n) => rows<WithdrawalRow>(`withdrawals?${st ? `status=eq.${q(st)}&` : ''}order=created_at.desc&limit=${n}`),
    async refundTicket(id) { return rpc('luda_refund_ticket', { p_ticket: id }) },
    passkeys: (u) => rows<Passkey>(`passkeys?user_id=eq.${q(u)}&order=created_at.asc`),
    async addPasskey(k) { await call('passkeys', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(k) }) },
    async setPasskeyCounter(id, c) { await call(`passkeys?id=eq.${q(id)}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ counter: c }) }) },
    async removePasskey(u, id) { await call(`passkeys?id=eq.${q(id)}&user_id=eq.${q(u)}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }) },
  }
}
