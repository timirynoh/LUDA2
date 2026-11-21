// v1.34.0: Luda holds no money. Every service is paid at checkout (Paystack/Flutterwave) as one order and delivered
// when the provider confirms; nothing stays in a balance. Refunds go back to the card/bank through the provider.
// Rewards are discounts on services. Old wallets were closed (balances already paid out by the owner).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { before, test } from 'node:test'
import { handleApi, handleWebhook, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb, sign } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], pg: Awaited<ReturnType<typeof makeDb>>['pg'], world: ReturnType<typeof fakeWorld>['world']
const env: any = { ...ENV, WALLET_ENABLED: undefined, ESCROW_ENABLED: undefined, ADMIN_EMAILS: 'boss@x.com' }
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.34.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10)
const ITEM = { operatorId: 'virgo', return: false, pax: 1, from: 'Girne', to: 'Lefkoşa', date: tomorrow, time: '10:00' }
const BILL = { kind: 'bill', type: 'electricity', provider: 'KIB-TEK', account: '2041187733', amountMinor: 480_00, confirmed: true, details: { meterType: 'prepaid', name: 'Ada Okafor', district: 'Girne', month: '2026-11' } }
const balances = async (u: string) => (await q(`select currency, balance_minor from wallets where user_id=$1`, [id[u]])).reduce((a: any, r: any) => ({ ...a, [r.currency]: Number(r.balance_minor) }), {})
const zero = async (u: string) => Object.values(await balances(u)).every((v) => v === 0)
const pay = async (ref: string) => { world.charges.set(ref, { status: 'success' }); const raw = JSON.stringify({ event: 'charge.success', data: { reference: ref } }); return handleWebhook(new Request('https://x/pay-webhook', { method: 'POST', body: raw, headers: { 'x-paystack-signature': sign.paystack(raw) } }), env, d) }

before(async () => {
  const m = await makeDb(); q = m.q; pg = m.pg
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name] of [['ada', 'Ada Okafor'], ['boss', 'Luda Boss']]) {
    T[u] = (await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })).j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
})

test('the wallet is closed: no top-ups, withdrawals, sending, converting or paying from a balance', async () => {
  assert.equal((await call('GET', 'config')).j.wallet, false)
  for (const [route, body] of [['deposit', { provider: 'paystack', amountMinor: 5_000_00 }], ['withdraw', { amountMinor: 1_000_00 }], ['send', { to: 'boss', amountMinor: 100_00, currency: 'NGN' }],
    ['convert', { from: 'NGN', to: 'TRY', amountMinor: 1_000_00 }], ['ticket', { currency: 'TRY', item: ITEM }], ['bill-create', BILL], ['pot-create', { name: 'x', currency: 'TRY' }]] as const)
    assert.match((await call('POST', route, { ...body, pin: '4826' }, T.ada)).j.error, /no longer keeps a balance/, route)
})

test('bus ticket: price shown first, pay at checkout, ticket issued when Paystack confirms, nothing left behind', async () => {
  const quote = (await call('POST', 'checkout', { kind: 'ticket', item: ITEM, quote: true }, T.ada)).j
  assert.equal(quote.totalTry, 250_00); assert.equal(quote.currency, 'NGN')
  assert.equal(quote.amountMinor, Math.ceil((250_00 * 40 * 1.01) / 100) * 100, '₺250 at 40 + 1%, whole naira')
  assert.equal(world.inits.size, 0, 'a quote opens no checkout')
  const o = (await call('POST', 'checkout', { kind: 'ticket', item: ITEM, pin: '4826' }, T.ada)).j
  assert.match(o.checkoutUrl, /checkout\.paystack\.com/); assert.match(o.reference, /^ord/)
  assert.equal((await call('GET', `order?ref=${o.reference}`, undefined, T.ada)).j.status, 'pending', 'not paid yet: no ticket')
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.tickets.length, 0)
  await pay(o.reference); await pay(o.reference) // webhook twice
  const r = (await call('GET', `order?ref=${o.reference}`, undefined, T.ada)).j
  assert.equal(r.status, 'paid'); assert.match(r.result.code, /^[A-Z0-9]{8}$/)
  const tickets = (await call('GET', 'me', undefined, T.ada)).j.tickets
  assert.equal(tickets.length, 1, 'exactly one ticket')
  assert.ok(await zero('ada'), 'no balance is ever kept')
  const mine = (await call('GET', 'orders', undefined, T.ada)).j.orders
  assert.equal(mine[0].reference, o.reference); assert.ok(mine[0].doneAt)
  assert.ok((await call('GET', 'inbox', undefined, T.ada)).j.items.some((n: any) => /^Paid ₦/.test(n.title)))
})

