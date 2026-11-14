// v1.15.0 Spend-only lira: no profit from buying lira with Instant and converting back after the rate moves,
// no sending bought lira to others, daily cap; earned lira works normally. Run: cd supabase && npm test
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q']
let env: Record<string, string> = { ...ENV, FX_FIXED_RATE: '40' } as any
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.10.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env as any, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const bal = async (u: string) => (await call('GET', 'me', undefined, T[u])).j.balances
before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  for (const [u, n] of [['ada', 'Ada Okafor'], ['kemal', 'Kemal Yilmaz']]) {
    T[u] = (await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: n, password: 'Lefkosa2026!', country: 'NG' })).j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name)`)
  await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id.ada, currency: 'NGN', amount_minor: 1_000_000_00, kind: 'adjustment', ref: 'seed' }])])
})

async function flashAgree(poster: string, helper: string, title: string, amountMinor: number, extra: Record<string, unknown> = {}) {
  const job = (await call('POST', 'flash-post', { title, details: 'Ground floor to 3rd', city: 'girne', budgetMinor: amountMinor, ...extra }, T[poster])).j.job
  await call('POST', 'flash-quote', { id: job.id, amountMinor }, T[helper])
  const qm = (await call('GET', `flash-job?id=${job.id}`, undefined, T[poster])).j.job.threads[0].messages.find((m: any) => m.kind === 'quote')
  await call('POST', 'flash-accept', { id: job.id, msgId: qm.id, pin: '4826' }, T[poster])
  return job
}

test('bought lira: no profit when the Naira weakens, cannot be sent, daily cap', async () => {
  // buy ₺990 for ₦40,000 at ₦40/₺ (1% fee)
  const quote = (await call('GET', 'convert-quote?from=NGN&amount=4000000', undefined, T.ada)).j
  assert.equal(quote.out, 990_00)
  assert.equal((await call('POST', 'convert', { from: 'NGN', to: 'TRY', amountMinor: 40_000_00, pin: '4826', expectMinor: quote.out }, T.ada)).status, 200)
  let fx = (await call('GET', 'me', undefined, T.ada)).j.fx
  assert.equal(fx.boughtTry, 990_00); assert.equal(fx.freeTry, 0)
  // sending bought lira is refused
  assert.match((await call('POST', 'send', { to: 'kemal', currency: 'TRY', amountMinor: 100_00, pin: '4826' }, T.ada)).j.error, /only be spent in Luda/)
  // the Naira weakens to ₦50/₺: converting back gives at most the ₦40,000 paid (not ₦49,005)
  env = { ...env, FX_FIXED_RATE: '50' }
  const back = (await call('GET', 'convert-quote?from=TRY&amount=99000', undefined, T.ada)).j
  assert.equal(back.out, 40_000_00); assert.equal(back.capped, true)
  const before = (await bal('ada')).NGN
  assert.equal((await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 990_00, pin: '4826', expectMinor: back.out }, T.ada)).j.receivedMinor, 40_000_00)
  assert.equal((await bal('ada')).NGN, before + 40_000_00, 'no profit')
  fx = (await call('GET', 'me', undefined, T.ada)).j.fx
  assert.equal(fx.boughtTry, 0)
  // if the Naira strengthens instead, converting back follows today's (worse) rate: Luda never pays more than market
  env = { ...env, FX_FIXED_RATE: '40' }
  await call('POST', 'convert', { from: 'NGN', to: 'TRY', amountMinor: 40_000_00, pin: '4826' }, T.ada)
  env = { ...env, FX_FIXED_RATE: '30' }
  assert.equal((await call('GET', 'convert-quote?from=TRY&amount=99000', undefined, T.ada)).j.out, Math.floor(990_00 * 30 * 0.99))
  env = { ...env, FX_FIXED_RATE: '40' }
  // daily cap: ₺5,000 per 24 h (₺1,980 bought so far)
  assert.match((await call('POST', 'convert', { from: 'NGN', to: 'TRY', amountMinor: 200_000_00, pin: '4826' }, T.ada)).j.error, /₺5,000/)
})

test('spending uses bought lira first; refunds come back as bought; earned lira is free to send and convert at market', async () => {
  const fx0 = (await call('GET', 'me', undefined, T.ada)).j.fx
  assert.equal(fx0.boughtTry, 990_00)
  // spend ₺300 on a Flash job (held) → bought lira goes down first
  const job = await flashAgree('ada', 'kemal', 'Carry my fridge upstairs', 300_00)
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.fx.boughtTry, 690_00)
  // helper gives it back → refund → bought again (can't be laundered into free lira)
  await call('POST', 'flash-drop', { id: job.id }, T.kemal)
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.fx.boughtTry, 990_00)
  // lira kemal earns or receives is his to send / convert at today's rate
  await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id.kemal, currency: 'TRY', amount_minor: 500_00, kind: 'reward', ref: 'prize' }])])
  assert.equal((await call('GET', 'me', undefined, T.kemal)).j.fx.freeTry, 500_00)
  assert.equal((await call('POST', 'send', { to: 'ada', currency: 'TRY', amountMinor: 100_00, pin: '4826' }, T.kemal)).status, 200)
  env = { ...env, FX_FIXED_RATE: '50' }
  assert.equal((await call('GET', 'convert-quote?from=TRY&amount=40000', undefined, T.kemal)).j.out, Math.floor(400_00 * 50 * 0.99), 'earned lira at market')
  env = { ...env, FX_FIXED_RATE: '40' }
  // ada now has ₺100 received (free) + bought: she can send only the received part
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.fx.freeTry, 100_00)
  assert.equal((await call('POST', 'send', { to: 'kemal', currency: 'TRY', amountMinor: 100_00, pin: '4826' }, T.ada)).status, 200)
})
