// v1.27.0: one Luda account per person. Same face (Didit face search) = blocked; same document = blocked;
// Luda HQ finds pairs of accounts that look like one person; the Terms say so and everyone accepts again.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { duplicateFace } from '../functions/_shared/kyc.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], world: ReturnType<typeof fakeWorld>['world']
const env: any = { ...ENV, ADMIN_EMAILS: 'boss@x.com' }
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string, extra: Record<string, string> = {}) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.27.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...extra, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const APPROVED = (name: string, doc: string) => ({ status: 'Approved', id_verifications: [{ full_name: name, date_of_birth: '2001-05-06', document_type: 'Passport', document_number: doc, issuing_state: 'NGA' }] })

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name] of [['tolu', 'Tolu Bakare'], ['tolu2', 'Tolu Bakare'], ['boss', 'Luda Boss'], ['eze', 'Eze Nwosu'], ['ngozi', 'Ngozi Obi'], ['vera', 'Vera Musa'], ['kemi', 'Kemi Ade']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
})

test('Didit face search: a face already verified on another account is blocked, with a clear message', async () => {
  // reads both the liveness and the document-selfie matches, and ignores the person's own earlier sessions
  const j = { vendor_data: 'me', liveness_checks: [{ warnings: [{ risk: 'POSSIBLE_DUPLICATED_FACE' }], matches: [{ vendor_data: 'other-1' }, { vendor_data: 'me' }] }],
    id_verifications: [{ document_selfie_face_matches: [{ vendor_data: 'other-2' }] }] }
  assert.deepEqual(duplicateFace(j), { duplicate: true, duplicateUsers: ['other-1', 'other-2'] })
  assert.deepEqual(duplicateFace({ status: 'Approved', vendor_data: 'me', liveness_checks: [{ matches: [{ vendor_data: 'me' }] }] }), { duplicate: false, duplicateUsers: [] })

  await call('POST', 'kyc-start', {}, T.tolu)
  const s1 = (await q(`select kyc_session_id from profiles where user_id=$1`, [id.tolu]))[0].kyc_session_id
  world.didit.set(s1, APPROVED('TOLU BAKARE', 'A1111111'))
  assert.equal((await call('GET', 'kyc-status', undefined, T.tolu)).j.status, 'verified')

  // same person, second account, a different document (e.g. NIN slip instead of passport): Didit flags the face
  await call('POST', 'kyc-start', {}, T.tolu2)
  const s2 = (await q(`select kyc_session_id from profiles where user_id=$1`, [id.tolu2]))[0].kyc_session_id
  world.didit.set(s2, { ...APPROVED('TOLU BAKARE', 'B2222222'), status: 'Declined', vendor_data: id.tolu2,
    liveness_checks: [{ status: 'Declined', warnings: [{ risk: 'POSSIBLE_DUPLICATED_FACE' }], matches: [{ vendor_data: id.tolu, status: 'Approved' }] }] })
  const r = (await call('GET', 'kyc-status', undefined, T.tolu2)).j
  assert.equal(r.status, 'failed'); assert.match(r.message, /already verified on another Luda account.*only one Luda account/)
  assert.equal((await q(`select kyc_status from profiles where user_id=$1`, [id.tolu2]))[0].kyc_status, 'failed')
  const ev = (await q(`select payload from payment_events where reference=$1 and kind='kyc_duplicate_face'`, [id.tolu2]))[0]
  assert.deepEqual(ev.payload.others, [id.tolu])

  // even if Didit approved, a duplicate-face warning is never verified
  world.didit.set(s2, { ...APPROVED('TOLU BAKARE', 'B2222222'), liveness_checks: [{ warnings: [{ risk: 'DUPLICATED_FACE' }], matches: [{ vendor_data: id.tolu }] }] })
  await q(`update profiles set kyc_status='pending' where user_id=$1`, [id.tolu2])
  assert.equal((await call('GET', 'kyc-status', undefined, T.tolu2)).j.status, 'failed')
})

