// Staff roles, Home banners, community posts (with reports and review) and group chats. Run: cd supabase && npm test
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
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.8.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}
const PHOTO = { type: 'image/png', data: Buffer.from('fakepng').toString('base64') }
const USERS = [['ada', 'Ada Okafor', 'ada@x.com'], ['kwame', 'Kwame Mensah', 'kwame@x.com'], ['boss', 'Luda Boss', 'boss@x.com'], ['sara', 'Sara Bello', 'sara@x.com'], ['tom', 'Tom Eze', 'tom@x.com'], ['zee', 'Zee Ali', 'zee@x.com']]

before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  for (const [u, name, email] of USERS) {
    const r = await call('POST', 'signup', { email, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
  }
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name) where username <> 'ada'`)
})

test('staff roles: by email, per area and level; enforced on the server; only the owner manages the team', async () => {
  assert.equal((await call('GET', 'admin-overview', undefined, T.sara)).status, 404, 'not staff → page does not exist')
  assert.equal((await call('POST', 'admin-staff-set', { email: 'sara@x.com', roles: { bills: 'edit', cases: 'view' }, pin: '4826' }, T.sara)).status, 404)
  const set = await call('POST', 'admin-staff-set', { email: 'Sara@X.com', roles: { bills: 'edit', cases: 'view', nonsense: 'full' }, pin: '4826' }, T.boss)
  assert.equal(set.status, 200, JSON.stringify(set.j)); assert.deepEqual(set.j.staff.roles, { bills: 'edit', cases: 'view' })
  const me = (await call('GET', 'me', undefined, T.sara)).j.profile
  assert.equal(me.isAdmin, true); assert.equal(me.staff.owner, false); assert.equal(me.staff.perms.bills, 'edit'); assert.equal(me.staff.perms.overview, 'view')
  const ov = await call('GET', 'admin-overview', undefined, T.sara)
  assert.equal(ov.status, 200); assert.equal(ov.j.balances, undefined, 'no money totals without a money role'); assert.equal(typeof ov.j.users, 'number')
  assert.equal((await call('GET', 'admin-bills', undefined, T.sara)).status, 200)
  assert.equal((await call('GET', 'admin-users', undefined, T.sara)).status, 403, 'no users area')
  assert.equal((await call('POST', 'admin-case-reply', { caseId: 'x', body: 'hi' }, T.sara)).status, 403, 'cases is view only')
  assert.equal((await call('GET', 'admin-staff', undefined, T.sara)).status, 403, 'team is owner only')
  assert.equal((await call('POST', 'admin-bill', { billId: '00000000-0000-0000-0000-000000000000', paid: false, note: 'x', pin: '4826' }, T.sara)).status, 403, 'refunds need full')
  const list = (await call('GET', 'admin-staff', undefined, T.boss)).j
  assert.equal(list.staff[0].email, 'sara@x.com'); assert.equal(list.staff[0].username, 'sara')
  assert.equal((await call('POST', 'admin-staff-remove', { email: 'sara@x.com', pin: '4826' }, T.boss)).status, 200)
  assert.equal((await call('GET', 'admin-bills', undefined, T.sara)).status, 404, 'removed → no access')
})

test('banners: staff create/schedule, Home shows only live ones, links stay inside Luda', async () => {
  await call('POST', 'admin-staff-set', { email: 'tom@x.com', roles: { banners: 'edit' }, pin: '4826' }, T.boss)
  assert.match((await call('POST', 'admin-banner-save', { banner: { title: 'Bus', link: 'https://evil.com' } }, T.tom)).j.error, /Luda page/)
  const b = (await call('POST', 'admin-banner-save', { banner: { title: 'Skip the bus queue', body: 'Buy Girne ⇄ Lefkoşa tickets in Luda', cta: 'Buy ticket', link: '/transport', emoji: '🚌', theme: 'ocean' } }, T.tom)).j.banner
  await call('POST', 'admin-banner-save', { banner: { title: 'Next week only', link: '/bills', startsAt: new Date(Date.now() + 7 * 86400e3).toISOString() } }, T.tom)
  const live = (await call('GET', 'banners')).j.banners
  assert.equal(live.length, 1); assert.equal(live[0].title, 'Skip the bus queue'); assert.equal(live[0].theme, 'ocean')
  assert.equal((await call('POST', 'admin-banner-save', { banner: { ...b, active: false, startsAt: '', endsAt: '' } }, T.tom)).status, 200)
  assert.equal((await call('GET', 'banners')).j.banners.length, 0)
  assert.equal((await call('POST', 'admin-banner-delete', { id: b.id }, T.tom)).status, 403, 'deleting needs full')
  assert.equal((await call('POST', 'admin-banner-delete', { id: b.id }, T.boss)).status, 200)
  assert.equal((await call('GET', 'admin-banners', undefined, T.ada)).status, 404)
})

test('posts: ID needed, scams blocked, news reviewed first, 3 reports hide a post, staff post as Official', async () => {
  const g = (await call('GET', 'board?kind=housing', undefined, T.ada)).j
  assert.equal(g.canPost, false); assert.match(g.why, /Verify your ID/)
  assert.equal((await call('POST', 'board-post', { kind: 'housing', title: 'Room in Girne' }, T.ada)).status, 403)
  assert.match((await call('POST', 'board-post', { kind: 'housing', title: 'Room in Girne', body: 'Send deposit first to secure it' }, T.kwame)).j.error, /upfront|deposit|outside/i)
  const h = await call('POST', 'board-post', { kind: 'housing', title: 'Bright room near NEU', body: 'Quiet flat, 2 min walk to campus.', data: { type: 'Room', price: 6500, furnished: true, 'bad key': 1 }, city: 'lefkosa', files: [PHOTO] }, T.kwame)
  assert.equal(h.status, 200, JSON.stringify(h.j)); assert.equal(h.j.status, 'live'); assert.deepEqual(h.j.post.data, { type: 'Room', price: 6500, furnished: true })
  const feed = (await call('GET', 'board?kind=housing', undefined, T.ada)).j
  assert.equal(feed.items.length, 1); assert.equal(feed.items[0].author, 'kwame'); assert.equal(feed.items[0].authorVerified, true); assert.equal(feed.items[0].photoUrls.length, 1)
  assert.equal(feed.items[0].user_id, undefined, 'no internal ids')
  // news from a new account waits 7 days; then it goes to review, not live
  assert.match((await call('POST', 'board-post', { kind: 'news', title: 'Free bus on Friday' }, T.kwame)).j.error, /7 days/)
  await q(`update profiles set created_at = now() - interval '10 days' where username='kwame'`)
  const n = await call('POST', 'board-post', { kind: 'news', title: 'Water cut in Girne on Friday', body: 'Belediye says 9am to 3pm.' }, T.kwame)
  assert.equal(n.j.status, 'review')
  assert.equal((await call('GET', 'board?kind=news', undefined, T.ada)).j.items.length, 0, 'not public until reviewed')
  assert.equal((await call('GET', 'board?kind=news', undefined, T.kwame)).j.mine[0].status, 'review', 'author sees it waiting')
  const queue = (await call('GET', 'admin-board', undefined, T.boss)).j.posts
  assert.equal(queue[0].title, 'Water cut in Girne on Friday')
  assert.equal((await call('POST', 'admin-board-review', { id: n.j.post.id, approve: true }, T.boss)).status, 200)
  assert.equal((await call('GET', 'board?kind=news', undefined, T.ada)).j.items.length, 1)
  // staff post official news straight away
  const o = await call('POST', 'board-post', { kind: 'news', title: 'Residency office closed Monday', official: true }, T.boss)
  assert.equal(o.j.status, 'live'); assert.equal(o.j.post.official, true)
  assert.equal((await call('POST', 'board-post', { kind: 'news', title: 'Fake official', official: true }, T.kwame)).status, 403)
  assert.equal((await call('GET', 'board?kind=news', undefined, T.ada)).j.items[0].official, true, 'official pinned first')
  // reports: own post no; 3 different people hide it
  assert.match((await call('POST', 'board-report', { id: h.j.post.id }, T.kwame)).j.error, /own/)
  for (const u of ['ada', 'ada', 'sara']) await call('POST', 'board-report', { id: h.j.post.id, reason: 'fake' }, T[u])
  assert.equal((await call('GET', 'board?kind=housing', undefined, T.tom)).j.items.length, 1, 'two different reporters so far (ada counted once)')
  assert.equal((await call('POST', 'board-report', { id: h.j.post.id, reason: 'scam' }, T.tom)).j.hidden, true)
  assert.equal((await call('GET', 'board?kind=housing', undefined, T.zee)).j.items.length, 0)
  // places are team-only
  assert.match((await call('GET', 'board?kind=place', undefined, T.kwame)).j.why, /Luda team/)
  // author removes own post
  assert.equal((await call('POST', 'board-remove', { id: n.j.post.id }, T.ada)).status, 404)
  assert.equal((await call('POST', 'board-remove', { id: n.j.post.id }, T.kwame)).status, 200)
})

test('groups: ID to create (max 3), anyone joins, members-only messages, abuse filtered, owner/staff moderate', async () => {
  const g0 = (await call('GET', 'groups', undefined, T.ada)).j
  assert.equal(g0.canCreate, false); assert.match(g0.why, /Verify your ID/); assert.deepEqual(g0.groups, [])
  assert.equal((await call('POST', 'group-create', { name: 'Nigerians in Girne' }, T.ada)).status, 403)
  const g = (await call('POST', 'group-create', { name: 'Nigerians in Girne', about: 'Help, food spots, events', emoji: '🇳🇬' }, T.kwame)).j.group
  assert.ok(g.id)
  assert.match((await call('POST', 'group-create', { name: 'nigerians in girne' }, T.sara)).j.error, /already exists/)
  assert.equal((await call('GET', `group-messages?id=${g.id}`, undefined, T.ada)).status, 403, 'join first')
  assert.equal((await call('POST', 'group-join', { id: g.id }, T.ada)).status, 200)
  assert.equal((await call('POST', 'group-send', { id: g.id, body: 'Hello everyone 👋' }, T.ada)).status, 200)
  assert.match((await call('POST', 'group-send', { id: g.id, body: 'DM me, pay outside Luda via western union' }, T.ada)).j.error ?? '', /.+/)
  const k = (await call('GET', 'groups', undefined, T.kwame)).j.groups[0]
  assert.equal(k.members, 2); assert.equal(k.unread, 1); assert.equal(k.last.by, 'ada')
  const msgs = (await call('GET', `group-messages?id=${g.id}&after=0`, undefined, T.kwame)).j.messages
  assert.equal((await call('GET', `group-messages?id=${g.id}&after=${msgs?.[0]?.id ?? 0}`, undefined, T.kwame)).j.messages.length, 0, 'only newer messages')
  assert.equal(msgs.length, 1); assert.equal(msgs[0].by, 'ada'); assert.equal(msgs[0].mine, false)
  assert.equal((await call('GET', 'groups', undefined, T.kwame)).j.groups[0].unread, 0, 'read')
  // group owner deletes a message; others can't
  assert.equal((await call('POST', 'group-delete-msg', { messageId: msgs[0].id }, T.sara)).status, 403)
  assert.equal((await call('POST', 'group-delete-msg', { messageId: msgs[0].id }, T.kwame)).status, 200)
  assert.equal((await call('GET', `group-messages?id=${g.id}`, undefined, T.ada)).j.messages[0].deleted, true)
  assert.match((await call('POST', 'group-join', { id: g.id, join: false }, T.kwame)).j.error, /created/)
  // max 3 groups
  assert.equal((await call('POST', 'group-create', { name: 'Ghana students' }, T.kwame)).status, 200)
  assert.match((await call('POST', 'group-create', { name: 'Kenya hub' }, T.kwame)).j.error, /2 groups a day/)
  await q(`delete from rate_hits`)
  assert.equal((await call('POST', 'group-create', { name: 'Kenya hub' }, T.kwame)).status, 200)
  assert.match((await call('POST', 'group-create', { name: 'One more' }, T.kwame)).j.error, /3 groups/)
  // staff removes a group
  assert.equal((await call('POST', 'admin-group-remove', { id: g.id }, T.boss)).status, 200)
  assert.equal((await call('GET', 'groups', undefined, T.ada)).j.groups.some((x: any) => x.id === g.id), false)
  assert.equal((await call('POST', 'group-send', { id: g.id, body: 'still there?' }, T.ada)).status, 403)
})
