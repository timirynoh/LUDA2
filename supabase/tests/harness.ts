// Test harness: a real Postgres (PGlite) with Luda's migrations, a Db adapter over it,
// and fake Supabase Auth / Paystack / Flutterwave / Dojah servers.
import { PGlite } from '@electric-sql/pglite'
import { createHmac, randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { MONEY_ERRORS, MoneyError, type Db, type Entry, type Profile } from '../functions/_shared/db.ts'
import type { Env } from '../functions/_shared/handlers.ts'

export async function makeDb() {
  const pg = new PGlite()
  await pg.exec(`create schema auth; create table auth.users (id uuid primary key, email text); create role anon; create role authenticated;`)
  const dir = new URL('../migrations/', import.meta.url)
  for (const f of readdirSync(dir).sort()) await pg.exec(readFileSync(new URL(f, dir), 'utf8'))
  const q = async <T = any>(sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows as T[]
  const money = async <T>(fn: () => Promise<T>) => {
    try { return await fn() } catch (e: any) {
      const m = String(e?.message ?? e)
      const known = MONEY_ERRORS.find((x) => m.includes(x)); if (known) throw new MoneyError(known)
      if (e?.code === '23505') throw new MoneyError('conflict')
      throw e
    }
  }
  const n = (x: any) => (x == null ? x : Number(x))
  const db: Db = {
    async insert(r) {
      await q(`insert into payments (reference,provider,purpose,status,amount_minor,currency,base_amount,base_currency,fx_rate,email,item,user_id,fee_minor,credit_minor,credit_currency)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [r.reference, r.provider, r.purpose, r.status, r.amount_minor, r.currency, r.base_amount, r.base_currency, r.fx_rate, r.email, r.item, r.user_id ?? null, r.fee_minor ?? 0, r.credit_minor ?? null, r.credit_currency ?? 'NGN'])
    },
    async get(ref) { const r = (await q(`select * from payments where reference=$1`, [ref]))[0]; return r ? { ...r, amount_minor: n(r.amount_minor), credit_minor: n(r.credit_minor), fee_minor: n(r.fee_minor) } : null },
    async settle(ref, st, tx) { return (await q(`update payments set status=$2, provider_tx_id=$3 where reference=$1 and status='pending' returning 1`, [ref, st, tx ?? null])).length > 0 },
    async recentByEmail(email, since) { return Number((await q(`select count(*) c from payments where email=$1 and created_at >= $2`, [email, since]))[0].c) },
    async log(ref, kind, payload) { await q(`insert into payment_events (reference, kind, payload) values ($1,$2,$3)`, [ref, kind, payload ?? null]) },
    async profile(id) { return ((await q<Profile>(`select * from profiles where user_id=$1`, [id]))[0]) ?? null },
    async profileByKycSession(sid) { return ((await q<Profile>(`select * from profiles where kyc_session_id=$1`, [sid]))[0]) ?? null },
    async profileByPhone(ph) { return ((await q<Profile>(`select * from profiles where phone=$1`, [ph]))[0]) ?? null },
    async hit(key, max, seconds) { return (await q(`select luda_hit($1,$2,$3) r`, [key, max, seconds]))[0].r },
    async profileByEmail(e) { return ((await q<Profile>(`select * from profiles where lower(email)=lower($1)`, [e]))[0]) ?? null },
    async profileByUsername(u) { return ((await q<Profile>(`select * from profiles where username=$1`, [u]))[0]) ?? null },
    async createProfile(p) {
      try { return (await money(() => q<Profile>(`insert into profiles (user_id,username,full_name,email,country) values ($1,$2,$3,$4,$5) returning *`, [p.user_id, p.username, p.full_name, p.email, p.country ?? null])))[0] }
      catch (e) { if (e instanceof MoneyError && e.message === 'conflict') return 'taken'; throw e }
    },
    async updateProfile(id, patch) {
      const keys = Object.keys(patch); if (!keys.length) return
      await money(() => q(`update profiles set ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} where user_id=$1`, [id, ...keys.map((k) => (patch as any)[k])]))
    },
    async balances(id) { const out: Record<string, number> = { NGN: 0, TRY: 0 }; for (const w of await q(`select currency, balance_minor from wallets where user_id=$1`, [id])) out[w.currency] = Number(w.balance_minor); return out },
    async history(id, l) { return (await q(`select * from ledger where user_id=$1 order by id desc limit ${l}`, [id])).map((r) => ({ ...r, amount_minor: n(r.amount_minor), balance_after: n(r.balance_after) })) },
    async tickets(id, l) { return q(`select * from tickets where user_id=$1 order by created_at desc limit ${l}`, [id]) },
    async withdrawal(ref) { const r = (await q(`select * from withdrawals where reference=$1`, [ref]))[0]; return r ? { ...r, amount_minor: n(r.amount_minor), fee_minor: n(r.fee_minor) } : null },
    async withdrawals(id, l) { return q(`select * from withdrawals where user_id=$1 order by created_at desc limit ${l}`, [id]) },
    async deposits(id, n) { return (await q(`select * from payments where user_id=$1 and purpose='deposit' order by created_at desc limit ${n}`, [id])).map((r) => ({ ...r, amount_minor: Number(r.amount_minor), credit_minor: Number(r.credit_minor), fee_minor: Number(r.fee_minor) })) },
    async pendingDeposits(id, since) { return (await q(`select * from payments where user_id=$1 and purpose='deposit' and status in ('pending','mismatch') and created_at >= $2 order by created_at desc limit 5`, [id, since])).map((r) => ({ ...r, amount_minor: Number(r.amount_minor), credit_minor: Number(r.credit_minor) })) },
    async depositedSince(id, since, cc) { return Number((await q(`select coalesce(sum(credit_minor),0) s from payments where user_id=$1 and purpose='deposit' and credit_currency=$3 and status in ('pending','paid') and created_at >= $2`, [id, since, cc]))[0].s) },
    async post(entries: Entry[]) { return money(async () => (await q(`select luda_post($1::jsonb) r`, [JSON.stringify(entries)]))[0].r) },
    async depositPaid(ref, tx) { await money(() => q(`select luda_deposit_paid($1,$2)`, [ref, tx])) },
    async buyTicket(u, cur, amt, base, code, item) { return money(async () => (await q(`select luda_buy_ticket($1,$2,$3,$4,$5,$6::jsonb) r`, [u, cur, amt, base, code, JSON.stringify(item)]))[0].r.ticket) },
    async withdraw(u, ref, amt, fee, feeCur, bank, bankName, acct, name, rcp) { await money(() => q(`select luda_withdraw2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [u, ref, amt, fee, feeCur, bank, bankName, acct, name, rcp])) },
    async fn(name, args) {
      const k = Object.keys(args)
      const cast = (v: unknown) => (Array.isArray(v) ? '::text[]' : v !== null && typeof v === 'object' ? '::jsonb' : '')
      const vals = k.map((x) => { const v = (args as any)[x]; return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v })
      return money(async () => (await q(`select ${name}(${k.map((x, i) => `${x} => $${i + 1}${cast((args as any)[x])}`).join(', ')}) r`, vals))[0].r)
    },
    async setWithdrawal(ref, patch) { const k = Object.keys(patch); if (k.length) await q(`update withdrawals set ${k.map((x, i) => `${x}=$${i + 2}`).join(',')}, updated_at=now() where reference=$1`, [ref, ...k.map((x) => (patch as any)[x])]) },
    async withdrawSettle(ref, st, tc, note) { await money(() => q(`select luda_withdraw_settle($1,$2,$3,$4)`, [ref, st, tc ?? null, note ?? null])) },
    async createCase(c) { return (await q(`insert into cases (user_id,category,subject,reference,meta) values ($1,$2,$3,$4,$5::jsonb) returning *`, [c.user_id, c.category, c.subject, c.reference, (c as { meta?: unknown }).meta ? JSON.stringify((c as { meta?: unknown }).meta) : null]))[0] },
    async getCase(id) { const r = (await q(`select c.*, json_build_object('username',p.username,'full_name',p.full_name,'email',p.email,'kyc_status',p.kyc_status) as user from cases c join profiles p using (user_id) where c.id::text=$1`, [id]))[0]; return r ?? null },
    async updateCase(id, patch) { const k = Object.keys(patch); await q(`update cases set ${k.map((x, i) => `${x}=$${i + 2}`).join(',')}, updated_at=now() where id=$1`, [id, ...k.map((x) => (patch as any)[x])]) },
    async userCases(u, n) { return q(`select * from cases where user_id=$1 order by updated_at desc limit ${n}`, [u]) },
    async listCases(st, n) { return q(`select c.*, json_build_object('username',p.username,'full_name',p.full_name,'email',p.email,'kyc_status',p.kyc_status) as user from cases c join profiles p using (user_id) where $1::text is null or c.status = any(string_to_array($1, ',')) order by c.updated_at desc limit ${n}`, [st]) },
    async addCaseMessage(m) { await q(`insert into case_messages (case_id,author,author_name,body,files) values ($1,$2,$3,$4,$5)`, [m.case_id, m.author, m.author_name, m.body, m.files]) },
    async caseMessages(ids) { return ids.length ? q(`select * from case_messages where case_id::text = any($1) order by id`, [ids]) : [] },
    async adminOverview() { return (await q(`select luda_admin_overview() r`))[0].r },
    async searchProfiles(qs, n) { const s = `%${qs}%`; return q<Profile>(`select * from profiles where $1 = '%%' or username ilike $1 or email ilike $1 or full_name ilike $1 or coalesce(phone,'') ilike $1 order by created_at desc limit ${n}`, [s]) },
    async listDeposits(st, qs, n) { return (await q(`select * from payments where purpose='deposit' and ($1::text is null or status=$1) and ($2::text is null or reference ilike $2 or email ilike $2) order by created_at desc limit ${n}`, [st, qs ? `%${qs}%` : null])).map((r) => ({ ...r, amount_minor: Number(r.amount_minor), credit_minor: Number(r.credit_minor), fee_minor: Number(r.fee_minor) })) },
    async listWithdrawals(st, n) { return (await q(`select * from withdrawals where ($1::text is null or status=$1) order by created_at desc limit ${n}`, [st])).map((r) => ({ ...r, amount_minor: Number(r.amount_minor), fee_minor: Number(r.fee_minor) })) },
    async refundTicket(id) { return money(async () => (await q(`select luda_refund_ticket($1::uuid) r`, [id]))[0].r) },
    async passkeys(u) { return (await q(`select * from passkeys where user_id=$1 order by created_at`, [u])).map((r) => ({ ...r, counter: Number(r.counter) })) },
    async addPasskey(k) { await money(() => q(`insert into passkeys (id,user_id,public_key,alg,device) values ($1,$2,$3,$4,$5)`, [k.id, k.user_id, k.public_key, k.alg, k.device ?? null])) },
    async setPasskeyCounter(id, c) { await q(`update passkeys set counter=$2 where id=$1`, [id, c]) },
    async removePasskey(u, id) { await q(`delete from passkeys where id=$2 and user_id=$1`, [u, id]) },
    async spent(u, cur, kinds, hours) { return Number((await q(`select luda_spent($1,$2,$3,$4) s`, [u, cur, kinds, hours]))[0].s) },
  }
  return { pg, q, db }
}