test('the same document on a second account is logged for the duplicate finder', async () => {
  await call('POST', 'kyc-start', {}, T.kemi)
  const s = (await q(`select kyc_session_id from profiles where user_id=$1`, [id.kemi]))[0].kyc_session_id
  world.didit.set(s, APPROVED('KEMI ADE', 'A1111111')) // Tolu's passport number
  const r = (await call('GET', 'kyc-status', undefined, T.kemi)).j
  assert.equal(r.status, 'failed'); assert.match(r.message, /only one Luda account/)
  assert.equal((await q(`select count(*)::int n from payment_events where reference=$1 and kind='kyc_doc_conflict'`, [id.kemi]))[0].n, 1)
})

test('Luda HQ duplicate finder: reasons, home network vs shared Wi-Fi, dismiss, staff only', async () => {
  // eze and ngozi use the same phone (the app's own id) — a strong reason
  const phone = { 'x-luda-device': 'dev_0123456789abcdef0123' }
  for (const u of ['eze', 'ngozi']) { await q(`update profiles set last_seen=null where user_id=$1`, [id[u]]); await call('GET', 'me', undefined, T[u], phone) }
  // vera and kemi share a small home network: weak alone, so not listed by itself
  for (const u of ['vera', 'kemi']) { await q(`update profiles set last_seen=null where user_id=$1`, [id[u]]); await call('GET', 'me', undefined, T[u], { 'x-forwarded-for': '41.58.1.2' }) }
  const stored = await q(`select hash from account_signals where user_id=$1 and kind='dev'`, [id.eze])
  assert.equal(stored.length, 1); assert.ok(!stored[0].hash.includes('dev_0123'), 'only a hash is stored')

  assert.equal((await call('GET', 'admin-duplicates', undefined, T.eze)).status, 404, 'non-staff never see it')
  const pairs = (await call('GET', 'admin-duplicates', undefined, T.boss)).j.pairs as any[]
  const key = (p: any) => [p.a.username, p.b.username].sort().join('+')
  const by = Object.fromEntries(pairs.map((p) => [key(p), p]))
  assert.ok(by['tolu+tolu2'].why.includes('face') && by['tolu+tolu2'].why.includes('name'))
  assert.ok(by['kemi+tolu'].why.includes('document'))
  assert.deepEqual(by['eze+ngozi'].why, ['device'])
  assert.ok(!by['kemi+vera'], 'a shared network alone is not enough')
  assert.equal(pairs[0].strong >= pairs[pairs.length - 1].strong, true, 'strongest first')

  // a busy network (dorm Wi-Fi) never counts, even with the same name
  for (const u of ['eze', 'ngozi', 'vera', 'kemi']) { await q(`update profiles set last_seen=null where user_id=$1`, [id[u]]); await call('GET', 'me', undefined, T[u], { 'x-forwarded-for': '85.1.1.1' }) }
  await q(`update profiles set full_name='Vera Musa' where user_id=$1`, [id.kemi])
  const p2 = (await call('GET', 'admin-duplicates', undefined, T.boss)).j.pairs as any[]
  const kv = p2.find((p) => key(p) === 'kemi+vera')
  assert.deepEqual(kv?.why.sort(), ['name', 'network'], 'same name + small home network = listed; the busy network is ignored')

  // 'Not the same person' hides the pair for good
  assert.equal((await call('POST', 'admin-duplicate-dismiss', { a: id.ngozi, b: id.eze }, T.boss)).status, 200)
  assert.ok(!((await call('GET', 'admin-duplicates', undefined, T.boss)).j.pairs as any[]).some((p) => key(p) === 'eze+ngozi'))
})

test('the Terms say one account per person and everyone accepts the new version', async () => {
  const g = (await call('GET', 'guide?slug=terms')).j.guide
  assert.match(JSON.stringify(g.steps), /only one Luda account/)
  const me = (await call('GET', 'me', undefined, T.vera)).j.profile
  assert.ok(me.termsCurrent > 1); assert.notEqual(me.termsVersion, me.termsCurrent, 'old acceptance no longer counts')
})
