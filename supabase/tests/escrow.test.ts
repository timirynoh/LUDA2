// v1.33.0: escrow services paused (owner, 2026-11-18). Nothing new can be held: no P2P ads/orders, no Exchanger bond,
// no Market purchase through Luda, no Flash 'pay through Luda'. Bills, Flash (cash) and Market listings keep working.
// The pause migration refunds Flash money held for requests nobody has accepted and pauses P2P ads.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], pg: Awaited<ReturnType<typeof makeDb>>['pg']
const OFF: any = { ...ENV, ESCROW_ENABLED: undefined }
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string, env = OFF) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.33.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const TRY = async (u: string) => Number((await q(`select balance_minor from wallets where user_id=$1 and currency='TRY'`, [id[u]]))[0]?.balance_minor ?? 0)
const PAUSED = /paused/

before(async () => {
  const m = await makeDb(); q = m.q; pg = m.pg
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  for (const u of ['ada', 'kwame']) {
    T[u] = (await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: `${u} Mensah`, password: 'Lefkosa2026!' })).j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
    await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id[u], currency: 'TRY', amount_minor: 2_000_00, kind: 'adjustment', ref: 'seed-' + u }])])
  }
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name)`)
})

test('the app is told escrow is off; P2P, Exchanger and Market buying are refused', async () => {
  assert.equal((await call('GET', 'config')).j.escrow, false)
  assert.equal((await call('GET', 'config', undefined, undefined, ENV)).j.escrow, true, 'ESCROW_ENABLED=true brings it back')
  assert.match((await call('POST', 'p2p-ad-save', { side: 'sell', asset: 'TRY', price: 40, min: 100, max: 1000, methods: ['cash'] }, T.ada)).j.error, PAUSED)
  assert.match((await call('POST', 'p2p-order', { adId: crypto.randomUUID(), amount: 100 }, T.ada)).j.error, PAUSED)
  assert.match((await call('POST', 'exchanger-apply', { pin: '4826' }, T.ada)).j.error, PAUSED)
  assert.match((await call('POST', 'market-buy', { id: crypto.randomUUID(), pin: '4826' }, T.ada)).j.error, PAUSED)
})

test('Market is listings only: a WhatsApp number is required and shown to buyers', async () => {
  const base = { title: 'Desk lamp', description: 'Works well', category: 'home', city: 'Lefkoşa', priceMinor: 150_00 }
  assert.match((await call('POST', 'market-list', base, T.kwame)).j.error, /WhatsApp/)
  assert.match((await call('POST', 'market-list', { ...base, contact: '12' }, T.kwame)).j.error, /country code/)
  const r = await call('POST', 'market-list', { ...base, contact: '+90 533 123 4567' }, T.kwame)
  assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.item.contact, '+905331234567')
  const list = (await call('GET', 'market', undefined, T.ada)).j
  assert.equal(JSON.stringify(list).includes('+905331234567'), true)
})

test('Flash requests are cash only: nothing is held, even if the app asks for Luda pay', async () => {
  const before = await TRY('ada')
  const r = await call('POST', 'flash-post', { title: 'Fix my sink please', details: 'Kitchen sink leaks', city: 'Girne', budgetMinor: 300_00, pay: 'luda' }, T.ada)
  assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.job.pay, 'cash')
  assert.equal(await TRY('ada'), before)
})

test('pause migration: held Flash money for unaccepted requests is refunded; P2P ads are paused, not removed', async () => {
  // An old-style request with money held (like the live one), and an active P2P ad.
  const job = (await call('POST', 'flash-post', { title: 'Plumber needed now', city: 'Girne', budgetMinor: 50_00 }, T.ada)).j.job
  const esc = (await q(`select luda_hold('flash', $1, null, 'TRY', 5000, 250, '{}'::jsonb) e`, [id.ada]))[0].e
  await q(`update flash_jobs set pay='luda', escrow_id=$2 where id=$1`, [job.id, esc])
  const held = await TRY('ada')
  const ad = (await call('POST', 'p2p-ad-save', { side: 'sell', asset: 'TRY', price: 40, minTry: 100, maxTry: 1000, methods: ['cash'], city: 'Lefkoşa' }, T.ada, ENV))
  const sql = readFileSync(new URL('../migrations/20261213000000_escrow_pause.sql', import.meta.url), 'utf8')
  await pg.exec(sql)
  assert.equal(await TRY('ada'), held + 5000, 'the ₺50 is back in the wallet')
  assert.equal((await q(`select status from flash_jobs where id=$1`, [job.id]))[0].status, 'cancelled')
  assert.equal((await q(`select status from escrows where id=$1`, [esc]))[0].status === 'held', false)
  if (ad.status === 200) assert.deepEqual((await q(`select distinct status from p2p_ads`)).map((x: any) => x.status), ['paused'])
})

test('no escrow or P2P anywhere people read: Terms, Privacy, policies, Help Center, tips', async () => {
  const pages = ['terms', 'privacy', 'refunds', 'aml', 'about', 'tip-flash', 'tip-market', 'tip-kyc']
  for (const slug of pages) {
    const g = (await call('GET', `guide?slug=${slug}`)).j.guide
    assert.doesNotMatch(JSON.stringify(g), /escrow|P2P|held by Luda|held safely/i, slug)
  }
  const help = (await call('GET', 'help')).j
  assert.ok(!help.topics.some((t: any) => t.id === 'p2p'), 'P2P help topic hidden')
  assert.doesNotMatch(JSON.stringify(help.articles), /escrow|P2P|held by Luda|(?<!never )holds your money/i)
  assert.ok((await q(`select count(*)::int n from guides_escrow_backup`))[0].n >= 10, 'old texts kept for when it comes back')
})

test('Bills still work while escrow is paused', async () => {
  const r = await call('POST', 'bill-create', { provider: 'kibtek', account: '12345678', amountMinor: 200_00, pin: '4826', confirmed: true, details: { meterType: 'prepaid', name: 'Kwame Mensah', district: 'Girne', month: '2026-11' } }, T.kwame)
  assert.notEqual(r.status, 403, JSON.stringify(r.j))
})