test('bill: paid at checkout, goes to the team; if the team cannot pay it the money goes back to the card', async () => {
  const o = (await call('POST', 'checkout', { ...BILL, pin: '4826' }, T.ada)).j
  assert.ok(o.reference, JSON.stringify(o))
  assert.equal(o.totalTry, 480_00 + 10_00, 'bill + ₺10 service fee')
  await pay(o.reference)
  const r = (await call('GET', `order?ref=${o.reference}`, undefined, T.ada)).j
  assert.ok(r.result.billId)
  const queue = (await call('GET', 'admin-bills', undefined, T.boss)).j.bills
  assert.ok(queue.some((b: any) => b.id === r.result.billId), 'in the Luda team queue')
  assert.ok(await zero('ada'))
  const before = world.refunds.length
  assert.equal((await call('POST', 'admin-bill', { billId: r.result.billId, paid: false, note: 'KIB-TEK site is down for this meter', pin: '4826' }, T.boss)).status, 200)
  assert.equal(world.refunds.length, before + 1, 'refunded at Paystack')
  const mine = (await call('GET', 'orders', undefined, T.ada)).j.orders.find((x: any) => x.reference === o.reference)
  assert.equal(mine.refund, 'refunded')
  assert.ok(await zero('ada'), 'the refund did not land in a balance')
  assert.ok((await call('GET', 'inbox', undefined, T.ada)).j.items.some((n: any) => /^Refund on its way/.test(n.title)))
})

test('rewards are discounts: used at checkout, returned if the payment fails, never paid out as money', async () => {
  await q(`select luda_reward($1, 'spin', 'test-day', 0, 0, 2000, 'Daily spin: ₺20', 500000)`, [id.ada])
  assert.ok(await zero('ada'), 'a cash prize no longer lands in a wallet')
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.profile.discountMinor, 20_00)
  const q1 = (await call('POST', 'checkout', { kind: 'ticket', item: ITEM, quote: true }, T.ada)).j
  assert.equal(q1.discountTry, 20_00); assert.equal(q1.amountMinor, Math.ceil((230_00 * 40 * 1.01) / 100) * 100)
  const o = (await call('POST', 'checkout', { kind: 'ticket', item: ITEM, pin: '4826' }, T.ada)).j
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.profile.discountMinor, 0, 'reserved for this order')
  world.charges.set(o.reference, { status: 'failed' })
  await call('GET', `order?ref=${o.reference}`, undefined, T.ada)
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.profile.discountMinor, 20_00, 'payment failed: discount back')
  const o2 = (await call('POST', 'checkout', { kind: 'ticket', item: ITEM, pin: '4826' }, T.ada)).j
  await pay(o2.reference)
  assert.equal((await call('GET', `order?ref=${o2.reference}`, undefined, T.ada)).j.status, 'paid')
  const t = (await call('GET', 'me', undefined, T.ada)).j.tickets.find((x: any) => x.order_ref === o2.reference || x.item?.orderRef === o2.reference)
  assert.ok(t, 'ticket issued for the full ₺250 (₺20 paid by the discount)')
  assert.ok(await zero('ada'))
})

test('provider refuses a refund: it waits in Luda HQ until the team sends it by hand', async () => {
  const o = (await call('POST', 'checkout', { ...BILL, account: '2041187734', pin: '4826' }, T.ada)).j
  await pay(o.reference)
  const billId = (await call('GET', `order?ref=${o.reference}`, undefined, T.ada)).j.result.billId
  world.refundReply = 'refuse'
  await call('POST', 'admin-bill', { billId, paid: false, note: 'Wrong meter number', pin: '4826' }, T.boss)
  world.refundReply = 'ok'
  const waiting = (await call('GET', 'admin-refunds', undefined, T.boss)).j.refunds
  assert.ok(waiting.some((x: any) => x.reference === o.reference))
  assert.match((await call('POST', 'admin-refund-done', { reference: o.reference, pin: '4826' }, T.boss)).j.error, /how it was sent/)
  assert.equal((await call('POST', 'admin-refund-done', { reference: o.reference, note: 'Bank transfer to GTBank ••7733', pin: '4826' }, T.boss)).status, 200)
  assert.equal((await call('GET', 'orders', undefined, T.ada)).j.orders.find((x: any) => x.reference === o.reference).refund, 'refunded')
  assert.ok(await zero('ada'))
})

