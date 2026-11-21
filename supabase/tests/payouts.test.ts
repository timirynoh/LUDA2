// v1.26.0: withdrawals the providers refuse wait in Luda HQ → Payouts; the team claims, pays by hand with a receipt,
// or refunds with a reason. Staff are alerted right away; the health check flags ones waiting over 15 minutes.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, runHealth, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], world: ReturnType<typeof fakeWorld>['world']
const env: any = { ...ENV, ADMIN_EMAILS: 'boss@x.com' }
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.14.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const PHOTO = { type: 'image/png', data: Buffer.from('fakepng').toString('base64') }
const NGN = async (u: string) => Number((await q(`select balance_minor from wallets where user_id=$1 and currency='NGN'`, [id[u]]))[0]?.balance_minor ?? 0)

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name] of [['ada', 'Ada Chioma Okafor'], ['boss', 'Luda Boss'], ['musa', 'Musa Staff']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
  await q(`update profiles set kyc_status='verified', kyc_name='ADA CHIOMA OKAFOR' where username='ada'`)
  await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id.ada, currency: 'NGN', amount_minor: 50_000_00, kind: 'adjustment', ref: 'seed-ada' }])])
  await q(`insert into staff (email, roles) values ('musa@x.com', '{"money":"edit"}'::jsonb)`)
  world.transferReply = 'starter'; world.flwReply = 'ip' // both providers refuse, like the live account today
})

test('refused withdrawal → team queue → claimed → paid by hand with a receipt; the user is told', async () => {
  const start = await NGN('ada')
  const w = (await call('POST', 'withdraw', { amountMinor: 5_000_00, account: '0123456789', bankCode: '058', pin: '4826' }, T.ada)).j
  assert.equal(w.status, 'processing')
  const held = await NGN('ada'); assert.ok(held < start)
  // staff are alerted at once (urgent To do → phone push)
  assert.ok((await call('GET', 'todo', undefined, T.musa)).j.items.some((i: any) => i.key === `staffpay:${w.reference}` && i.level === 'urgent'))
  assert.ok(!(await call('GET', 'todo', undefined, T.ada)).j.items.some((i: any) => i.key.startsWith('staffpay:')))
  const queue = (await call('GET', 'admin-withdrawals?status=manual', undefined, T.musa)).j.withdrawals
  assert.equal(queue.length, 1); assert.equal(queue[0].account_number, '0123456789', 'full account number for the team to copy')
  // one person at a time
  assert.equal((await call('POST', 'admin-payout-claim', { reference: w.reference }, T.musa)).j.claimedBy, 'musa')
  assert.match((await call('POST', 'admin-payout-claim', { reference: w.reference }, T.boss)).j.error, /@musa is already paying/)
  assert.match((await call('POST', 'admin-payout', { reference: w.reference, paid: true, checked: true, files: [PHOTO], pin: '4826' }, T.boss)).j.error, /@musa is paying/)
  assert.ok(!(await call('GET', 'todo', undefined, T.boss)).j.items.some((i: any) => i.key === `staffpay:${w.reference}`), 'claimed → no longer an alert')
  // receipt + tick required
  assert.match((await call('POST', 'admin-payout', { reference: w.reference, paid: true, files: [PHOTO], pin: '4826' }, T.musa)).j.error, /Tick/)
  assert.match((await call('POST', 'admin-payout', { reference: w.reference, paid: true, checked: true, pin: '4826' }, T.musa)).j.error, /receipt/)
  assert.equal((await call('POST', 'admin-payout', { reference: w.reference, paid: true, checked: true, files: [PHOTO], pin: '4826' }, T.musa)).status, 200)
  const row = (await q(`select status, paid_by, array_length(receipt,1) n from withdrawals where reference=$1`, [w.reference]))[0]
  assert.deepEqual([row.status, row.paid_by, row.n], ['paid', 'musa', 1])
  assert.equal(await NGN('ada'), held, 'paid: the held money is gone from the wallet (it went to the bank)')
  assert.ok((await call('GET', 'inbox', undefined, T.ada)).j.items.some((n: any) => /Withdrawal sent/.test(n.title)))
  assert.equal((await call('POST', 'admin-payout', { reference: w.reference, paid: true, checked: true, files: [PHOTO], pin: '4826' }, T.musa)).status, 409, 'once')
})

test('a payout that truly cannot be paid is refunded with a reason (money:full only); health flags slow ones', async () => {
  const start = await NGN('ada')
  const w = (await call('POST', 'withdraw', { amountMinor: 1_000_00, account: '0123456789', bankCode: '058', pin: '4826' }, T.ada)).j
  assert.equal((await call('POST', 'admin-payout', { reference: w.reference, paid: false, note: 'Bank rejected', pin: '4826' }, T.musa)).status, 403)
  await q(`update withdrawals set created_at = now() - interval '20 minutes' where reference=$1`, [w.reference])
  const h = await runHealth(env, d, 'test')
  assert.ok(h.problems.some((p: any) => p.code === 'manual-payouts'), 'waiting > 15 min is flagged')
  assert.ok(!h.problems.some((p: any) => p.code === 'payouts'), 'not counted as a stuck provider payout')
  assert.match((await call('POST', 'admin-payout', { reference: w.reference, paid: false, pin: '4826' }, T.boss)).j.error, /why/)
  assert.equal((await call('POST', 'admin-payout', { reference: w.reference, paid: false, note: 'The bank account is closed', pin: '4826' }, T.boss)).status, 200)
  assert.equal(await NGN('ada'), start, 'amount + fee back')
  assert.ok((await call('GET', 'inbox', undefined, T.ada)).j.items.some((n: any) => /Withdrawal returned/.test(n.title)))
})
