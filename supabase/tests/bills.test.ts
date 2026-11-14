// v1.22.0 bills: team queue with claims, saved bills + monthly reminder, rent by bank transfer, automatic mobile top-ups.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { mobileNumber } from '../functions/_shared/topup.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], world: ReturnType<typeof fakeWorld>['world']
let env: any = { ...ENV, ADMIN_EMAILS: 'boss@x.com', RELOADLY_CLIENT_ID: 'rl_id', RELOADLY_CLIENT_SECRET: 'rl_secret', TOPUP_OPERATORS: 'telsim:1234,turkcell:5678' }
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const PHOTO = { type: 'image/png', data: Buffer.from('fakepng').toString('base64') }
const TRY = async (u: string) => Number((await q(`select balance_minor from wallets where user_id=$1 and currency='TRY'`, [id[u]]))[0]?.balance_minor ?? 0)

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name] of [['ada', 'Ada Okafor'], ['boss', 'Luda Boss'], ['tolu', 'Tolu Staff']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name)`)
  await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id.ada, currency: 'TRY', amount_minor: 20_000_00, kind: 'adjustment', ref: 'seed-ada' }])])
  await q(`insert into staff (email, roles) values ('tolu@x.com', '{"bills":"edit"}'::jsonb)`)
})

test('mobile numbers are normalised for the top-up partner', () => {
  assert.equal(mobileNumber('0533 123 45 67'), '905331234567')
  assert.equal(mobileNumber('+90 542 111 22 33'), '905421112233')
  assert.equal(mobileNumber('5481112233'), '905481112233')
  assert.equal(mobileNumber('12345'), null)
})

test('automatic top-up: paid by the partner straight away, the user is told, fee kept', async () => {
  const before = await TRY('ada')
  const f = await call('GET', 'features', undefined, T.ada)
  assert.deepEqual(f.j.topup.billers.sort(), ['telsim', 'turkcell'])
  const base = { type: 'phone', biller: 'telsim', provider: 'Vodafone Telsim', account: '0542 111 22 33', amountMinor: 200_00, details: { kind: 'TL top-up (prepaid)' }, confirmed: true, pin: '4826' }
  assert.match((await call('POST', 'bill-create', { ...base, account: '12345' }, T.ada)).j.error, /mobile number/)
  const r = await call('POST', 'bill-create', base, T.ada)
  assert.equal(r.status, 200); assert.equal(r.j.bill.status, 'paid'); assert.equal(r.j.bill.auto.status, 'paid')
  const sent = [...world.topups.values()].pop()!
  assert.equal(sent.body.operatorId, 1234); assert.equal(sent.body.amount, 200); assert.equal(sent.body.recipientPhone.number, '905421112233')
  assert.equal(await TRY('ada'), before - 210_00, 'top-up + ₺10 fee')
  const inbox = (await call('GET', 'inbox', undefined, T.ada)).j.items
  assert.ok(inbox.some((n: any) => /Top-up sent/.test(n.title)))
  // a postpaid phone bill is never automatic
  const post = await call('POST', 'bill-create', { ...base, details: { kind: 'Monthly bill (postpaid)' } }, T.ada)
  assert.equal(post.j.bill.status, 'pending'); assert.equal(post.j.bill.auto, null)
})

test('top-up still processing: staff cannot pay it; when the partner says done it settles itself', async () => {
  world.topup = 'PROCESSING'
  const r = await call('POST', 'bill-create', { type: 'phone', biller: 'turkcell', provider: 'Kuzey Kıbrıs Turkcell', account: '05331234567', amountMinor: 100_00, details: { kind: 'TL top-up (prepaid)' }, confirmed: true, pin: '4826' }, T.ada)
  assert.equal(r.j.bill.status, 'pending'); assert.equal(r.j.bill.auto.status, 'processing')
  assert.equal((await call('POST', 'admin-bill-claim', { billId: r.j.bill.id }, T.boss)).status, 409, 'cannot claim while the partner is working')
  assert.match((await call('POST', 'admin-bill', { billId: r.j.bill.id, paid: true, checked: true, files: [PHOTO], pin: '4826' }, T.boss)).j.error, /automatic top-up/)
  const tid = [...world.topups.keys()].pop()!; world.topups.get(tid)!.status = 'SUCCESSFUL'
  const mine = (await call('GET', 'features', undefined, T.ada)).j.bills
  assert.equal(mine.find((b: any) => b.id === r.j.bill.id).status, 'paid')
  world.topup = 'SUCCESSFUL'
})

test('partner refuses: the bill waits for the team (money stays held, nothing lost)', async () => {
  world.topup = 'refuse'
  const before = await TRY('ada')
  const r = await call('POST', 'bill-create', { type: 'phone', biller: 'telsim', provider: 'Vodafone Telsim', account: '05421112233', amountMinor: 50_00, details: { kind: 'TL top-up (prepaid)' }, confirmed: true, pin: '4826' }, T.ada)
  assert.equal(r.j.bill.status, 'pending'); assert.equal(r.j.bill.auto.status, 'refused')
  assert.equal(await TRY('ada'), before - 60_00)
  const q1 = (await call('GET', 'admin-bills', undefined, T.boss)).j.bills
  assert.equal(q1.find((b: any) => b.id === r.j.bill.id).auto.status, 'refused', 'HQ sees why it fell back')
  world.topup = 'SUCCESSFUL'
})

test('team queue: soonest promised first, one person claims, receipt check required, To do for staff', async () => {
  const kib = { type: 'electricity', biller: 'kibtek', provider: 'KIB-TEK', account: '0123456', amountMinor: 300_00, details: { name: 'Ada Okafor', district: 'Girne', meter: 'Monthly bill' }, confirmed: true, pin: '4826' }
  const b1 = (await call('POST', 'bill-create', kib, T.ada)).j.bill
  await q(`update bills set eta_at = now() + interval '10 minutes' where id=$1`, [b1.id])
  const todo = (await call('GET', 'todo', undefined, T.tolu)).j.items
  assert.ok(todo.some((i: any) => i.key === `staffbill:${b1.id}:late` && i.level === 'urgent'), 'staff hear about bills close to the promised time')
  assert.ok(!(await call('GET', 'todo', undefined, T.ada)).j.items.some((i: any) => i.key.startsWith('staffbill:')), 'not for normal users')
  const list = (await call('GET', 'admin-bills', undefined, T.tolu)).j.bills
  assert.equal(list[0].id, b1.id, 'soonest promised first')
  assert.equal((await call('POST', 'admin-bill-claim', { billId: b1.id }, T.tolu)).j.claimedBy, 'tolu')
  assert.match((await call('POST', 'admin-bill-claim', { billId: b1.id }, T.boss)).j.error, /@tolu is already paying/)
  assert.match((await call('POST', 'admin-bill', { billId: b1.id, paid: true, checked: true, files: [PHOTO], pin: '4826' }, T.boss)).j.error, /@tolu is paying/)
  const userView = (await call('GET', 'features', undefined, T.ada)).j.bills.find((b: any) => b.id === b1.id)
  assert.ok(userView.claimed_at, 'the user sees it is being paid now'); assert.equal(userView.claimed_by, undefined, 'but not who')
  assert.match((await call('POST', 'admin-bill', { billId: b1.id, paid: true, files: [PHOTO], pin: '4826' }, T.tolu)).j.error, /Tick/)
  assert.equal((await call('POST', 'admin-bill', { billId: b1.id, paid: true, checked: true, files: [PHOTO], pin: '4826' }, T.tolu)).status, 200)
  // a claim older than 45 minutes can be taken over
  const b2 = (await call('POST', 'bill-create', { ...kib, account: '0999999' }, T.ada)).j.bill
  await call('POST', 'admin-bill-claim', { billId: b2.id }, T.tolu)
  await q(`update bills set claimed_at = now() - interval '50 minutes' where id=$1`, [b2.id])
  assert.equal((await call('POST', 'admin-bill-claim', { billId: b2.id }, T.boss)).status, 200)
  assert.equal((await call('POST', 'admin-bill-claim', { billId: b2.id, release: true }, T.boss)).status, 200)
})

test('saved bills: saved when paying, reminder on the day, two-tap pay marks it paid for the month', async () => {
  const kib = { type: 'electricity', biller: 'kibtek', provider: 'KIB-TEK', account: '7777777', amountMinor: 450_00, details: { name: 'Ada Okafor', district: 'Girne', meter: 'Monthly bill', period: 'Nov' }, confirmed: true, pin: '4826' }
  const paid = (await call('POST', 'bill-create', { ...kib, save: true, label: 'My flat', remind: 1 }, T.ada)).j.bill
  let saved = (await call('GET', 'features', undefined, T.ada)).j.saved
  const s = saved.find((x: any) => x.account === '7777777')
  assert.equal(s.label, 'My flat'); assert.equal(s.remind_day, 1); assert.equal(Number(s.amount_minor), 450_00); assert.equal(s.paidThisMonth, true)
  assert.equal(s.details.period, undefined, 'the month is not saved')
  // next month: due → To do reminder (not while this one is still being paid)
  await call('POST', 'admin-bill', { billId: paid.id, paid: true, checked: true, files: [PHOTO], pin: '4826' }, T.boss)
  await q(`update saved_bills set last_paid_at = now() - interval '40 days' where id=$1`, [s.id])
  const todo = (await call('GET', 'todo', undefined, T.ada)).j.items
  assert.ok(todo.some((i: any) => i.key.startsWith(`savedbill:${s.id}`) && i.to === `/bills?pay=${s.id}`))
  // reminder off, rename, without paying
  await call('POST', 'saved-bill-save', { biller: 'kibtek', type: 'electricity', provider: 'KIB-TEK', account: '7777777', label: 'Home', remind: 0, details: { name: 'Ada Okafor' } }, T.ada)
  saved = (await call('GET', 'features', undefined, T.ada)).j.saved
  assert.equal(saved.find((x: any) => x.id === s.id).remind_day, null); assert.equal(saved.find((x: any) => x.id === s.id).label, 'Home')
  assert.equal((await call('POST', 'saved-bill-remove', { id: s.id }, T.boss)).status, 404, 'only the owner')
  assert.equal((await call('POST', 'saved-bill-remove', { id: s.id }, T.ada)).status, 200)
})

test('rent: landlord, IBAN and month are required', async () => {
  const rent = { type: 'rent', biller: 'rent', provider: 'Rent', account: 'Flat4B', amountMinor: 8_000_00, confirmed: true, pin: '4826' }
  assert.match((await call('POST', 'bill-create', { ...rent, details: { landlord: 'Mehmet Yılmaz' } }, T.ada)).j.error, /IBAN/)
  const r = await call('POST', 'bill-create', { ...rent, details: { landlord: 'Mehmet Yılmaz', iban: 'TR33 0006 1005 1978 6457 8413 26', period: 'December 2026' } }, T.ada)
  assert.equal(r.status, 200); assert.equal(r.j.bill.details.iban, 'TR330006100519786457841326'); assert.equal(Number(r.j.bill.fee_minor), 20_00)
})

test('HQ can list the partner operators to switch on the right ones', async () => {
  assert.equal((await call('GET', 'admin-topup-operators?country=TR', undefined, T.tolu)).status, 403, 'needs bills:full')
  const r = await call('GET', 'admin-topup-operators?country=TR', undefined, T.boss)
  assert.equal(r.j.on, true); assert.equal(r.j.operators[0].name, 'KKTC Telsim'); assert.equal(r.j.active.telsim.id, 1234)
})