test('closing old wallets: leftover balances are booked out with a clear message (already paid to the bank)', async () => {
  await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id.boss, currency: 'NGN', amount_minor: 2_272_00, kind: 'adjustment', ref: 'old-topup' }])])
  await pg.exec(readFileSync(new URL('../migrations/20261214000000_pay_per_service.sql', import.meta.url), 'utf8'))
  assert.ok(await zero('boss'))
  assert.ok((await call('GET', 'inbox', undefined, T.boss)).j.items.some((n: any) => /was paid to your bank account/.test(n.title)))
  const integrity = await q(`select (select coalesce(sum(amount_minor),0) from ledger where user_id=$1) - (select coalesce(sum(balance_minor),0) from wallets where user_id=$1) diff`, [id.boss])
  assert.equal(Number(integrity[0].diff), 0, 'ledger still matches')
})

test('texts follow pay-per-service: terms, policies and help never mention a wallet; Withdrawals topic hidden', async () => {
  for (const slug of ['terms', 'refunds', 'aml', 'about', 'privacy']) {
    const g = (await call('GET', `guide?slug=${slug}`)).j.guide
    const text = JSON.stringify(g).toLowerCase()
    assert.ok(!/wallet|top.?up your|withdraw/.test(text), `${slug} still talks about a wallet`)
  }
  const h = (await call('GET', 'help')).j
  assert.ok(!h.topics.some((t: any) => t.id === 'withdraw'), 'no Withdrawals topic')
  assert.equal(h.topics.find((t: any) => t.id === 'wallet')?.title, 'Payments & refunds')
  assert.ok(!h.articles.some((a: any) => a.topic === 'withdraw'))
  for (const a of h.articles) assert.ok(!/wallet/i.test(`${a.title} ${a.intro}`), `help article ${a.slug} still says wallet`)
  const r = (await call('GET', 'rewards', undefined, T.ada)).j
  assert.ok(r.redeem.every((x: any) => /off a payment/.test(x.label)))
})

test('residency fees: state hospital / tax office link + screenshot, paid at checkout, the team pays it on the official page', async () => {
  const LINK = 'https://online.vergi.gov.ct.tr/gvdos_online-vergi/index.jsp?tip=1&vergiNo=123456789&harcTip=1'
  const SHOT = { name: 'page.png', type: 'image/png', data: Buffer.from('fakepng').toString('base64') }
  const FEE = { kind: 'bill', type: 'residency', biller: 'residency', provider: 'Tax office', account: '123456789', amountMinor: 1570_50, confirmed: true, details: { name: 'Ada Okafor', link: LINK } }
  const bad = async (body: any, re: RegExp) => { const r = await call('POST', 'checkout', { ...FEE, ...body, pin: '4826' }, T.ada); assert.equal(r.status, 400, JSON.stringify(r.j)); assert.match(r.j.error, re) }
  await bad({ files: [SHOT], details: { name: 'Ada' } }, /payment page link/)
  await bad({ files: [SHOT], details: { link: 'http://online.vergi.gov.ct.tr/x' } }, /https/)
  await bad({ files: [SHOT], provider: 'KIB-TEK' }, /State hospital or Tax office/)
  await bad({}, /screenshot/)
  const quote = (await call('POST', 'checkout', { ...FEE, quote: true }, T.ada)).j
  assert.equal(quote.totalTry, 1570_50 + 20_00, 'kuruş allowed; normal bill fee (₺20 above ₺1,000)')
  assert.equal(quote.label, 'Residency fee · Tax office')
  const o = (await call('POST', 'checkout', { ...FEE, files: [SHOT], save: true, pin: '4826' }, T.ada)).j
  assert.ok(o.reference, JSON.stringify(o))
  await pay(o.reference)
  const billId = (await call('GET', `order?ref=${o.reference}`, undefined, T.ada)).j.result.billId
  const b = (await call('GET', 'admin-bills', undefined, T.boss)).j.bills.find((x: any) => x.id === billId)
  assert.equal(b.type, 'residency'); assert.equal(b.details.link, LINK); assert.equal(b.details.official, 'yes')
  assert.equal(b.amount_minor, 1570_50)
  assert.ok(!(await q(`select 1 from saved_bills where user_id=$1 and type='residency'`, [id.ada])).length, 'not saved: the link changes each time')
  // a link that isn't a government address still works, but the team sees it flagged
  const o2 = (await call('POST', 'checkout', { ...FEE, provider: 'State hospital', amountMinor: 450_00, details: { link: 'https://pay.example-bank.com/x?id=9' }, files: [SHOT], pin: '4826' }, T.ada)).j
  await pay(o2.reference)
  const id2 = (await call('GET', `order?ref=${o2.reference}`, undefined, T.ada)).j.result.billId
  assert.equal((await call('GET', 'admin-bills', undefined, T.boss)).j.bills.find((x: any) => x.id === id2).details.official, 'no')
  assert.ok(await zero('ada'))
})
