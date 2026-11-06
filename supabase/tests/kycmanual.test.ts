// v1.23.0: free manual ID check (document + selfie with a code, approved in Luda HQ) and the Didit credit warning.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], world: ReturnType<typeof fakeWorld>['world']
const env: any = { ...ENV, ADMIN_EMAILS: 'boss@x.com' }
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.11.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const PHOTO = { type: 'image/png', data: Buffer.from('fakepng').toString('base64') }

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name] of [['ada', 'Ada Okafor'], ['boss', 'Luda Boss'], ['kemi', 'Kemi Staff']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
  await q(`insert into staff (email, roles) values ('kemi@x.com', '{"kyc":"edit","cases":"view","users":"view"}'::jsonb)`)
})

test('manual ID check: code of the day, details checked, case for the team, one at a time', async () => {
  const g = await call('GET', 'kyc-manual', undefined, T.ada)
  assert.match(g.j.code, /^\d{4}$/); assert.equal(g.j.open, null)
  assert.equal((await call('GET', 'kyc-manual', undefined, T.ada)).j.code, g.j.code, 'same code all day')
  assert.notEqual((await call('GET', 'kyc-manual', undefined, T.kemi)).j.code === g.j.code && (await call('GET', 'kyc-manual', undefined, T.boss)).j.code === g.j.code, true, 'codes differ per person')
  const good = { legalName: 'Ada Chioma Okafor', docType: 'Passport', docNumber: 'a 1234567', country: 'Nigeria', dob: '2001-04-15', files: [PHOTO, PHOTO] }
  assert.match((await call('POST', 'kyc-manual', { ...good, legalName: 'Ada' }, T.ada)).j.error, /full name/)
  assert.match((await call('POST', 'kyc-manual', { ...good, docType: 'Library card' }, T.ada)).j.error, /type of document/)
  assert.match((await call('POST', 'kyc-manual', { ...good, files: [PHOTO] }, T.ada)).j.error, /selfie/)
  const r = await call('POST', 'kyc-manual', good, T.ada)
  assert.equal(r.status, 200, JSON.stringify(r.j))
  assert.equal((await call('POST', 'kyc-manual', good, T.ada)).status, 409, 'only one at a time')
  assert.equal((await call('GET', 'kyc-manual', undefined, T.ada)).j.open.id, r.j.id)
  const todo = (await call('GET', 'todo', undefined, T.ada)).j.items
  assert.ok(todo.some((i: any) => i.key === 'kyc-manual') && !todo.some((i: any) => i.key === 'kyc'), 'user sees "with the Luda team"')
  // staff see it to do, and the case carries the details for one-tap approval
  assert.ok((await call('GET', 'todo', undefined, T.kemi)).j.items.some((i: any) => i.key === `staffkyc:${r.j.id}`))
  const c = (await call('GET', `admin-case?id=${r.j.id}`, undefined, T.kemi)).j
  assert.deepEqual({ ...c.case.meta, code: undefined }, { legalName: 'Ada Chioma Okafor', docType: 'Passport', docNumber: 'A1234567', country: 'Nigeria', dob: '2001-04-15', code: undefined, nameMatch: true })
  assert.equal(c.case.meta.code, g.j.code); assert.equal(c.messages[0].files.length, 2)
  const ok = await call('POST', 'admin-action', { action: 'kyc-approve', userId: id.ada, caseId: r.j.id, legalName: 'Ada Chioma Okafor', docType: 'Passport', docNumber: 'A1234567', country: 'Nigeria', dob: '2001-04-15', reason: 'Manual check: photo + selfie code', pin: '4826' }, T.kemi)
  assert.equal(ok.status, 200, JSON.stringify(ok.j))
  assert.equal((await q(`select kyc_status from profiles where user_id=$1`, [id.ada]))[0].kyc_status, 'verified')
  assert.equal((await call('POST', 'kyc-manual', good, T.ada)).status, 409, 'already verified')
})

test('Didit credit warning: usage this month, out-of-credit alert for the owner', async () => {
  for (let i = 0; i < 28; i++) await q(`insert into payment_events (reference, kind, payload) values ('u${i}', 'kyc_started', '{}')`)
  let ov = (await call('GET', 'admin-overview', undefined, T.boss)).j.didit
  assert.equal(ov.checksMonth, 28); assert.equal(ov.usedUsd, 8.4); assert.equal(ov.freeChecks, 33); assert.equal(ov.low, true); assert.equal(ov.outOfCredit, false)
  let todo = (await call('GET', 'todo', undefined, T.boss)).j.items
  assert.ok(todo.some((i: any) => i.key.startsWith('didit-low:')))
  // Didit refuses for lack of credit → urgent item for the owner, students are told to send their ID to the team
  world.diditNoCredit = true
  await q(`update profiles set kyc_status='none' where user_id=$1`, [id.boss])
  const s = await call('POST', 'kyc-start', {}, T.boss)
  assert.equal(s.status, 503); assert.match(s.j.error, /Send your ID to the Luda team/)
  ov = (await call('GET', 'admin-overview', undefined, T.boss)).j.didit
  assert.equal(ov.outOfCredit, true)
  todo = (await call('GET', 'todo', undefined, T.boss)).j.items
  assert.ok(todo.some((i: any) => i.key.startsWith('didit-out:') && i.level === 'urgent'))
  assert.equal((await call('GET', 'admin-overview', undefined, T.kemi)).j.didit.outOfCredit, true, 'kyc staff can see it too')
  assert.ok(!(await call('GET', 'todo', undefined, T.kemi)).j.items.some((i: any) => i.key.startsWith('didit-')), 'only kyc:full gets the alert')
  world.diditNoCredit = false
  // a started check is counted
  const before = (await call('GET', 'admin-overview', undefined, T.boss)).j.didit.checksMonth
  assert.equal((await call('POST', 'kyc-start', {}, T.boss)).status, 200)
  assert.equal((await call('GET', 'admin-overview', undefined, T.boss)).j.didit.checksMonth, before + 1)
})
