// v1.24.0: daily health check — closes old unpaid top-ups, checks money integrity and webhooks, alerts the owner.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { closeStalePayments, handleApi, runHealth, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], world: ReturnType<typeof fakeWorld>['world']
const env: any = { ...ENV, ADMIN_EMAILS: 'boss@x.com' }
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.12.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const NGN = async (u: string) => Number((await q(`select balance_minor from wallets where user_id=$1 and currency='NGN'`, [id[u]]))[0]?.balance_minor ?? 0)

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name] of [['ada', 'Ada Okafor'], ['boss', 'Luda Boss']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
})

test('old unpaid top-ups are closed; one that was actually paid is credited (once)', async () => {
  const a = await call('POST', 'deposit', { amountMinor: 1000_00, provider: 'paystack' }, T.ada)
  const b = await call('POST', 'deposit', { amountMinor: 2000_00, provider: 'paystack' }, T.ada)
  const fresh = await call('POST', 'deposit', { amountMinor: 3000_00, provider: 'paystack' }, T.ada)
  for (const r of [a, b, fresh]) assert.equal(r.status, 200, JSON.stringify(r.j))
  await q(`update payments set created_at = now() - interval '3 days' where reference in ($1, $2)`, [a.j.reference, b.j.reference])
  world.charges.set(b.j.reference, { status: 'success' }) // paid, but the webhook never came
  const before = await NGN('ada')
  const r = await closeStalePayments(env, d)
  assert.deepEqual(r, { checked: 2, credited: 1, closed: 1 })
  const st = Object.fromEntries((await q(`select reference, status from payments`)).map((x: any) => [x.reference, x.status]))
  assert.equal(st[a.j.reference], 'failed'); assert.equal(st[b.j.reference], 'paid'); assert.equal(st[fresh.j.reference], 'pending', 'recent checkouts are left alone')
  assert.equal(await NGN('ada'), before + 2000_00)
  assert.deepEqual(await closeStalePayments(env, d), { checked: 0, credited: 0, closed: 0 }, 'nothing twice')
  // a late webhook for the closed one still credits it (the provider has the last word)
  world.charges.set(a.j.reference, { status: 'success' })
  await q(`select 1`) // keep order
  const { finalizeDeposit } = await import('../functions/_shared/handlers.ts')
  await finalizeDeposit(a.j.reference, env, d, 'webhook-verify')
  assert.equal(await NGN('ada'), before + 3000_00)
})

test('health check: all good, then problems → saved, owner gets an urgent To do, HQ can run it', async () => {
  // the Paystack payments above were credited without a webhook → the watchdog notices; a webhook arriving clears it
  let h = await runHealth(env, d, 'test')
  assert.deepEqual(h.problems.map((p: any) => p.code), ['webhook-paystack'])
  await q(`insert into payment_events (reference, kind, payload) values ('dep_x', 'webhook', '{"provider":"paystack","event":"charge.success"}')`)
  h = await runHealth(env, d, 'test')
  assert.deepEqual(h.problems, [], JSON.stringify(h.problems))
  // Flutterwave payment credited without any webhook → watchdog
  // copy a real top-up row (all columns) and make it a paid Flutterwave one
  await q(`create temp table t as select * from payments where user_id = $1 limit 1`, [id.ada])
  await q(`update t set reference = 'dep_flw_x', provider = 'flutterwave', status = 'paid', paid_at = now(), created_at = now()`)
  await q(`insert into payments select * from t`)
  // a stuck payout
  await q(`insert into withdrawals (reference, user_id, amount_minor, fee_minor, currency, bank_code, account_number, account_name, status, created_at) values ('wdr_stuck', $1, 50000, 0, 'NGN', '058', '0123456789', 'ADA', 'processing', now() - interval '2 hours')`, [id.ada])
  h = await runHealth(env, d, 'test')
  const codes = h.problems.map((p: any) => p.code).sort()
  assert.deepEqual(codes, ['payouts', 'webhook-flutterwave'])
  assert.match(h.problems.find((p: any) => p.code === 'webhook-flutterwave').fix, /functions\/v1\/pay-webhook/)
  const todo = (await call('GET', 'todo', undefined, T.boss)).j.items
  assert.ok(todo.some((i: any) => i.key.startsWith('health:') && i.level === 'urgent'), 'owner is alerted')
  assert.ok(!(await call('GET', 'todo', undefined, T.ada)).j.items.some((i: any) => i.key.startsWith('health:')), 'not users')
  const ov = (await call('GET', 'admin-overview', undefined, T.boss)).j
  assert.equal(ov.health.problems.length, 2)
  assert.equal((await call('POST', 'admin-health-run', {}, T.ada)).status, 404)
  assert.equal((await call('POST', 'admin-health-run', {}, T.boss)).status, 200)
  assert.equal((await call('POST', 'admin-health-run', {}, T.boss)).status, 429, 'once a minute')
})

test('the daily check runs on its own once a day when someone opens Luda', async () => {
  await q(`delete from health_runs`); await q(`delete from rate_hits where key like 'health:%'`)
  await call('GET', 'me', undefined, T.ada)
  assert.equal(Number((await q(`select count(*) n from health_runs where by='auto'`))[0].n), 1)
  await call('GET', 'me', undefined, T.ada)
  assert.equal(Number((await q(`select count(*) n from health_runs where by='auto'`))[0].n), 1, 'not again the same day')
})
