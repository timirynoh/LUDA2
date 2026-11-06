// University calendars entered by staff in Luda HQ, seen by students; personal fee plans. Run: cd supabase && npm test
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q']
const AENV: Record<string, string> = { ...ENV, ADMIN_EMAILS: 'boss@x.com' } as any
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.7.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV as any, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}
const signup = async (u: string, name: string, email = `${u}@x.com`) => {
  const r = await call('POST', 'signup', { email, username: u, fullName: name, password: 'Lefkosa2026!', country: 'NG' })
  T[u] = r.j.session.access_token
}
const day = (n: number) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10)

before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  await signup('boss', 'Owner Person', 'boss@x.com'); await signup('ada', 'Ada Okafor'); await signup('helper', 'Help Er')
  await q(`insert into staff (email, roles) values ('helper@x.com', '{"content":"view"}')`)
})

test('Luda HQ enters official dates; students of that university see them; roles enforced', async () => {
  const date = { uni: 'neu', title: 'Fall classes start', kind: 'term', start: day(10), source: 'https://neu.edu.tr/academic-calendar' }
  assert.equal((await call('POST', 'admin-uni-save', { date }, T.ada)).status, 404, 'students cannot edit')
  assert.equal((await call('POST', 'admin-uni-save', { date }, T.helper)).status, 403, 'view-only staff cannot edit')
  assert.match((await call('POST', 'admin-uni-save', { date: { ...date, source: 'http://x' } }, T.boss)).j.error, /https/)
  assert.match((await call('POST', 'admin-uni-save', { date: { ...date, end: day(1) } }, T.boss)).j.error, /before/)
  const saved = (await call('POST', 'admin-uni-save', { date }, T.boss)).j.date
  await call('POST', 'admin-uni-save', { date: { uni: 'neu', title: 'Tuition 1st instalment deadline', kind: 'fee', start: day(20) } }, T.boss)
  await call('POST', 'admin-uni-save', { date: { uni: 'emu', title: 'EMU only', kind: 'exam', start: day(5) } }, T.boss)
  await call('POST', 'admin-uni-save', { date: { uni: 'neu', title: 'Long ago', kind: 'exam', start: day(-90) } }, T.boss)
  const seen = (await call('GET', 'uni?u=neu', undefined, T.ada)).j.dates
  assert.deepEqual(seen.map((x: any) => x.title), ['Fall classes start', 'Tuition 1st instalment deadline'], 'only NEU, only current/upcoming')
  assert.equal(seen[0].source, 'https://neu.edu.tr/academic-calendar')
  const admin = (await call('GET', 'admin-uni?u=neu', undefined, T.helper)).j
  assert.equal(admin.dates.length, 3); assert.equal(admin.coverage.neu, 2); assert.equal(admin.coverage.emu, 1)
  // edit + delete
  await call('POST', 'admin-uni-save', { date: { ...date, id: saved.id, title: 'Fall classes begin' } }, T.boss)
  assert.equal((await call('GET', 'uni?u=neu', undefined, T.ada)).j.dates[0].title, 'Fall classes begin')
  assert.equal((await call('POST', 'admin-uni-delete', { id: saved.id }, T.helper)).status, 403)
  assert.equal((await call('POST', 'admin-uni-delete', { id: saved.id }, T.boss)).status, 200)
  // copy to next year
  const c = (await call('POST', 'admin-uni-copy', { uni: 'neu', from: day(-400), to: day(400) }, T.boss)).j
  assert.equal(c.copied, 2)
  assert.match((await call('GET', 'uni?u=xyz', undefined, T.ada)).j.error, /university/)
})

test('university follows the account; personal fee plan is private', async () => {
  await call('POST', 'uni-set', { uni: 'ciu' }, T.ada)
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.profile.university, 'ciu')
  assert.match((await call('POST', 'fee-plan-save', { item: { title: '2nd instalment', due: day(30), amountMinor: 0, currency: 'USD' } }, T.ada)).j.error, /amount/)
  const a = (await call('POST', 'fee-plan-save', { item: { title: '2nd instalment', due: day(30), amountMinor: 1_750_00, currency: 'USD' } }, T.ada)).j.item
  await call('POST', 'fee-plan-save', { item: { title: 'Dorm', due: day(3), amountMinor: 9_000_00, currency: 'TRY' } }, T.ada)
  let items = (await call('GET', 'fee-plan', undefined, T.ada)).j.items
  assert.deepEqual(items.map((x: any) => x.title), ['Dorm', '2nd instalment'], 'soonest first')
  assert.equal((await call('GET', 'fee-plan', undefined, T.helper)).j.items.length, 0, 'nobody else sees it')
  assert.equal((await call('POST', 'fee-plan-paid', { id: a.id }, T.helper)).status, 404, 'cannot touch someone else\'s plan')
  await call('POST', 'fee-plan-paid', { id: a.id }, T.ada)
  items = (await call('GET', 'fee-plan', undefined, T.ada)).j.items
  assert.ok(items.find((x: any) => x.id === a.id).paidAt)
  assert.equal((await call('POST', 'fee-plan-remove', { id: a.id }, T.ada)).status, 200)
  assert.equal((await call('GET', 'fee-plan', undefined, T.ada)).j.items.length, 1)
})

test('To do on Home: built on the server from real state (ID check, fee due soon, team reply)', async () => {
  let items = (await call('GET', 'todo', undefined, T.ada)).j.items
  assert.ok(items.some((x: any) => x.key === 'kyc'), 'unverified → verify your ID')
  assert.ok(items.some((x: any) => x.key.startsWith('fee:') && /Dorm/.test(x.title)), 'fee due within 7 days')
  assert.ok(items.some((x: any) => x.key === 'pin'), 'no PIN yet')
  const uid = (await q(`select user_id from profiles where username='ada'`))[0].user_id
  await q(`insert into cases (user_id, category, subject, status) values ($1, 'other', 'Top-up question', 'waiting_user')`, [uid]).catch(async () =>
    q(`insert into cases (user_id, subject, status) values ($1, 'Top-up question', 'waiting_user')`, [uid]))
  await q(`update profiles set kyc_status='verified' where user_id=$1`, [uid])
  items = (await call('GET', 'todo', undefined, T.ada)).j.items
  assert.equal(items[0].key.startsWith('case:'), true, 'urgent items first')
  assert.equal(items.some((x: any) => x.key === 'kyc'), false, 'verified → no ID item')
  assert.equal((await call('GET', 'todo', undefined, T.helper)).j.items.some((x: any) => x.key.startsWith('fee:')), false, 'only your own')
})
