// v1.18.0: ratings for support cases, bills, Market and Flash; reopening closed cases; Luda HQ ratings.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q']
const AENV = { ...ENV, ADMIN_EMAILS: 'boss@x.com' } as any
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.6.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const PHOTO = { type: 'image/png', data: Buffer.from('fakepng').toString('base64') }
const todo = async (u: string) => (await call('GET', 'todo', undefined, T[u])).j.items as any[]

before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  for (const [u, name] of [['ada', 'Ada Okafor'], ['kwame', 'Kwame Mensah'], ['boss', 'Luda Boss']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
    await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id[u], currency: 'TRY', amount_minor: 5_000_00, kind: 'adjustment', ref: 'seed-' + u }])])
  }
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name)`)
})

test('support cases: rate after closing (with the team member), reopen within 7 days, at most twice', async () => {
  const c = (await call('POST', 'case-create', { category: 'payment', subject: 'Top-up not credited', message: 'I paid ₦5,000 but nothing came' }, T.ada)).j.id
  assert.equal((await call('POST', 'rate', { kind: 'case', ref: c, stars: 5 }, T.ada)).status, 409, 'only once it is closed')
  assert.equal((await call('POST', 'case-reopen', { caseId: c, reason: 'Still not working' }, T.ada)).status, 409, 'already open')
  await call('POST', 'admin-case-reply', { caseId: c, message: 'Credited now, sorry for the wait', status: 'resolved' }, T.boss)
  assert.ok((await todo('ada')).some((i) => i.key === `rate:case:${c}` && i.to === `/help?rate=case:${c}`), 'To do asks for a rating')

  assert.equal((await call('POST', 'rate', { kind: 'case', ref: c, stars: 6 }, T.ada)).status, 400)
  assert.equal((await call('POST', 'rate', { kind: 'case', ref: c, stars: 4 }, T.kwame)).status, 404, "not someone else's case")
  assert.equal((await call('POST', 'rate', { kind: 'case', ref: c, stars: 4, tags: ['fast', 'helpful', 'made_up', 'fast'], body: 'Quick fix' }, T.ada)).status, 200)
  const [r] = await q(`select stars, tags, staff, body from ratings where kind='case' and ref=$1`, [c])
  assert.deepEqual({ ...r }, { stars: 4, tags: ['fast', 'helpful'], staff: 'boss', body: 'Quick fix' })
  assert.ok(!(await todo('ada')).some((i) => i.key === `rate:case:${c}`), 'rated → gone from To do')
  // changing your mind updates the same rating
  await call('POST', 'rate', { kind: 'case', ref: c, stars: 2, tags: ['not_solved'] }, T.ada)
  assert.equal((await q(`select count(*)::int n, max(stars) s from ratings where kind='case'`))[0].s, 2)

  assert.match((await call('POST', 'case-reply', { caseId: c, message: 'hello again' }, T.ada)).j.error, /Reopen/, 'a reply does not quietly reopen a closed case')
  // Not solved → reopen (twice at most)
  assert.equal((await call('POST', 'case-reopen', { caseId: c, reason: 'no' }, T.ada)).status, 400, 'say what is wrong')
  assert.equal((await call('POST', 'case-reopen', { caseId: c, reason: 'The money is still missing' }, T.ada)).status, 200)
  const mine = (await call('GET', 'cases', undefined, T.ada)).j.cases.find((x: any) => x.id === c)
  assert.equal(mine.status, 'open'); assert.equal(mine.reopens, 1)
  assert.match(mine.messages.at(-1).body, /Reopened: The money is still missing/)
  await call('POST', 'admin-case-reply', { caseId: c, message: 'Checked again', status: 'resolved' }, T.boss)
  assert.equal((await call('POST', 'case-reopen', { caseId: c, reason: 'Still the same problem' }, T.ada)).status, 200)
  await call('POST', 'admin-case-reply', { caseId: c, message: 'Final answer', status: 'rejected' }, T.boss)
  assert.match((await call('POST', 'case-reopen', { caseId: c, reason: 'Please look again' }, T.ada)).j.error, /twice/)
  // too late
  const c2 = (await call('POST', 'case-create', { category: 'account', subject: 'Change my name', message: 'Typo in my name please' }, T.ada)).j.id
  await call('POST', 'admin-case-reply', { caseId: c2, message: 'Done', status: 'resolved' }, T.boss)
  await q(`alter table cases disable trigger cases_closed_at`); await q(`update cases set closed_at = now() - interval '8 days' where id=$1`, [c2]); await q(`alter table cases enable trigger cases_closed_at`)
  assert.match((await call('POST', 'case-reopen', { caseId: c2, reason: 'It changed back' }, T.ada)).j.error, /7 days/)
})

test('bills, Market and Flash: rated once finished; reviews show on the person’s profile', async () => {
  // Bill paid by the team → rate it
  const b = (await call('POST', 'bill-create', { type: 'electricity', provider: 'KIB-TEK', account: '12345678', amountMinor: 300_00, pin: '4826', files: [PHOTO], confirmed: true, details: { name: 'Ada Okafor', district: 'Girne' } }, T.ada)).j.bill
  assert.equal((await call('POST', 'rate', { kind: 'bill', ref: b.id, stars: 5 }, T.ada)).status, 409)
  await call('POST', 'admin-bill', { billId: b.id, paid: true, checked: true, pin: '4826', files: [PHOTO] }, T.boss)
  assert.ok((await todo('ada')).some((i) => i.key === `rate:bill:${b.id}`))
  assert.equal((await call('POST', 'rate', { kind: 'bill', ref: b.id, stars: 5, tags: ['fast', 'clear_receipt'] }, T.ada)).status, 200)
  assert.equal((await q(`select staff from ratings where kind='bill'`))[0].staff, 'boss')

  // Market: buyer and seller rate each other with 👍/👎
  const item = (await call('POST', 'market-list', { title: 'Rice cooker', priceMinor: 400_00, photos: [PHOTO] }, T.kwame)).j.item
  await call('POST', 'market-buy', { id: item.id, pin: '4826' }, T.ada)
  assert.equal((await call('POST', 'rate', { kind: 'market', ref: item.id, good: true }, T.ada)).status, 409, 'not before it is received')
  await call('POST', 'market-received', { id: item.id, pin: '4826' }, T.ada)
  assert.equal((await call('POST', 'rate', { kind: 'market', ref: item.id, stars: 5 }, T.ada)).status, 400, '👍/👎 for people')
  assert.equal((await call('POST', 'rate', { kind: 'market', ref: item.id, good: true, tags: ['as_described'], body: 'Great seller' }, T.ada)).status, 200)
  assert.equal((await call('POST', 'rate', { kind: 'market', ref: item.id, good: false, tags: ['late'], body: 'Came late to pick up' }, T.kwame)).status, 200)
  assert.equal((await call('POST', 'rate', { kind: 'market', ref: item.id, good: true }, T.boss)).status, 404, 'only the two people')
  assert.match((await call('POST', 'rate', { kind: 'market', ref: item.id, good: true, body: 'pay me outside luda on whatsapp' }, T.ada)).j.error ?? '', /./)

  // Flash: poster rates helper
  const job = (await call('POST', 'flash-post', { title: 'Carry a fridge', details: 'Ground floor to 3rd', city: 'girne', rewardMinor: 150_00, pin: '4826' }, T.ada)).j.job
  await call('POST', 'flash-take', { id: job.id }, T.kwame)
  await call('POST', 'flash-done', { id: job.id, pin: '4826' }, T.ada)
  assert.ok((await todo('ada')).some((i) => i.key === `rate:flash:${job.id}` && /@kwame/.test(i.title)))
  assert.equal((await call('POST', 'rate', { kind: 'flash', ref: job.id, good: true, tags: ['good_work', 'on_time'] }, T.ada)).status, 200)

  const k = (await call('GET', 'trader?u=kwame', undefined, T.boss)).j.trader.community
  assert.equal(k.good, 2); assert.equal(k.bad, 0)
  assert.deepEqual(k.reviews.map((r: any) => r.kind).sort(), ['flash', 'market'])
  assert.equal(k.reviews.find((r: any) => r.kind === 'market').body, 'Great seller')
  const a = (await call('GET', 'trader?u=ada', undefined, T.boss)).j.trader.community
  assert.equal(a.bad, 1)

  const mine = (await call('GET', 'ratings-mine', undefined, T.ada)).j
  assert.equal(mine.ratings.length, 4)
  assert.equal(mine.pending.market.length, 0)
})

test('Luda HQ ratings: averages, team members, low ratings to follow up; staff only', async () => {
  assert.equal((await call('GET', 'admin-ratings', undefined, T.ada)).status, 404)
  const r = (await call('GET', 'admin-ratings?days=30', undefined, T.boss)).j
  assert.equal(r.days, 30)
  assert.equal(r.summary.case.n, 1); assert.equal(Number(r.summary.case.avg), 2); assert.equal(r.summary.case.low, 1)
  assert.equal(Number(r.summary.bill.avg), 5)
  assert.equal(r.summary.market.good, 1); assert.equal(r.summary.market.bad, 1)
  assert.ok(r.staff.some((s: any) => s.staff === 'boss' && s.n === 2))
  assert.ok(r.reopened >= 1)
  const low = r.items.filter((i: any) => i.low)
  assert.ok(low.some((i: any) => i.kind === 'case' && i.title === 'Top-up not credited' && i.by === 'ada'))
  assert.ok(low.some((i: any) => i.kind === 'market' && i.target === 'ada'))
})
