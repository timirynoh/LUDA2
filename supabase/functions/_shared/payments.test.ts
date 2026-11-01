// Run: node --test supabase/functions/_shared/payments.test.ts   (Node 22+, no install needed)
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import type { Db, PaymentRow } from './db.ts'
import { handleInit, handleVerify, handleWebhook, type Env } from './handlers.ts'
import { priceTicket } from './pricing.ts'

const NOW = new Date('2026-11-01T10:00:00Z')
const env: Env = { APP_URL: 'https://luda.test', PAYSTACK_SECRET_KEY: 'sk_test_abc', FLW_SECRET_KEY: 'FLWSECK_TEST-x', FLW_SECRET_HASH: 'myhash', FX_FIXED_RATE: '40', FX_MARGIN: '0' }

function memDb() {
  const rows = new Map<string, PaymentRow>(), events: { ref: string; kind: string }[] = []
  const db: Db = {
    async insert(r) { rows.set(r.reference, { ...r, created_at: NOW.toISOString() }) },
    async get(ref) { return rows.get(ref) ?? null },
    async settle(ref, status, tx) { const r = rows.get(ref); if (!r || r.status !== 'pending') return false; r.status = status; r.provider_tx_id = tx; return true },
    async recentByEmail(email) { return [...rows.values()].filter((r) => r.email === email).length },
    async log(ref, kind) { events.push({ ref, kind }) },
  }
  return { db, rows, events }
}

/** Fake Paystack + Flutterwave APIs. `paid` controls what verify reports. */
function fakeApi(paid: { status: string; amount?: number; currency?: string } = { status: 'success' }) {
  const calls: { url: string; body?: any }[] = []
  const f = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, body })
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 })
    if (url.endsWith('/transaction/initialize')) return ok({ status: true, data: { authorization_url: 'https://checkout.paystack.com/x', reference: body.reference } })
    if (url.endsWith('/v3/payments')) return ok({ status: 'success', data: { link: 'https://checkout.flutterwave.com/x' } })
    const init0 = calls.find((c) => c.body?.reference || c.body?.tx_ref)?.body
    if (url.includes('/transaction/verify/')) return ok({ data: { status: paid.status, amount: paid.amount ?? init0.amount, currency: paid.currency ?? 'NGN', reference: decodeURIComponent(url.split('/').pop()!), id: 991 } })
    if (url.includes('verify_by_reference')) return ok({ data: { status: paid.status, amount: paid.amount ?? init0.amount, currency: paid.currency ?? 'NGN', tx_ref: new URL(url).searchParams.get('tx_ref'), id: 551 } })
    throw new Error('unexpected ' + url)
  }) as typeof fetch
  return { f, calls }
}

