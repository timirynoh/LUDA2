// P2P exchange: Naira held in escrow inside Luda, lira sent outside (bank or cash), released by the Naira payer. Run: cd supabase && npm test
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q']
const AENV = { ...ENV, ADMIN_EMAILS: 'boss@x.com' }
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.7.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}
const id: Record<string, string> = {}
const NGN = async (u: string) => (await call('GET', 'me', undefined, T[u])).j.balances.NGN as number
const RECEIPT = { type: 'image/png', data: Buffer.from('receipt').toString('base64') }

before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  for (const [u, name, email] of [['ada', 'Ada Okafor', 'ada@x.com'], ['kemal', 'Kemal Yilmaz', 'kemal@x.com'], ['boss', 'Luda Boss', 'boss@x.com'], ['new', 'New Person', 'new@x.com']]) {
    const r = await call('POST', 'signup', { email, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
    await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id[u], currency: 'NGN', amount_minor: 1_000_000_00, kind: 'adjustment', ref: 'seed-' + u }])])
  }
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name) where username in ('ada','kemal','boss')`)
})

test('bank accounts: verified only, Turkish IBAN, always in the verified name', async () => {
  assert.equal((await call('POST', 'pay-method-add', { bank: 'Ziraat', iban: 'TR330006100519786457841326' }, T.new)).status, 403)
  assert.match((await call('POST', 'pay-method-add', { bank: 'Ziraat', iban: 'TR12' }, T.ada)).j.error, /IBAN/)
  const m = (await call('POST', 'pay-method-add', { bank: 'Ziraat Bankası', iban: 'TR33 0006 1005 1978 6457 8413 26', holder: 'Somebody Else' }, T.ada)).j.method
  assert.equal(m.iban, 'TR330006100519786457841326'); assert.equal(m.holder, 'ADA OKAFOR', 'holder is the verified name, not what the app sent')
  assert.equal((await call('GET', 'pay-methods', undefined, T.ada)).j.methods.length, 1)
})

test('buy lira: Naira held → seller sends lira + receipt → buyer releases; fee 0.5%; nearby ads first', async () => {
  assert.match((await call('POST', 'p2p-ad-save', { side: 'sell', price: 70, minTry: 100_00, maxTry: 1_000_00, methods: ['bank'] }, T.kemal)).j.error, /typo/, 'only an obviously wrong price is blocked')
  assert.match((await call('POST', 'p2p-ad-save', { side: 'sell', price: 40.5, minTry: 100_00, maxTry: 9_000_00, methods: ['bank'] }, T.kemal)).j.error, /Limits/)
  assert.equal((await call('POST', 'p2p-ad-save', { side: 'sell', price: 40.5, minTry: 100_00, maxTry: 1_000_00, methods: ['bank'] }, T.new)).status, 403, 'needs ID')
  const ad = (await call('POST', 'p2p-ad-save', { side: 'sell', price: 40.5, minTry: 100_00, maxTry: 2_000_00, methods: ['bank', 'cash'], city: 'lefkosa', area: 'Hamitköy', terms: 'Ziraat or Garanti, fast' }, T.kemal)).j.ad
  assert.ok(ad.id)
  assert.match((await call('POST', 'p2p-ad-save', { side: 'sell', price: 40, minTry: 100_00, maxTry: 500_00, methods: ['bank'] }, T.kemal)).j.error, /1 ad/)
  await call('POST', 'p2p-ad-save', { side: 'sell', price: 40.2, minTry: 100_00, maxTry: 2_000_00, methods: ['bank'], city: 'girne' }, T.boss)
  const list = (await call('GET', 'p2p?want=buy&city=lefkosa&area=hamitköy', undefined, T.ada)).j
  assert.equal(list.ads[0].maker, 'boss', 'cheapest first (Bybit-style)'); assert.equal(list.ads[1].maker, 'kemal'); assert.equal(list.ads[1].verified, true); assert.equal(list.ads[1].nearby, 3)
  assert.equal(list.ads[0].receive_method, undefined)
  const near = (await call('GET', 'p2p?want=buy&city=lefkosa&area=hamitköy&near=1', undefined, T.ada)).j.ads
  assert.deepEqual(near.map((a: any) => a.maker), ['kemal'], '"near me" shows only nearby traders')
  // order
  const pm = (await call('GET', 'pay-methods', undefined, T.ada)).j.methods[0]
  const before = await NGN('ada')
  assert.equal((await call('POST', 'p2p-order', { adId: ad.id, amountTry: 500_00, method: 'bank', payMethodId: pm.id, pin: '0000' }, T.ada)).status, 401, 'PIN needed: Naira leaves the wallet')
  assert.match((await call('POST', 'p2p-order', { adId: ad.id, amountTry: 3_000_00, method: 'bank', payMethodId: pm.id, pin: '4826' }, T.ada)).j.error, /limits/)
  const o = (await call('POST', 'p2p-order', { adId: ad.id, amountTry: 500_00, method: 'bank', payMethodId: pm.id, pin: '4826', side: 'buy' }, T.ada)).j.order
  assert.equal(o.amount_ngn, 20_250_00); assert.equal(o.fee_ngn, 101_25); assert.equal(o.status, 'waiting')
  assert.equal(await NGN('ada'), before - 20_250_00, 'Naira held in escrow')
  // the seller sees where to send the lira
  const ks = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.kemal)).j.order
  assert.equal(ks.role, 'sender'); assert.equal(ks.try_to.iban, 'TR330006100519786457841326'); assert.equal(ks.try_to.holder, 'ADA OKAFOR')
  assert.equal((await call('GET', `p2p-order?id=${o.id}`, undefined, T.boss)).status, 404, 'strangers cannot open it')
  assert.equal((await call('POST', 'p2p-release', { id: o.id, pin: '4826' }, T.kemal)).status, 409, 'only the Naira payer releases')
  assert.match((await call('POST', 'p2p-sent', { id: o.id }, T.kemal)).j.error, /receipt/)
  assert.equal((await call('POST', 'p2p-sent', { id: o.id, files: [RECEIPT] }, T.kemal)).status, 200)
  assert.equal((await call('POST', 'p2p-cancel', { id: o.id }, T.kemal)).status, 409, 'no cancelling after marking sent')
  const kemalBefore = await NGN('kemal')
  assert.equal((await call('POST', 'p2p-release', { id: o.id, pin: '4826' }, T.ada)).status, 200)
  assert.equal(await NGN('kemal'), kemalBefore + 20_250_00 - 101_25, 'seller gets Naira minus 0.5%')
  const done = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.ada)).j.order
  assert.equal(done.status, 'done'); assert.equal(done.receiptUrls.length, 1); assert.ok(done.messages.length >= 3)
  assert.equal((await call('GET', 'p2p?want=buy&city=lefkosa', undefined, T.ada)).j.ads.find((a: any) => a.id === ad.id).available_try, 1_500_00)
  assert.equal((await call('GET', 'p2p?want=buy', undefined, T.ada)).j.ads.find((a: any) => a.maker === 'kemal').stats.trades, 1)
})

test('sell lira: maker buys lira (pays Naira), taker sends to the maker\'s own IBAN; cancel and timeouts refund', async () => {
  const pm = (await call('POST', 'pay-method-add', { bank: 'Garanti BBVA', iban: 'TR120006200000000006295123' }, T.boss)).j.method
  const old = (await call('GET', 'p2p?want=buy', undefined, T.boss)).j.mine[0]
  await call('POST', 'p2p-ad-save', { id: old.id, side: 'sell', price: 40.2, minTry: 100_00, maxTry: 2_000_00, methods: ['bank'], status: 'removed' }, T.boss)
  assert.equal((await call('GET', 'p2p?want=buy', undefined, T.boss)).j.mine.length, 0, 'removed')
  const ad = (await call('POST', 'p2p-ad-save', { side: 'buy', price: 39.8, minTry: 100_00, maxTry: 1_000_00, methods: ['bank'], receiveMethod: pm.id }, T.boss)).j.ad
  assert.equal(ad.side, 'buy')
  const bossBefore = await NGN('boss')
  const o = (await call('POST', 'p2p-order', { adId: ad.id, amountTry: 200_00, method: 'bank', side: 'sell' }, T.ada)).j.order
  assert.equal(await NGN('boss'), bossBefore - 7_960_00, 'the maker\'s Naira is held')
  const view = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.ada)).j.order
  assert.equal(view.role, 'sender'); assert.equal(view.try_to.iban, 'TR120006200000000006295123', 'taker sends lira to the maker\'s own account')
  assert.equal((await call('POST', 'p2p-cancel', { id: o.id }, T.boss)).status, 409, 'payer cannot cancel inside the payment window')
  assert.equal((await call('POST', 'p2p-cancel', { id: o.id }, T.ada)).status, 200, 'lira sender can back out before sending')
  assert.equal(await NGN('boss'), bossBefore, 'refunded')
  // timeout: not marked sent in time → refunded automatically
  const o2 = (await call('POST', 'p2p-order', { adId: ad.id, amountTry: 200_00, method: 'bank' }, T.ada)).j.order
  await q(`update p2p_orders set pay_by = now() - interval '10 minutes' where id = $1`, [o2.id])
  await q(`delete from rate_hits`)
  await call('GET', 'p2p-orders', undefined, T.boss)
  assert.equal((await call('GET', `p2p-order?id=${o2.id}`, undefined, T.boss)).j.order.status, 'cancelled')
  assert.equal(await NGN('boss'), bossBefore)
})

test('appeal: Naira stays held; Luda team decides from Held money', async () => {
  const ad = (await call('GET', 'p2p?want=buy', undefined, T.ada)).j.ads.find((a: any) => a.maker === 'kemal')
  const pm = (await call('GET', 'pay-methods', undefined, T.ada)).j.methods[0]
  const o = (await call('POST', 'p2p-order', { adId: ad.id, amountTry: 100_00, method: 'bank', payMethodId: pm.id, pin: '4826' }, T.ada)).j.order
  await call('POST', 'p2p-sent', { id: o.id, files: [RECEIPT] }, T.kemal)
  assert.match((await call('POST', 'p2p-appeal', { id: o.id }, T.kemal)).j.error, /what went wrong/)
  assert.match((await call('POST', 'p2p-appeal', { id: o.id, reason: 'Buyer not answering' }, T.kemal)).j.error, /15 minutes/, 'appeal only after the waiting time')
  await q(`update p2p_orders set sent_at = now() - interval '20 minutes' where id = $1`, [o.id])
  assert.equal((await call('POST', 'p2p-appeal', { id: o.id, reason: 'I sent it 2 hours ago, buyer not answering' }, T.kemal)).status, 200)
  const held = (await call('GET', 'admin-escrows', undefined, T.boss)).j.escrows.find((e: any) => e.item?.type === 'p2p' && e.item.id === o.id)
  assert.ok(held, 'shows in Held money'); assert.equal(held.item.status, 'appeal')
  assert.equal((await call('GET', `admin-p2p?id=${o.id}`, undefined, T.boss)).j.order.receiptUrls.length, 1, 'team sees the receipt')
  const kemalBefore = await NGN('kemal')
  assert.equal((await call('POST', 'admin-escrow', { escrowId: held.id, to: 'payee', note: 'Bank receipt checked', pin: '4826' }, T.boss)).status, 200)
  assert.equal(await NGN('kemal'), kemalBefore + 4_050_00 - 40_50, '₺100 trade: 0.5% is ₺0.50, so the ₺1 minimum applies (₦40.50 at this trade\'s rate)')
  const msgs = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.ada)).j.order.messages
  assert.match(msgs.at(-1).body, /Luda team decision/)
})

test('dollars too; disputes in stages: negotiation → Luda review (claim, message, decide); auto-appeal after 1 hour', async () => {
  assert.match((await call('POST', 'pay-method-add', { bank: 'Garanti BBVA', iban: 'GB12', currency: 'USD' }, T.ada)).j.error, /IBAN/)
  const usd = (await call('POST', 'pay-method-add', { bank: 'Garanti BBVA', iban: 'TR120006200000000006295999', currency: 'USD' }, T.ada)).j.method
  assert.equal(usd.currency, 'USD')
  const mine = (await call('GET', 'p2p?want=buy', undefined, T.kemal)).j.mine[0]
  await call('POST', 'p2p-ad-save', { id: mine.id, side: 'sell', price: 40.5, minTry: 100_00, maxTry: 100_00, methods: ['bank'], status: 'removed' }, T.kemal)
  // FX_TRY_RATES has USD 0.025 per TRY and 40 NGN per TRY → ₦1,600 per $1 market
  assert.match((await call('POST', 'p2p-ad-save', { side: 'sell', asset: 'USD', price: 40, minTry: 100_00, maxTry: 1_000_00, methods: ['bank'] }, T.kemal)).j.error, /\$1/, 'dollar price checked against the dollar rate')
  const ad = (await call('POST', 'p2p-ad-save', { side: 'sell', asset: 'USD', price: 1650, minTry: 50_00, maxTry: 500_00, methods: ['bank'], city: 'girne' }, T.kemal)).j.ad
  assert.equal(ad.asset, 'USD')
  const list = (await call('GET', 'p2p?want=buy&asset=USD', undefined, T.ada)).j
  assert.equal(list.ads.length, 1); assert.equal(list.asset, 'USD'); assert.equal(Math.round(list.market), 1600)
  assert.equal((await call('GET', 'p2p?want=buy', undefined, T.ada)).j.ads.some((a: any) => a.asset === 'USD'), false, 'lira list has no dollar ads')
  const tryAcct = (await call('GET', 'pay-methods', undefined, T.ada)).j.methods.find((m: any) => m.currency === 'TRY')
  assert.match((await call('POST', 'p2p-order', { adId: ad.id, amountTry: 100_00, method: 'bank', payMethodId: tryAcct.id, pin: '4826' }, T.ada)).j.error, /USD bank account/, 'dollars go to a dollar account')
  const o = (await call('POST', 'p2p-order', { adId: ad.id, amountTry: 100_00, method: 'bank', payMethodId: usd.id, pin: '4826' }, T.ada)).j.order
  assert.equal(o.asset, 'USD'); assert.equal(o.amount_ngn, 165_000_00, '$100 × ₦1,650')
  await call('POST', 'p2p-sent', { id: o.id, files: [RECEIPT] }, T.kemal)
  await q(`update p2p_orders set sent_at = now() - interval '20 minutes' where id = $1`, [o.id])
  assert.equal((await call('POST', 'p2p-appeal', { id: o.id, reason: 'The dollars are not in my account' }, T.ada)).status, 200)
  let v = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.ada)).j.order
  assert.equal(v.appeal_stage, 'negotiation'); assert.equal(v.iAppealed, true); assert.equal(v.appealBy, 'payer')
  // the appellant can withdraw while negotiating
  assert.equal((await call('POST', 'p2p-appeal-cancel', { id: o.id }, T.kemal)).status, 409, 'only who appealed')
  assert.equal((await call('POST', 'p2p-appeal-cancel', { id: o.id }, T.ada)).status, 200)
  assert.equal((await call('GET', `p2p-order?id=${o.id}`, undefined, T.ada)).j.order.status, 'sent')
  // auto-appeal after 1 hour without release → straight to Luda review
  await q(`update p2p_orders set sent_at = now() - interval '61 minutes' where id = $1`, [o.id]); await q(`delete from rate_hits`)
  await call('GET', 'p2p-orders', undefined, T.ada)
  v = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.ada)).j.order
  assert.equal(v.status, 'appeal'); assert.equal(v.appeal_stage, 'review'); assert.equal(v.appealBy, 'auto')
  // staff: dispute role 'edit' can claim + message; deciding needs 'full'
  await call('POST', 'admin-staff-set', { email: 'new@x.com', roles: { disputes: 'edit' }, pin: '4826' }, T.boss)
  assert.equal((await call('GET', 'admin-p2p', undefined, T.new)).j.orders[0].id, o.id, 'appeals queue')
  assert.equal((await call('POST', 'admin-p2p-claim', { id: o.id }, T.new)).status, 200)
  assert.equal((await call('POST', 'admin-p2p-msg', { id: o.id, body: 'Please both upload your bank statements' }, T.new)).status, 200)
  assert.equal((await call('POST', 'admin-p2p-decide', { id: o.id, to: 'payer', note: 'x', pin: '4826' }, T.new)).status, 403, 'deciding needs full')
  const msgs = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.kemal)).j.order.messages
  const staffMsg = msgs.find((m: any) => m.kind === 'staff'); assert.match(staffMsg.by, /Luda team · new/); assert.equal(staffMsg.mine, false)
  assert.equal((await call('GET', `p2p-order?id=${o.id}`, undefined, T.kemal)).j.order.assigned_to, 'new')
  const adaBefore = await NGN('ada')
  assert.equal((await call('POST', 'admin-p2p-decide', { id: o.id, to: 'payer', note: 'No transfer in the statement', pin: '4826' }, T.boss)).status, 200)
  assert.equal(await NGN('ada'), adaBefore + 165_000_00, 'refunded in full')
  v = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.ada)).j.order
  assert.equal(v.status, 'cancelled'); assert.equal(v.appeal_stage, 'decided')
})

test('money is never created or lost: wallets + held escrow + Luda fees = everything put in', async () => {
  const seeded = Number((await q(`select coalesce(sum(amount_minor),0) s from ledger where kind = 'adjustment' and currency = 'NGN'`))[0].s)
  const wallets = Number((await q(`select coalesce(sum(balance_minor),0) s from wallets where currency = 'NGN'`))[0].s)
  const held = Number((await q(`select coalesce(sum(amount_minor),0) s from escrows where status = 'held' and currency = 'NGN'`))[0].s)
  const fees = Number((await q(`select coalesce(sum(fee_minor),0) s from escrows where status = 'released' and currency = 'NGN'`))[0].s)
  assert.equal(wallets + held + fees, seeded)
  const mismatched = await q(`select w.user_id from wallets w left join (select user_id, currency, sum(amount_minor) s from ledger group by 1,2) l using (user_id, currency) where w.balance_minor <> coalesce(l.s, 0)`)
  assert.equal(mismatched.length, 0, 'every wallet equals its ledger')
  assert.equal((await q(`select count(*) n from wallets where balance_minor < 0`))[0].n, 0)
})
