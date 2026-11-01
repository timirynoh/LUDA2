// Test harness: a real Postgres (PGlite) with Luda's migrations, a Db adapter over it,
// and fake Supabase Auth / Paystack / Flutterwave / Dojah servers.
import { PGlite } from '@electric-sql/pglite'
import { createHmac, randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { MoneyError, type Db, type Entry, type Profile } from '../functions/_shared/db.ts'
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
      if (m.includes('insufficient_funds')) throw new MoneyError('insufficient_funds')
      if (m.includes('account_frozen')) throw new MoneyError('account_frozen')
      if (e?.code === '23505') throw new MoneyError('conflict')
      throw e
    }
  }
  const n = (x: any) => (x == null ? x : Number(x))
  const db: Db = {
    async insert(r) {
      await q(`insert into payments (reference,provider,purpose,status,amount_minor,currency,base_amount,base_currency,fx_rate,email,item,user_id,fee_minor,credit_minor)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [r.reference, r.provider, r.purpose, r.status, r.amount_minor, r.currency, r.base_amount, r.base_currency, r.fx_rate, r.email, r.item, r.user_id ?? null, r.fee_minor ?? 0, r.credit_minor ?? null])
    },
    async get(ref) { const r = (await q(`select * from payments where reference=$1`, [ref]))[0]; return r ? { ...r, amount_minor: n(r.amount_minor), credit_minor: n(r.credit_minor), fee_minor: n(r.fee_minor) } : null },
    async settle(ref, st, tx) { return (await q(`update payments set status=$2, provider_tx_id=$3 where reference=$1 and status='pending' returning 1`, [ref, st, tx ?? null])).length > 0 },
    async recentByEmail(email, since) { return Number((await q(`select count(*) c from payments where email=$1 and created_at >= $2`, [email, since]))[0].c) },
    async log(ref, kind, payload) { await q(`insert into payment_events (reference, kind, payload) values ($1,$2,$3)`, [ref, kind, payload ?? null]) },
    async profile(id) { return ((await q<Profile>(`select * from profiles where user_id=$1`, [id]))[0]) ?? null },
    async profileByUsername(u) { return ((await q<Profile>(`select * from profiles where username=$1`, [u]))[0]) ?? null },
    async createProfile(p) {
      try { return (await money(() => q<Profile>(`insert into profiles (user_id,username,full_name,email,country) values ($1,$2,$3,$4,$5) returning *`, [p.user_id, p.username, p.full_name, p.email, p.country ?? null])))[0] }
      catch (e) { if (e instanceof MoneyError && e.message === 'conflict') return 'taken'; throw e }
    },
    async updateProfile(id, patch) {
      const keys = Object.keys(patch); if (!keys.length) return
      await q(`update profiles set ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} where user_id=$1`, [id, ...keys.map((k) => (patch as any)[k])])
    },
    async balances(id) { const out: Record<string, number> = { NGN: 0, TRY: 0 }; for (const w of await q(`select currency, balance_minor from wallets where user_id=$1`, [id])) out[w.currency] = Number(w.balance_minor); return out },
    async history(id, l) { return (await q(`select * from ledger where user_id=$1 order by id desc limit ${l}`, [id])).map((r) => ({ ...r, amount_minor: n(r.amount_minor), balance_after: n(r.balance_after) })) },
    async tickets(id, l) { return q(`select * from tickets where user_id=$1 order by created_at desc limit ${l}`, [id]) },
    async withdrawal(ref) { const r = (await q(`select * from withdrawals where reference=$1`, [ref]))[0]; return r ? { ...r, amount_minor: n(r.amount_minor), fee_minor: n(r.fee_minor) } : null },
    async withdrawals(id, l) { return q(`select * from withdrawals where user_id=$1 order by created_at desc limit ${l}`, [id]) },
    async depositedSince(id, since) { return Number((await q(`select coalesce(sum(credit_minor),0) s from payments where user_id=$1 and purpose='deposit' and status in ('pending','paid') and created_at >= $2`, [id, since]))[0].s) },
    async post(entries: Entry[]) { return money(async () => (await q(`select luda_post($1::jsonb) r`, [JSON.stringify(entries)]))[0].r) },
    async depositPaid(ref, tx) { await money(() => q(`select luda_deposit_paid($1,$2)`, [ref, tx])) },
    async buyTicket(u, cur, amt, base, code, item) { return money(async () => (await q(`select luda_buy_ticket($1,$2,$3,$4,$5,$6::jsonb) r`, [u, cur, amt, base, code, JSON.stringify(item)]))[0].r.ticket) },
    async withdraw(u, ref, amt, fee, bank, bankName, acct, name, rcp) { await money(() => q(`select luda_withdraw($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [u, ref, amt, fee, bank, bankName, acct, name, rcp])) },
    async withdrawSettle(ref, st, tc, note) { await money(() => q(`select luda_withdraw_settle($1,$2,$3,$4)`, [ref, st, tc ?? null, note ?? null])) },
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
    accounts: new Map<string, string>([['058:0123456789', 'OKAFOR ADA CHIOMA'], ['058:0999999999', 'JOHN STRANGER']]),
    transfers: new Map<string, string>(), // ref -> paystack status
    transferReply: 'pending',
    ids: new Map<string, Record<string, string>>([['12345678901', { first_name: 'ADA', middle_name: 'CHIOMA', last_name: 'OKAFOR', date_of_birth: '2001-04-15' }],
      ['10987654321', { first_name: 'BOLA', last_name: 'ADEYEMI', date_of_birth: '15-Apr-2000' }]]),
    calls: [] as string[],
  }
  const ok = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status })
  const f = (async (u: string, init?: RequestInit) => {
    const url = new URL(u), body = init?.body ? JSON.parse(String(init.body)) : {}
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
      if (url.pathname === '/transaction/initialize') { world.inits.set(body.reference, body.amount); return ok({ status: true, data: { authorization_url: `https://checkout.paystack.com/${body.reference}` } }) }
      if (url.pathname.startsWith('/transaction/verify/')) {
        const ref = decodeURIComponent(url.pathname.split('/').pop()!), c = world.charges.get(ref) ?? { status: 'abandoned' }
        return ok({ status: true, data: { status: c.status, amount: c.amount ?? world.inits.get(ref), currency: c.currency ?? 'NGN', reference: ref, id: 4242 } })
      }
      if (url.pathname === '/bank') return ok({ status: true, data: [{ code: '058', name: 'Guaranty Trust Bank', active: true }, { code: '044', name: 'Access Bank', active: true }] })
      if (url.pathname === '/bank/resolve') {
        const name = world.accounts.get(`${url.searchParams.get('bank_code')}:${url.searchParams.get('account_number')}`)
        return name ? ok({ status: true, data: { account_name: name } }) : ok({ status: false, message: 'Could not resolve account name' }, 422)
      }
      if (url.pathname === '/transferrecipient') return ok({ status: true, data: { recipient_code: 'RCP_' + body.account_number } })
      if (url.pathname === '/transfer') { world.transfers.set(body.reference, world.transferReply); return ok({ status: true, data: { status: world.transferReply, transfer_code: 'TRF_' + body.reference.slice(-4) } }) }
      if (url.pathname.startsWith('/transfer/verify/')) {
        const ref = decodeURIComponent(url.pathname.split('/').pop()!)
        return ok({ status: true, data: { status: world.transfers.get(ref) ?? 'pending', reference: ref, transfer_code: 'TRF_x' } })
      }
    }
    // Flutterwave
    if (url.host === 'api.flutterwave.com') {
      if (url.pathname === '/v3/payments') { world.inits.set(body.tx_ref, Math.round(body.amount * 100)); return ok({ status: 'success', data: { link: `https://checkout.flutterwave.com/${body.tx_ref}` } }) }
      if (url.pathname.endsWith('verify_by_reference')) {
        const ref = url.searchParams.get('tx_ref')!, c = world.charges.get(ref) ?? { status: 'pending' }
        return ok({ status: 'success', data: { status: c.status === 'success' ? 'successful' : c.status, amount: (c.amount ?? world.inits.get(ref)!) / 100, currency: c.currency ?? 'NGN', tx_ref: ref, id: 777 } })
      }
    }
    // Dojah
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
  FX_FIXED_RATE: '40', FX_MARGIN: '0.01', DOJAH_APP_ID: 'app', DOJAH_SECRET_KEY: 'sec',
}

export const sign = {
  paystack: (raw: string) => createHmac('sha512', ENV.PAYSTACK_SECRET_KEY!).update(raw).digest('hex'),
  flutterwave: (raw: string) => createHmac('sha256', ENV.FLW_SECRET_HASH!).update(raw).digest('base64'),
}
