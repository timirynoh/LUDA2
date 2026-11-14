// Savings pots, assisted bill pay, marketplace and Flash help on the real wallet. Run: cd supabase && npm test
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
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}
const id: Record<string, string> = {}
const TRY = async (who: string) => (await call('GET', 'me', undefined, T[who])).j.balances.TRY as number
const PHOTO = { type: 'image/png', data: Buffer.from('fakepng').toString('base64') }

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q)
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name, email] of [['ada', 'Ada Okafor', 'ada@x.com'], ['kwame', 'Kwame Mensah', 'kwame@x.com'], ['boss', 'Luda Boss', 'boss@x.com']]) {
    const r = await call('POST', 'signup', { email, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
    await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id[u], currency: 'TRY', amount_minor: 5_000_00, kind: 'adjustment', ref: 'seed-' + u }])])
  }
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name) where username in ('kwame','boss')`)
})

test('savings pots: money moves wallet ⇄ pot with the PIN; locked pots stay locked', async () => {
  const p = (await call('POST', 'pot-create', { name: 'Rent January', emoji: '🏠', currency: 'TRY', goalMinor: 3_000_00 }, T.ada)).j.pot
  assert.ok(p.id)
  assert.equal((await call('POST', 'pot-move', { potId: p.id, amountMinor: 1_000_00, pin: '0000' }, T.ada)).status, 401, 'wrong PIN')
  assert.equal((await call('POST', 'pot-move', { potId: p.id, amountMinor: 1_000_00, pin: '4826' }, T.ada)).j.pot.balance_minor, 1_000_00)
  assert.equal(await TRY('ada'), 4_000_00)
  assert.match((await call('POST', 'pot-move', { potId: p.id, amountMinor: -2_000_00, pin: '4826' }, T.ada)).j.error, /Not enough/)
  assert.match((await call('POST', 'pot-close', { potId: p.id }, T.ada)).j.error, /Move the money back/)
  await call('POST', 'pot-move', { potId: p.id, amountMinor: -1_000_00, pin: '4826' }, T.ada)
  assert.equal(await TRY('ada'), 5_000_00)
  assert.equal((await call('POST', 'pot-close', { potId: p.id }, T.ada)).status, 200)
  const lock = (await call('POST', 'pot-create', { name: 'Flight home', currency: 'TRY', lockDays: 30 }, T.ada)).j.pot
  await call('POST', 'pot-move', { potId: lock.id, amountMinor: 500_00, pin: '4826' }, T.ada)
  assert.match((await call('POST', 'pot-move', { potId: lock.id, amountMinor: -500_00, pin: '4826' }, T.ada)).j.error, /locked/)
  assert.equal((await call('POST', 'pot-move', { potId: lock.id, amountMinor: 100_00, pin: '4826' }, T.kwame)).status, 409, "can't use someone else's pot")
  const f = (await call('GET', 'features', undefined, T.ada)).j
  assert.equal(f.pots.length, 1); assert.equal(f.fees.billMinor, 10_00); assert.equal(f.fees.billHighMinor, 20_00)
})

test('assisted bill pay: held from the wallet, team pays with a receipt, or refunds with a reason', async () => {
  const before = await TRY('ada')
  assert.match((await call('POST', 'bill-create', { type: 'electricity', provider: 'KIB-TEK', account: '12345678', amountMinor: 5_00, pin: '4826' }, T.ada)).j.error, /between/)
  const kib = { type: 'electricity', provider: 'KIB-TEK', account: '12345678', amountMinor: 640_00, pin: '4826', files: [PHOTO], details: { name: 'Ada Okafor', district: 'Girne', bad_key_X: 'x' } }
  assert.match((await call('POST', 'bill-create', kib, T.ada)).j.error, /confirm/, 'user must confirm the details')
  assert.match((await call('POST', 'bill-create', { ...kib, type: 'rent', details: { iban: 'TR12' }, confirmed: true }, T.ada)).j.error, /IBAN/)
  const r = await call('POST', 'bill-create', { ...kib, confirmed: true }, T.ada)
  assert.equal(r.status, 200, JSON.stringify(r.j))
  assert.deepEqual(r.j.bill.details, { name: 'Ada Okafor', district: 'Girne' }); assert.ok(Date.parse(r.j.bill.eta_at) > Date.now(), 'an estimated time is promised')
  assert.equal(await TRY('ada'), before - 650_00, 'bill + ₺10 service fee held')
  assert.equal((await call('GET', 'admin-bills', undefined, T.ada)).status, 404, 'not for normal users')
  const list = (await call('GET', 'admin-bills', undefined, T.boss)).j.bills
  const b = list.find((x: any) => x.id === r.j.bill.id)
  assert.equal(b.account_ref, '12345678'); assert.equal(b.amount_minor, 640_00); assert.equal(b.username, 'ada'); assert.equal(b.photoUrls.length, 1); assert.equal(b.details.district, 'Girne', 'admin sees every detail')
  assert.match((await call('POST', 'admin-bill', { billId: b.id, paid: true, checked: true, pin: '4826' }, T.boss)).j.error, /receipt/)
  assert.equal((await call('POST', 'admin-bill', { billId: b.id, paid: true, checked: true, pin: '4826', files: [PHOTO] }, T.boss)).status, 200)
  assert.equal((await call('POST', 'admin-bill', { billId: b.id, paid: false, note: 'x', pin: '4826' }, T.boss)).status, 409, 'handled once')
  const mine = (await call('GET', 'features', undefined, T.ada)).j.bills
  assert.equal(mine[0].status, 'paid'); assert.equal(mine[0].receiptUrls.length, 1)
  assert.equal(await TRY('ada'), before - 650_00)
  // refused → everything back
  const r2 = await call('POST', 'bill-create', { type: 'water', provider: 'Girne Belediyesi', account: 'W-998', amountMinor: 200_00, pin: '4826', confirmed: true }, T.ada)
  assert.match((await call('POST', 'admin-bill', { billId: r2.j.bill.id, paid: false, pin: '4826' }, T.boss)).j.error, /why/)
  await call('POST', 'admin-bill', { billId: r2.j.bill.id, paid: false, note: 'Account number not found', pin: '4826' }, T.boss)
  assert.equal(await TRY('ada'), before - 650_00, 'refunded incl. fee')
  // bigger bills: ₺20 fee above ₺1,000
  const r3 = await call('POST', 'bill-create', { type: 'rent', provider: 'Rent', account: 'ROOM-4', amountMinor: 1_500_00, pin: '4826', confirmed: true, details: { iban: 'TR33 0006 1005 1978 6457 8413 26', landlord: 'Mehmet Y.', period: 'Nov 2026' } }, T.ada)
  assert.equal(r3.status, 200, JSON.stringify(r3.j)); assert.equal(r3.j.bill.fee_minor, 20_00); assert.equal(r3.j.bill.details.iban, 'TR330006100519786457841326')
})

test('bill ETA: ~2h in working hours, next morning 11:00 at night (Cyprus time)', async () => {
  const { billEta } = await import('../functions/_shared/handlers.ts')
  assert.equal(billEta(new Date('2026-11-03T08:00:00Z')).toISOString(), '2026-11-03T10:00:00.000Z') // 11:00 local → 13:00 local
  assert.equal(billEta(new Date('2026-11-03T19:30:00Z')).toISOString(), '2026-11-04T08:00:00.000Z') // 22:30 local → 11:00 next day
  assert.equal(billEta(new Date('2026-11-03T03:00:00Z')).toISOString(), '2026-11-03T08:00:00.000Z') // 06:00 local → 11:00 same day
})

test('marketplace: buyer pays into escrow, seller paid on receipt (minus 2%), cancel refunds; scams blocked', async () => {
  assert.equal((await call('POST', 'market-list', { title: 'Desk lamp', priceMinor: 150_00 }, T.ada)).status, 403, 'selling needs ID')
  assert.match((await call('POST', 'market-list', { title: 'iPhone, send deposit first to secure it', priceMinor: 9_000_00 }, T.kwame)).j.error, /upfront/)
  const item = (await call('POST', 'market-list', { title: 'Rice cooker', description: 'Used 3 months', category: 'kitchen', city: 'girne', priceMinor: 600_00, photos: [PHOTO] }, T.kwame)).j.item
  const list = (await call('GET', 'market?city=girne', undefined, T.ada)).j
  const seen = list.items.find((x: any) => x.id === item.id)
  assert.equal(seen.seller_name, 'kwame'); assert.equal(seen.photoUrls.length, 1); assert.equal(seen.seller, undefined)
  assert.equal((await call('POST', 'market-buy', { id: item.id, pin: '4826' }, T.kwame)).status, 409, 'not your own')
  const [a0, k0] = [await TRY('ada'), await TRY('kwame')]
  assert.equal((await call('POST', 'market-buy', { id: item.id, pin: '4826' }, T.ada)).status, 200)
  assert.equal(await TRY('ada'), a0 - 600_00)
  assert.equal((await call('POST', 'market-buy', { id: item.id, pin: '4826' }, T.boss)).status, 409, 'already reserved')
  assert.equal((await call('POST', 'market-received', { id: item.id, pin: '4826' }, T.kwame)).status, 409, 'only the buyer confirms')
  assert.equal((await call('POST', 'market-received', { id: item.id, pin: '4826' }, T.ada)).status, 200)
  assert.equal(await TRY('kwame'), k0 + 588_00, 'seller gets ₺600 − 2%')
  assert.equal((await call('POST', 'market-received', { id: item.id, pin: '4826' }, T.ada)).status, 409, 'paid once')
  // seller cancels a reserved sale → buyer refunded, item back on sale
  const it2 = (await call('POST', 'market-list', { title: 'Study chair', priceMinor: 300_00 }, T.kwame)).j.item
  const a1 = await TRY('ada')
  await call('POST', 'market-buy', { id: it2.id, pin: '4826' }, T.ada)
  assert.equal((await call('POST', 'market-cancel', { id: it2.id }, T.kwame)).status, 200)
  assert.equal(await TRY('ada'), a1)
  assert.ok((await call('GET', 'market', undefined, T.ada)).j.items.some((x: any) => x.id === it2.id), 'on sale again')
  // dispute → the team decides
  await call('POST', 'market-buy', { id: it2.id, pin: '4826' }, T.ada)
  const esc = (await call('GET', 'admin-escrows', undefined, T.boss)).j.escrows.find((e: any) => e.item?.id === it2.id)
  assert.equal(esc.payer_name, 'ada'); assert.equal(esc.payee_name, 'kwame')
  assert.equal((await call('POST', 'admin-escrow', { escrowId: esc.id, to: 'payer', note: 'Item never delivered', pin: '4826' }, T.boss)).status, 200)
  assert.equal(await TRY('ada'), a1)
  // auto-release after 7 days with no open case
  const it3 = (await call('POST', 'market-list', { title: 'Kettle', priceMinor: 100_00 }, T.kwame)).j.item
  await call('POST', 'market-buy', { id: it3.id, pin: '4826' }, T.ada)
  await q(`update listings set reserved_at = now() - interval '8 days' where id = $1`, [it3.id])
  const k1 = await TRY('kwame')
  await q(`delete from rate_hits`).catch(() => {})
  await call('GET', 'market', undefined, T.kwame)
  assert.equal(await TRY('kwame'), k1 + 98_00)
})

test('Flash help: chat + the helper\'s own price; only the ACCEPTED price is held; finish with photos; confirm pays', async () => {
  const a0 = await TRY('ada')
  const j = (await call('POST', 'flash-post', { title: 'Help me carry a fridge', details: 'Ground floor to 3rd, Girne centre', city: 'girne', budgetMinor: 200_00, pay: 'luda', files: [PHOTO] }, T.ada)).j.job
  assert.equal(await TRY('ada'), a0, 'nothing is held when posting')
  assert.equal(j.photos.length, 1)
  await q(`update profiles set kyc_status='none' where username='boss'`)
  assert.equal((await call('POST', 'flash-quote', { id: j.id, amountMinor: 180_00 }, T.boss)).status, 403, 'pricing needs ID')
  await q(`update profiles set kyc_status='verified' where username='boss'`)
  await q(`update profiles set kyc_status='verified' where username='ada'`)
  assert.equal((await call('POST', 'flash-quote', { id: j.id, amountMinor: 180_00 }, T.ada)).status, 409, 'not on your own request')
  // two helpers talk to the poster and send their own prices
  assert.equal((await call('POST', 'flash-msg', { id: j.id, body: 'Is there a lift?' }, T.kwame)).status, 200)
  assert.equal((await call('POST', 'flash-quote', { id: j.id, amountMinor: 250_00, note: 'Fridge is heavy, needs 2 people' }, T.kwame)).status, 200)
  assert.equal((await call('POST', 'flash-quote', { id: j.id, amountMinor: 180_00 }, T.boss)).status, 200)
  assert.equal((await call('POST', 'flash-msg', { id: j.id, helper: id.kwame, body: 'No lift, sorry' }, T.ada)).status, 200)
  const seen = (await call('GET', `flash-job?id=${j.id}`, undefined, T.ada)).j.job
  assert.equal(seen.threads.length, 2, 'the poster sees every helper')
  assert.equal((await call('GET', `flash-job?id=${j.id}`, undefined, T.kwame)).j.job.threads.length, 1, 'a helper sees only their own chat')
  assert.ok((await call('GET', 'todo', undefined, T.ada)).j.items.some((i: any) => i.key.startsWith('flashq:') && /250/.test(i.title)))
  const kq = seen.threads.find((t: any) => t.helper_name === 'kwame').messages.find((m: any) => m.kind === 'quote')
  // short wallet → told how much to top up, nothing held
  await q(`update flash_msgs set amount_minor = 9_000_00 where id=$1`, [kq.id])
  const short = await call('POST', 'flash-accept', { id: j.id, msgId: kq.id, pin: '4826' }, T.ada)
  assert.equal(short.status, 402); assert.match(short.j.error, /^Top up ₺[\d,]+ to accept this price/)
  await q(`update flash_msgs set amount_minor = 250_00 where id=$1`, [kq.id])
  assert.equal((await call('POST', 'flash-accept', { id: j.id, msgId: kq.id, pin: '4826' }, T.ada)).status, 200)
  assert.equal(await TRY('ada'), a0 - 250_00, 'the accepted ₺250 is held, not the ₺200 budget')
  assert.equal((await call('POST', 'flash-quote', { id: j.id, amountMinor: 150_00 }, T.boss)).status, 409, 'too late for other prices')
  assert.match((await call('POST', 'flash-cancel', { id: j.id }, T.ada)).j.error, /already doing/)
  // helper gives it back → money back, request open again
  await call('POST', 'flash-drop', { id: j.id }, T.kwame)
  assert.equal(await TRY('ada'), a0)
  await call('POST', 'flash-quote', { id: j.id, amountMinor: 180_00 }, T.boss)
  const bq = (await call('GET', `flash-job?id=${j.id}`, undefined, T.ada)).j.job.threads.find((t: any) => t.helper_name === 'boss').messages.filter((m: any) => m.kind === 'quote' && m.quote_status === 'pending')[0]
  await call('POST', 'flash-accept', { id: j.id, msgId: bq.id, pin: '4826' }, T.ada)
  assert.match((await call('POST', 'flash-finished', { id: j.id }, T.boss)).j.error, /photo/, 'finish needs photos')
  assert.equal((await call('POST', 'flash-finished', { id: j.id, files: [PHOTO], note: 'Done, all moved' }, T.boss)).status, 200)
  assert.ok((await call('GET', 'todo', undefined, T.ada)).j.items.some((i: any) => i.key === `flashok:${j.id}` && i.level === 'urgent'))
  const b0 = await TRY('boss')
  assert.equal((await call('POST', 'flash-done', { id: j.id, pin: '4826' }, T.ada)).status, 200)
  assert.equal(await TRY('boss'), b0 + 171_00, 'helper gets ₺180 − 5%')
  // emoji matching still works
  const j2 = (await call('POST', 'flash-post', { title: 'Pick up a parcel', budgetMinor: 50_00 }, T.ada)).j.job
  assert.equal(j.emoji, '🧊', 'fridge → 🧊'); assert.equal(j2.emoji, '🛵', 'parcel → 🛵')
  const j3 = (await call('POST', 'flash-post', { title: 'Need a plumber for a leaking sink', budgetMinor: 50_00, emoji: '<script>' }, T.ada)).j.job
  assert.equal(j3.emoji, '🚰', 'unknown emoji ignored, matched from the title')
  assert.equal((await call('GET', 'flash', undefined, T.kwame)).j.open.find((x: any) => x.id === j3.id).emoji, '🚰', 'stored on the server')
  await call('POST', 'flash-cancel', { id: j3.id }, T.ada)
  assert.equal((await call('POST', 'flash-cancel', { id: j2.id }, T.ada)).status, 200)
  const board = (await call('GET', 'flash', undefined, T.kwame)).j
  assert.ok(board.open.every((x: any) => x.poster === undefined && x.helper === undefined))
})

test('Flash cash jobs: no money held, no PIN; finished with photos; completes automatically 3 days after the photos', async () => {
  const a0 = await TRY('ada'), k0 = await TRY('kwame')
  const j = (await call('POST', 'flash-post', { title: 'Fix my washing machine', budgetMinor: 300_00, pay: 'cash' }, T.ada)).j.job
  assert.equal(j.pay, 'cash')
  await call('POST', 'flash-quote', { id: j.id, amountMinor: 400_00, note: 'Needs a new pump' }, T.kwame)
  const kq = (await call('GET', `flash-job?id=${j.id}`, undefined, T.ada)).j.job.threads[0].messages.find((m: any) => m.kind === 'quote')
  assert.equal((await call('POST', 'flash-accept', { id: j.id, msgId: kq.id }, T.ada)).status, 200, 'cash: no PIN needed, nothing to hold')
  assert.equal(await TRY('ada'), a0)
  await call('POST', 'flash-finished', { id: j.id, files: [PHOTO] }, T.kwame)
  await q(`update flash_jobs set done_at = now() - interval '4 days' where id=$1`, [j.id])
  await q(`delete from rate_hits where key like 'autorel:%'`)
  await call('GET', 'flash', undefined, T.kwame)
  assert.equal((await q(`select status from flash_jobs where id=$1`, [j.id]))[0].status, 'done')
  assert.equal(await TRY('kwame'), k0, 'cash is paid in hand, never through the wallet')
})

test('Flash old-style job (reward held at posting): accepting a price returns the old hold and holds the accepted price', async () => {
  const a0 = await TRY('ada')
  const old = await q(`select luda_flash_post($1, 'Move a sofa', '', 'girne', 200_00, 10_00) j`, [id.ada])
  const jid = old[0].j.id
  await q(`update flash_jobs set legacy = true where id=$1`, [jid])
  assert.equal(await TRY('ada'), a0 - 200_00)
  await call('POST', 'flash-quote', { id: jid, amountMinor: 120_00 }, T.kwame)
  const kq = (await call('GET', `flash-job?id=${jid}`, undefined, T.ada)).j.job.threads[0].messages.find((m: any) => m.kind === 'quote')
  await call('POST', 'flash-accept', { id: jid, msgId: kq.id, pin: '4826' }, T.ada)
  assert.equal(await TRY('ada'), a0 - 120_00, 'old ₺200 back, ₺120 held')
  assert.match((await call('POST', 'flash-video-start', { type: 'application/zip', size: 1000 }, T.ada)).j.error, /MP4/)
  assert.match((await call('POST', 'flash-video-start', { type: 'video/mp4', size: 80_000_000 }, T.ada)).j.error, /50 MB/)
  const vid = { path: `${id.ada}/flash/0123456789abcdef.mp4` } // what flash-video-start hands out (the test storage has no upload links)
  assert.match((await call('POST', 'flash-post', { title: 'Leaking pipe in kitchen', budgetMinor: 100_00, video: `${id.kwame}/flash/aaaaaaaaaaaaaaaa.mp4` }, T.ada)).j.error, /not valid/, "someone else's video path is refused")
  assert.equal((await call('POST', 'flash-post', { title: 'Leaking pipe in kitchen', budgetMinor: 100_00, video: vid.path }, T.ada)).status, 200)
})

test('books still balance: wallets = ledger; held money = open escrows', async () => {
  const bad = await q(`select w.user_id from wallets w left join (select user_id, currency, sum(amount_minor) s from ledger group by 1,2) l using (user_id, currency) where w.balance_minor <> coalesce(l.s, 0)`)
  assert.equal(bad.length, 0)
  const pots = Number((await q(`select coalesce(sum(balance_minor),0) s from pots`))[0].s)
  const held = Number((await q(`select coalesce(sum(amount_minor),0) s from escrows where status='held'`))[0].s)
  const wallets = Number((await q(`select coalesce(sum(balance_minor),0) s from wallets where currency='TRY'`))[0].s)
  const fees = Number((await q(`select coalesce(sum(fee_minor),0) s from escrows where status='released' and kind <> 'bill'`))[0].s)
  const bills = Number((await q(`select coalesce(sum(amount_minor),0) s from escrows where status='released' and kind = 'bill'`))[0].s)
  assert.equal(wallets + pots + held + fees + bills, 15_000_00, 'every lira accounted for')
})
