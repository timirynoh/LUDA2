// Rewards on the server: spin, check-in streak, XP/badges from real activity, challenges, points → wallet,
// referral + ambassador bonuses, monthly budget. Run: cd supabase && npm test
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q']
let AENV: Record<string, string> = { ...ENV, ADMIN_EMAILS: 'boss@x.com' } as any
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.6.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV as any, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}
const id: Record<string, string> = {}
const TRY = async (u: string) => (await call('GET', 'me', undefined, T[u])).j.balances.TRY as number
const signup = async (u: string, name: string, ref?: string) => {
  const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!', country: 'NG', ref })
  T[u] = r.j.session.access_token
  await call('POST', 'pin', { pin: '4826' }, T[u])
  id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
}
const paidDeposit = (u: string) => q(`insert into payments (reference, user_id, provider, purpose, status, amount_minor, currency, base_amount, base_currency, fx_rate, email, item) values ($1,$2,'paystack','deposit','paid',100000,'NGN',1000,'NGN',1,'x@x.com','{}')`, ['dep_' + u, id[u]])

before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  await signup('ada', 'Ada Okafor'); await signup('kemal', 'Kemal Yilmaz')
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name) where username='kemal'`)
})

test('daily spin: once a day, prize drawn by the server, cash only for verified accounts, streak kept', async () => {
  const s1 = await call('POST', 'spin', {}, T.ada)
  assert.equal(s1.status, 200, JSON.stringify(s1.j)); assert.equal(s1.j.cash, 0, 'unverified: never cash'); assert.equal(s1.j.streak, 1)
  assert.equal((await call('POST', 'spin', {}, T.ada)).status, 409, 'once a day')
  const r = (await call('GET', 'rewards', undefined, T.ada)).j
  assert.equal(r.spunToday, true); assert.equal(r.checkedInToday, true); assert.equal(r.streak, 1)
  assert.ok(r.xp >= 5, 'check-in XP'); assert.ok(r.badges.includes('welcome'))
  // yesterday's check-in → streak continues
  await q(`update profiles set last_checkin = last_checkin - 1 where username='kemal'`).catch(() => {})
  await q(`update profiles set last_checkin = (now() at time zone 'Europe/Nicosia')::date - 1, streak = 6 where username='kemal'`)
  // force a cash prize for the verified user by trying until one lands (prizes are random on the server)
  let cashWin = 0
  for (let i = 0; i < 40 && !cashWin; i++) {
    await q(`delete from reward_events where user_id=$1 and kind='spin'`, [id.kemal])
    const s = (await call('POST', 'spin', {}, T.kemal)).j
    cashWin = s.cash
    if (i === 0) assert.equal(s.streak, 7, 'streak continued from yesterday')
  }
  assert.ok(cashWin > 0, 'verified users can win cash')
  const ledger = await q(`select amount_minor from ledger where user_id=$1 and kind='reward'`, [id.kemal])
  assert.equal(Number(ledger.at(-1).amount_minor), cashWin, 'cash went into the real Lira wallet through the ledger')
  assert.ok((await call('GET', 'rewards', undefined, T.kemal)).j.badges.includes('streak7'))
})

test('XP and badges come from real activity; nothing the phone sends counts', async () => {
  const before = (await call('GET', 'rewards', undefined, T.kemal)).j
  assert.equal(before.quests.includes('deposit'), false)
  await paidDeposit('kemal')
  const after = (await call('GET', 'rewards', undefined, T.kemal)).j
  assert.ok(after.quests.includes('deposit')); assert.ok(after.badges.includes('first_deposit')); assert.ok(after.badges.includes('verified'))
  assert.ok(after.xp > before.xp + 50, 'top-up quest XP')
  assert.equal((await call('POST', 'rewards', { xp: 99999 }, T.kemal)).status, 404, 'there is no way to send XP')
})

test('monthly challenges: claimed only when the server sees the progress; cash needs ID; once a month', async () => {
  assert.match((await call('POST', 'challenge-claim', { id: 'c-save' }, T.kemal)).j.error, /Not finished/)
  await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id.kemal, currency: 'TRY', amount_minor: 2_000_00, kind: 'adjustment', ref: 'seed-kemal' }])])
  const pot = (await call('POST', 'pot-create', { name: 'Rent', currency: 'TRY', goalMinor: 2_000_00 }, T.kemal)).j.pot
  await call('POST', 'pot-move', { potId: pot.id, amountMinor: 1_000_00, pin: '4826' }, T.kemal)
  const c = (await call('GET', 'rewards', undefined, T.kemal)).j.challenges.find((x: any) => x.id === 'c-save')
  assert.equal(c.progress, 1_000_00)
  const before = await TRY('kemal')
  assert.equal((await call('POST', 'challenge-claim', { id: 'c-save' }, T.kemal)).j.cash, 20_00)
  assert.equal(await TRY('kemal'), before + 20_00)
  assert.equal((await call('POST', 'challenge-claim', { id: 'c-save' }, T.kemal)).status, 409, 'once a month')
})

test('points → wallet: needs ID and enough points; budget cap turns cash into points', async () => {
  assert.match((await call('POST', 'rewards-redeem', { id: 'r5' }, T.ada)).j.error, /Verify your ID/)
  assert.match((await call('POST', 'rewards-redeem', { id: 'r5' }, T.kemal)).j.error, /Not enough points/)
  await q(`insert into reward_events (user_id, kind, ref, points) values ($1, 'test', 'p1', 600)`, [id.kemal])
  const before = await TRY('kemal')
  const r = (await call('POST', 'rewards-redeem', { id: 'r5' }, T.kemal)).j
  assert.equal(r.cash, 5_00); assert.equal(await TRY('kemal'), before + 5_00)
  assert.match((await call('POST', 'rewards-redeem', { id: 'r5' }, T.kemal)).j.error, /Not enough points/, 'points spent once')
  // budget used up: cash prizes become points of the same value
  AENV = { ...AENV, REWARDS_MONTHLY_CAP: '1' }
  const x = await q(`select luda_reward($1, 'test', 'cap1', 0, 0, 2000, 'cap test', 100) r`, [id.kemal])
  assert.equal(x[0].r.cash, 0); assert.equal(x[0].r.points, 2000, '₺20 → 2,000 points'); assert.equal(x[0].r.swapped, true)
  AENV = { ...AENV, REWARDS_MONTHLY_CAP: '5000' }
})

test('referrals: code at sign-up, both paid once when the friend verifies and tops up; ambassador tiers', async () => {
  await signup('zara', 'Zara Bello', 'LUDA-KEMAL')
  const kemalBefore = await TRY('kemal')
  let list = (await call('GET', 'referrals', undefined, T.kemal)).j
  assert.equal(list.code, 'LUDA-KEMAL'); assert.equal(list.invitees.length, 1); assert.equal(list.invitees[0].verified, false)
  assert.equal((await call('GET', 'referrals', undefined, T.zara)).j.invitedBy, 'kemal')
  await q(`delete from rate_hits`); await call('GET', 'referrals', undefined, T.kemal)
  assert.equal(await TRY('kemal'), kemalBefore, 'nothing until verified + topped up')
  await q(`update profiles set kyc_status='verified', kyc_name='ZARA BELLO' where username='zara'`); await paidDeposit('zara')
  await q(`delete from rate_hits`); await call('GET', 'referrals', undefined, T.zara)
  assert.equal(await TRY('kemal'), kemalBefore + 50_00, 'inviter paid'); assert.equal(await TRY('zara'), 50_00, 'friend paid')
  await q(`delete from rate_hits`); await call('GET', 'referrals', undefined, T.kemal)
  assert.equal(await TRY('kemal'), kemalBefore + 50_00, 'paid once only')
  list = (await call('GET', 'referrals', undefined, T.kemal)).j
  assert.equal(list.invitees[0].paid, true)
  // apply a code after sign-up: once, not your own, only in the first 14 days
  assert.match((await call('POST', 'referral-apply', { code: 'LUDA-ADA' }, T.ada)).j.error, /No Luda user|yourself|not/i)
  assert.equal((await call('POST', 'referral-apply', { code: 'LUDA-KEMAL' }, T.ada)).status, 200)
  assert.equal((await call('POST', 'referral-apply', { code: 'LUDA-ZARA' }, T.ada)).status, 409)
})

test('money still adds up with rewards: wallets + savings pots + held escrow + fees = money in + rewards paid', async () => {
  const sum = async (sql: string) => Number((await q(sql))[0].s)
  const wallets = await sum(`select coalesce(sum(balance_minor),0) s from wallets`)
  const held = await sum(`select coalesce(sum(amount_minor),0) s from escrows where status='held'`)
  const fees = await sum(`select coalesce(sum(fee_minor),0) s from escrows where status='released'`)
  const pots = await sum(`select coalesce(sum(balance_minor),0) s from pots`)
  const inflow = await sum(`select coalesce(sum(amount_minor),0) s from ledger where kind in ('adjustment','reward','deposit')`)
  assert.equal(wallets + held + fees + pots, inflow)
  const paidRewards = await sum(`select coalesce(sum(cash_minor),0) s from reward_events`)
  assert.equal(paidRewards, await sum(`select coalesce(sum(amount_minor),0) s from ledger where kind='reward'`), 'every reward ledger entry has its reward record')
})