const ticket = { operatorId: 'virgo', return: false, pax: 2, from: 'Girne', to: 'Lefkoşa', date: '2026-11-02', time: '09:00', holder: 'Ada' }
const post = (body: unknown) => new Request('https://fn/pay-init', { method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://luda.test' } })

test('pricing is decided by the server, not the phone', () => {
  assert.equal(priceTicket({ ...ticket, total: 1 }, NOW).amount, 500) // 2 × ₺250, ignores a fake "total"
  assert.equal(priceTicket({ ...ticket, return: true, returnDate: '2026-11-03', returnTime: '18:00' }, NOW).amount, 900)
  assert.equal(priceTicket({ ...ticket, operatorId: 'kibhas', city: 'girne', pax: 1 }, NOW).amount, 350)
  assert.throws(() => priceTicket({ ...ticket, pax: 50 }, NOW), /Passengers/)
  assert.throws(() => priceTicket({ ...ticket, operatorId: 'fake' }, NOW), /cannot be paid/)
  assert.throws(() => priceTicket({ ...ticket, date: '2026-10-01' }, NOW), /30 days/)
})

test('Paystack: init → verify → paid, exactly once', async () => {
  const { db, rows } = memDb(), api = fakeApi()
  const r = await handleInit(post({ provider: 'paystack', purpose: 'ticket', email: 'ada@x.com', item: ticket }), env, { db, fetch: api.f, now: () => NOW })
  const j = await r.json() as any
  assert.equal(r.status, 200, JSON.stringify(j))
  assert.equal(j.checkoutUrl, 'https://checkout.paystack.com/x')
  assert.equal(j.amountMinor, 500 * 40 * 100) // ₺500 at 40 NGN/TL, in kobo
  assert.match(api.calls[0].body.callback_url, /^https:\/\/luda\.test\/pay\/return\?provider=paystack&ref=luda_/)
  const v = await handleVerify(new Request(`https://fn/pay-verify?reference=${j.reference}`), env, { db, fetch: api.f })
  assert.equal(((await v.json()) as any).status, 'paid')
  assert.equal(rows.get(j.reference)!.provider_tx_id, '991')
  const before = api.calls.length
  await handleVerify(new Request(`https://fn/pay-verify?reference=${j.reference}`), env, { db, fetch: api.f })
  assert.equal(api.calls.length, before, 'already paid: no second provider call')
})

test('Flutterwave: init → signed webhook → paid', async () => {
  const { db, rows } = memDb(), api = fakeApi({ status: 'successful' })
  const j = await (await handleInit(post({ provider: 'flutterwave', purpose: 'ticket', email: 'ada@x.com', item: ticket }), env, { db, fetch: api.f, now: () => NOW })).json() as any
  assert.equal(api.calls[0].body.amount, 20000) // major units for Flutterwave
  const raw = JSON.stringify({ event: 'charge.completed', data: { tx_ref: j.reference, status: 'successful' } })
  const sig = createHmac('sha256', 'myhash').update(raw).digest('base64')
  const r = await handleWebhook(new Request('https://fn/pay-webhook', { method: 'POST', body: raw, headers: { 'flutterwave-signature': sig } }), env, { db, fetch: api.f })
  assert.equal(r.status, 200)
  assert.equal(rows.get(j.reference)!.status, 'paid')
})

test('Paystack webhook with a valid signature settles the payment', async () => {
  const { db, rows } = memDb(), api = fakeApi()
  const j = await (await handleInit(post({ provider: 'paystack', purpose: 'ticket', email: 'ada@x.com', item: ticket }), env, { db, fetch: api.f, now: () => NOW })).json() as any
  const raw = JSON.stringify({ event: 'charge.success', data: { reference: j.reference } })
  const sig = createHmac('sha512', env.PAYSTACK_SECRET_KEY!).update(raw).digest('hex')
  assert.equal((await handleWebhook(new Request('https://fn/w', { method: 'POST', body: raw, headers: { 'x-paystack-signature': sig } }), env, { db, fetch: api.f })).status, 200)
  assert.equal(rows.get(j.reference)!.status, 'paid')
})

test('forged webhooks are rejected', async () => {
  const { db } = memDb(), api = fakeApi()
  const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'luda_x' } })
  for (const headers of [{ 'x-paystack-signature': 'deadbeef' }, { 'verif-hash': 'wrong' }, { 'flutterwave-signature': 'AAAA' }, {}] as Record<string, string>[])
    assert.equal((await handleWebhook(new Request('https://fn/w', { method: 'POST', body: raw, headers }), env, { db, fetch: api.f })).status, 401)
})

test('a payment for less than the price is flagged, not accepted', async () => {
  const { db, rows } = memDb(), api = fakeApi({ status: 'success', amount: 100 })
  const j = await (await handleInit(post({ provider: 'paystack', purpose: 'ticket', email: 'ada@x.com', item: ticket }), env, { db, fetch: api.f, now: () => NOW })).json() as any
  const v = await (await handleVerify(new Request(`https://fn/v?reference=${j.reference}`), env, { db, fetch: api.f })).json() as any
  assert.equal(v.status, 'mismatch')
  assert.equal(rows.get(j.reference)!.status, 'mismatch')
})

test('wrong currency is flagged; abandoned stays pending; failed is final', async () => {
  for (const [paid, want] of [[{ status: 'success', currency: 'USD' }, 'mismatch'], [{ status: 'abandoned' }, 'pending'], [{ status: 'failed' }, 'failed']] as const) {
    const { db } = memDb(), api = fakeApi(paid)
    const j = await (await handleInit(post({ provider: 'paystack', purpose: 'ticket', email: 'ada@x.com', item: ticket }), env, { db, fetch: api.f, now: () => NOW })).json() as any
    const v = await (await handleVerify(new Request(`https://fn/v?reference=${j.reference}`), env, { db, fetch: api.f })).json() as any
    assert.equal(v.status, want)
  }
})

test('input checks: provider, email, rate limit, unknown reference', async () => {
  const { db } = memDb(), api = fakeApi(), d = { db, fetch: api.f, now: () => NOW }
  assert.equal((await handleInit(post({ provider: 'paypal', purpose: 'ticket', email: 'a@x.com', item: ticket }), env, d)).status, 400)
  assert.equal((await handleInit(post({ provider: 'paystack', purpose: 'ticket', email: 'nope', item: ticket }), env, d)).status, 400)
  assert.equal((await handleInit(post({ provider: 'paystack', purpose: 'ticket', email: 'a@x.com', item: ticket }), { ...env, PAYSTACK_SECRET_KEY: undefined }, d)).status, 400)
  for (let i = 0; i < 10; i++) await handleInit(post({ provider: 'paystack', purpose: 'ticket', email: 'spam@x.com', item: ticket }), env, d)
  assert.equal((await handleInit(post({ provider: 'paystack', purpose: 'ticket', email: 'spam@x.com', item: ticket }), env, d)).status, 429)
  assert.equal((await handleVerify(new Request('https://fn/v?reference=../../etc'), env, d)).status, 404)
  const g = await (await handleInit(new Request('https://fn/pay-init'), env, d)).json() as any
  assert.deepEqual(g.providers, ['paystack', 'flutterwave'])
})