/** Fake external services. `world` lets tests decide what each provider reports. */
export function fakeWorld(q: (sql: string, p?: unknown[]) => Promise<any[]>) {
  const world = {
    users: new Map<string, { id: string; email: string; password: string; meta: Record<string, unknown> }>(),
    tokens: new Map<string, string>(), // token -> user id
    charges: new Map<string, { status: string; amount?: number; currency?: string }>(), // ref -> what the provider reports
    inits: new Map<string, number>(), // ref -> amount sent at init (kobo)
    initCur: new Map<string, string>(), // ref -> currency sent at init
    accounts: new Map<string, string>([['058:0123456789', 'OKAFOR ADA CHIOMA'], ['058:0999999999', 'JOHN STRANGER'], ['50211:0123456789', 'OKAFOR ADA CHIOMA']]),
    transfers: new Map<string, string>(), // ref -> paystack status
    transferReply: 'pending',
    flwTransfers: new Map<string, { id: number; reference: string; status: string; account_bank: string; amount: number }>(), // id -> flutterwave transfer
    flwReply: 'NEW' as string, // 'NEW' | 'SUCCESSFUL' | 'FAILED' | 'ip' (IP not whitelisted) | 'down' (5xx)
    flwAccounts: new Map<string, string>([['058:0123456789', 'OKAFOR ADA CHIOMA'], ['090267:0123456789', 'OKAFOR ADA CHIOMA']]),
    ids: new Map<string, Record<string, string>>([['12345678901', { first_name: 'ADA', middle_name: 'CHIOMA', last_name: 'OKAFOR', date_of_birth: '2001-04-15' }],
      ['10987654321', { first_name: 'BOLA', last_name: 'ADEYEMI', date_of_birth: '15-Apr-2000' }]]),
    calls: [] as string[],
    overpassDown: false,
    diditNoCredit: false,
    pushes: [] as { endpoint: string; headers: Record<string, string>; body: Uint8Array }[],
    didit: new Map<string, Record<string, unknown>>(), // session id -> decision JSON
    files: new Map<string, number>(), // storage path -> size
    diditN: 0,
    topup: 'SUCCESSFUL' as string, // what the top-up partner answers: SUCCESSFUL | PROCESSING | 'refuse' (4xx) | 'down' (5xx)
    topups: new Map<string, { status: string; body: any }>(), // transaction id -> top-up
  }
  const ok = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status })
  const f = (async (u: string, init?: RequestInit) => {
    const url = new URL(u), body = (() => { try { return init?.body ? JSON.parse(String(init.body)) : {} } catch { return {} } })()
    const auth = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? ''
    world.calls.push(`${init?.method ?? 'GET'} ${url.host}${url.pathname}`)
    // Supabase Auth
    if (url.pathname === '/auth/v1/signup') {
      if ([...world.users.values()].some((x) => x.email === body.email)) return ok({ msg: 'User already registered' }, 422)
      const id = randomUUID(); world.users.set(id, { id, email: body.email, password: body.password, meta: body.data })
      await q(`insert into auth.users values ($1,$2)`, [id, body.email])
      const t = 'tok_' + id; world.tokens.set(t, id)
      return ok({ access_token: t, refresh_token: 'r_' + id, expires_in: 3600, user: { id, email: body.email } })
    }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') { const id = String(body.refresh_token).slice(2); return world.users.has(id) ? ok({ access_token: 'tok_' + id, refresh_token: body.refresh_token, expires_in: 3600, user: { id } }) : ok({}, 400) }
      const user = [...world.users.values()].find((x) => x.email === body.email && x.password === body.password)
      return user ? ok({ access_token: 'tok_' + user.id, refresh_token: 'r_' + user.id, expires_in: 3600, user: { id: user.id, email: user.email } }) : ok({ error_description: 'Invalid login credentials' }, 400)
    }
    if (url.pathname === '/auth/v1/settings') return ok({ external: { google: true, email: true } })
    if (url.pathname === '/auth/v1/recover') { world.calls.push('recover:' + body.email + ':' + url.searchParams.get('redirect_to')); return ok({}) }
    if (url.pathname === '/auth/v1/user' && init?.method === 'PUT') {
      const user = world.users.get(auth.startsWith('tok_') ? auth.slice(4) : '')
      if (!user) return ok({ msg: 'invalid' }, 401)
      user.password = body.password; return ok({ id: user.id })
    }
    if (url.pathname === '/auth/v1/user') {
      const id = world.tokens.get(auth) ?? (auth.startsWith('tok_') && world.users.has(auth.slice(4)) ? auth.slice(4) : '')
      const user = world.users.get(id)
      return user ? ok({ id: user.id, email: user.email, user_metadata: user.meta }) : ok({ msg: 'invalid' }, 401)
    }
    // Paystack
    if (url.host === 'api.paystack.co') {
      if (url.pathname === '/transaction/initialize') { world.inits.set(body.reference, body.amount); world.initCur.set(body.reference, body.currency); return ok({ status: true, data: { authorization_url: `https://checkout.paystack.com/${body.reference}` } }) }
      if (url.pathname.startsWith('/transaction/verify/')) {
        const ref = decodeURIComponent(url.pathname.split('/').pop()!), c = world.charges.get(ref) ?? { status: 'abandoned' }
        return ok({ status: true, data: { status: c.status, amount: c.amount ?? world.inits.get(ref), requested_amount: (c as any).requested, currency: c.currency ?? world.initCur.get(ref) ?? 'NGN', reference: ref, id: 4242 } })
      }
      if (url.pathname === '/bank') return ok({ status: true, data: [{ code: '058', name: 'Guaranty Trust Bank', active: true }, { code: '044', name: 'Access Bank', active: true }, { code: '50211', name: 'Kuda Bank', active: true }] })
      if (url.pathname === '/bank/resolve') {
        const name = world.accounts.get(`${url.searchParams.get('bank_code')}:${url.searchParams.get('account_number')}`)
        return name ? ok({ status: true, data: { account_name: name } }) : ok({ status: false, message: 'Could not resolve account name' }, 422)
      }
      if (url.pathname === '/transferrecipient') return ok({ status: true, data: { recipient_code: 'RCP_' + body.account_number } })
      if (url.pathname === '/transfer' && world.transferReply === 'starter') return ok({ status: false, message: 'You cannot initiate third party payouts as a starter business' }, 400)
      if (url.pathname === '/transfer') { world.transfers.set(body.reference, world.transferReply); return ok({ status: true, data: { status: world.transferReply, transfer_code: 'TRF_' + body.reference.slice(-4) } }) }
      if (url.pathname.startsWith('/transfer/verify/')) {
        if (!world.transfers.has(decodeURIComponent(url.pathname.split('/').pop()!))) return ok({ status: false, message: 'Transfer not found' }, 404)
        const ref = decodeURIComponent(url.pathname.split('/').pop()!)
        return ok({ status: true, data: { status: world.transfers.get(ref) ?? 'pending', reference: ref, transfer_code: 'TRF_x' } })
      }
    }
    // Flutterwave
    if (url.host === 'api.flutterwave.com') {
      if (url.pathname === '/v3/payments') { world.inits.set(body.tx_ref, Math.round(body.amount * 100)); world.initCur.set(body.tx_ref, body.currency); return ok({ status: 'success', data: { link: `https://checkout.flutterwave.com/${body.tx_ref}` } }) }
      if (url.pathname === '/v3/banks/NG') return ok({ status: 'success', data: [{ id: 1, code: '058', name: 'GTBank Plc' }, { id: 2, code: '044', name: 'Access Bank' }, { id: 3, code: '090267', name: 'Kuda Microfinance Bank' }, { id: 4, code: '50211', name: 'Some Other Bank' }] })
      if (url.pathname === '/v3/accounts/resolve') { const nm = world.flwAccounts.get(`${body.account_bank}:${body.account_number}`); return nm ? ok({ status: 'success', data: { account_name: nm } }) : ok({ status: 'error', message: 'Sorry, recipient account could not be validated' }, 400) }
      if (url.pathname === '/v3/transfers' && init?.method === 'POST') {
        if (world.flwReply === 'ip') return ok({ status: 'error', message: 'Please enable IP Whitelisting to access this service', data: null }, 400)
        if (world.flwReply === 'down') return ok({ status: 'error', message: 'Service unavailable' }, 503)
        const id = 9000 + world.flwTransfers.size
        world.flwTransfers.set(String(id), { id, reference: body.reference, status: world.flwReply, account_bank: body.account_bank, amount: body.amount })
        return ok({ status: 'success', message: 'Transfer Queued Successfully', data: { id, reference: body.reference, status: world.flwReply } })
      }
      if (url.pathname === '/v3/transfers') return ok({ status: 'success', data: [...world.flwTransfers.values()].reverse() })
      if (url.pathname.startsWith('/v3/transfers/')) { const t = world.flwTransfers.get(url.pathname.split('/').pop()!); return t ? ok({ status: 'success', data: t }) : ok({ status: 'error', message: 'Transfer not found' }, 404) }
      if (url.pathname.endsWith('verify_by_reference')) {
        const ref = url.searchParams.get('tx_ref')!, c = world.charges.get(ref) ?? { status: 'pending' }
        return ok({ status: 'success', data: { status: c.status === 'success' ? 'successful' : c.status, amount: (c.amount ?? world.inits.get(ref)!) / 100, currency: c.currency ?? world.initCur.get(ref) ?? 'NGN', tx_ref: ref, id: 777 } })
      }
    }
    // Twilio Verify (SMS): code 123456 is right
    if (url.host === 'verify.twilio.com') {
      const form = new URLSearchParams(String(init?.body ?? ''))
      if (url.pathname.endsWith('/Verifications')) { world.calls.push('sms:' + form.get('To')); return ok({ status: 'pending' }, 201) }
      if (url.pathname.endsWith('/VerificationCheck')) return ok({ status: form.get('Code') === '123456' ? 'approved' : 'pending' })
    }
    // Supabase Storage (private case photos)
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return ok({ signedURL: url.pathname.replace('/storage/v1', '') + '?token=t' })
    if (url.pathname.startsWith('/storage/v1/object/case-files/') && init?.method === 'POST') {
      if (!new Headers(init?.headers).get('apikey')) return ok({ error: 'no key' }, 401)
      world.files.set(url.pathname.split('/case-files/')[1], (init!.body as Uint8Array).length); return ok({ Key: url.pathname })
    }
    // Didit (document + selfie KYC)
    if (url.host === 'verification.didit.me') {
      if (new Headers(init?.headers).get('x-api-key') !== 'didit_key') return ok({ detail: 'bad key' }, 401)
      if (url.pathname === '/v3/session/' && init?.method === 'POST' && world.diditNoCredit) return ok({ detail: 'Insufficient credits. Please top up your balance.' }, 402)
      if (url.pathname === '/v3/session/' && init?.method === 'POST') { const id = 'ds_' + ++world.diditN; world.calls.push('didit-start:' + body.vendor_data); return ok({ session_id: id, url: `https://verify.didit.me/session/${id}` }, 201) }
      const m = url.pathname.match(/^\/v3\/session\/([^/]+)\/decision\/$/)
      if (m) return ok(world.didit.get(m[1]) ?? { status: 'Not Started', id_verifications: null })
    }
    // Web Push services (phone notifications): record what was sent; an endpoint containing 'gone' has expired
    if (url.hostname.endsWith('.push.test')) {
      world.pushes.push({ endpoint: u, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: new Uint8Array(init?.body as ArrayBuffer) })
      return u.includes('gone') ? ok({}, 410) : ok({}, 201)
    }
    // OpenStreetMap Overpass (Nearby directory): first mirror down when world.overpassDown, else real-looking data
    if (/overpass/.test(url.host)) {
      world.calls.push('overpass:' + url.host)
      if (world.overpassDown) return ok({ error: 'busy' }, 429)
      return ok({ elements: [
        { type: 'node', id: 1, lat: 35.19, lon: 33.38, tags: { name: 'Gönyeli Eczanesi', amenity: 'pharmacy', phone: '+90 392 223 0000', opening_hours: 'Mo-Sa 08:30-19:00' } },
        { type: 'way', id: 2, center: { lat: 35.2, lon: 33.36 }, tags: { name: 'Near East Pharmacy', amenity: 'pharmacy', website: 'neu.edu.tr' } },
        { type: 'node', id: 3, lat: 35.18, lon: 33.37, tags: { amenity: 'pharmacy' } },
      ] })
    }
    // Dojah
    // Top-up partner (Reloadly)
    if (url.host === 'auth.reloadly.com') return body.client_secret === 'rl_secret' ? ok({ access_token: 'rl_tok', expires_in: 3600 }) : ok({ message: 'bad client' }, 401)
    if (url.host === 'topups.reloadly.com') {
      if (auth !== 'rl_tok') return ok({ message: 'unauthorized' }, 401)
      if (url.pathname === '/topups' && init?.method === 'POST') {
        if (world.topup === 'refuse') return ok({ message: 'Invalid phone number for operator', errorCode: 'INVALID_RECIPIENT' }, 400)
        if (world.topup === 'down') return ok({ message: 'down' }, 503)
        const id = String(5000 + world.topups.size); world.topups.set(id, { status: world.topup, body })
        return ok({ transactionId: Number(id), status: world.topup, customIdentifier: body.customIdentifier })
      }
      const m = url.pathname.match(/^\/topups\/(\d+)\/status$/)
      if (m) { const t = world.topups.get(m[1]); return t ? ok({ status: t.status }) : ok({ message: 'not found' }, 404) }
      if (url.pathname.startsWith('/operators/countries/')) return ok([{ operatorId: 1234, name: 'KKTC Telsim', supportsLocalAmounts: true }, { operatorId: 5678, name: 'Kuzey Kibris Turkcell', supportsLocalAmounts: true }])
    }
    if (url.host === 'api.dojah.io') {
      const n = url.searchParams.get('nin') ?? url.searchParams.get('bvn') ?? ''
      const e = world.ids.get(n)
      return e ? ok({ entity: e }) : ok({ error: 'not found' }, 404)
    }
    throw new Error('unexpected call ' + u)
  }) as typeof fetch
  return { world, f }
}

export const ENV: Env = {
  APP_URL: 'https://luda.test', SUPABASE_URL: 'https://proj.supabase.co', AUTH_KEY: 'anon',
  PAYSTACK_SECRET_KEY: 'sk_live_test', FLW_SECRET_KEY: 'FLWSECK-x', FLW_SECRET_HASH: 'flwhash',
  FX_FIXED_RATE: '40', FX_MARGIN: '0.01', FX_TRY_RATES: '{"GHS":0.4,"USD":0.025,"KES":3.2}', DOJAH_APP_ID: 'app', DOJAH_SECRET_KEY: 'sec', PAYSTACK_CUSTOMER_PAYS_FEE: 'false', SERVICE_KEY: 'svc_key', DIDIT_API_KEY: 'didit_key', DIDIT_WORKFLOW_ID: 'wf_free_kyc', DIDIT_WEBHOOK_SECRET: 'didit_secret', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_VERIFY_SID: 'VA1',
}

export const sign = {
  paystack: (raw: string) => createHmac('sha512', ENV.PAYSTACK_SECRET_KEY!).update(raw).digest('hex'),
  flutterwave: (raw: string) => createHmac('sha256', ENV.FLW_SECRET_HASH!).update(raw).digest('base64'),
}
