// v1.32.0: public policy pages for payment-provider review (Paystack/Flutterwave): readable without an account,
// name the company, Terms link the Refund and AML policies (and everyone accepts the new Terms), only content:full edits them.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q']
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.32.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), ENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}
const CO = 'Luda Digital Systems Limited'

before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  for (const u of ['ada', 'kemi']) {
    T[u] = (await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: `${u} Okafor`, password: 'Lefkosa2026!' })).j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
  }
  await q(`insert into staff (email, roles) values ('kemi@x.com', '{"content":"edit"}'::jsonb)`)
})

test('every public page answers without signing in and names the company', async () => {
  for (const slug of ['terms', 'privacy', 'refunds', 'aml', 'about']) {
    const r = await call('GET', `guide?slug=${slug}`)
    assert.equal(r.status, 200, slug)
    assert.ok(JSON.stringify(r.j.guide).includes(CO), `${slug} names ${CO}`)
    assert.ok(!/lawyer/i.test(JSON.stringify(r.j.guide)), `${slug} has no internal 'lawyer' note`)
  }
  assert.equal((await call('GET', 'guides?kind=policy')).j.guides.length, 3)
  const terms = (await call('GET', 'guide?slug=terms')).j.guide
  const titles = terms.steps.map((s: any) => s.title)
  assert.deepEqual(titles.slice(-3), ['13. Refunds, cancellations and chargebacks', '14. Identity checks and anti-money-laundering', '15. Changes and contact'])
  assert.equal(titles.filter((t: string) => t.startsWith('13.')).length, 1, 'old section 13 replaced')
  assert.match(JSON.stringify(terms), /useluda\.com\/refunds/); assert.match(JSON.stringify(terms), /useluda\.com\/aml/)
  const refunds = (await call('GET', 'guide?slug=refunds')).j.guide
  for (const t of ['Top-ups', 'Withdrawals', 'Bus tickets', 'Bills and rent', 'Chargebacks']) assert.ok(refunds.steps.some((s: any) => s.title === t), t)
})

test('new Terms version: people who accepted the old one must accept again', async () => {
  const me = (await call('GET', 'me', undefined, T.ada)).j.profile
  assert.ok(me.termsCurrent >= 3, JSON.stringify({ v: me.termsCurrent }))
  assert.notEqual(me.termsVersion, me.termsCurrent)
})

test('only content:full can change the policies (content:edit can still edit guides)', async () => {
  const save = { slug: 'refunds', title: 'Refund policy', intro: 'x', steps: [{ title: 'a', body: 'b' }], pin: '4826' }
  assert.equal((await call('POST', 'admin-guide-save', save, T.kemi)).status, 403)
  assert.equal((await call('POST', 'admin-guide-save', { ...save, slug: 'about' }, T.kemi)).status, 403)
})
