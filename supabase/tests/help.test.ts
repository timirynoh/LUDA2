// v1.19.0: Help Center articles from the server, "was this helpful?" votes, HQ editing; privacy page.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps
const AENV = { ...ENV, ADMIN_EMAILS: 'boss@x.com' } as any
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.5.0.${++ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}

before(async () => {
  const m = await makeDb()
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  for (const u of ['ada', 'boss']) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: u === 'ada' ? 'Ada Okafor' : 'Luda Boss', password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
  }
})

test('help center: topics + articles for everyone; votes; the team adds, edits and removes articles', async () => {
  const h = (await call('GET', 'help')).j
  assert.equal(h.topics[0].id, 'start')
  assert.ok(h.topics.every((t: any) => t.emoji && t.title && t.category))
  assert.ok(h.articles.length >= 20)
  assert.ok(h.topics.every((t: any) => h.articles.some((a: any) => a.topic === t.id)), 'every topic has articles')
  const p2p = h.articles.find((a: any) => a.slug === 'help-p2p-how')
  assert.equal(p2p.steps.length, 4)
  assert.equal((await call('GET', 'guide?slug=privacy')).j.guide.kind, 'privacy')

  assert.equal((await call('POST', 'help-vote', { slug: 'help-p2p-how', helpful: true })).status, 401)
  assert.equal((await call('POST', 'help-vote', { slug: 'help-p2p-how', helpful: false }, T.ada)).status, 200)
  assert.equal((await call('POST', 'help-vote', { slug: 'terms', helpful: false }, T.ada)).status, 404, 'only help articles')
  const r = (await call('GET', 'admin-ratings', undefined, T.boss)).j
  assert.deepEqual(r.help.map((x: any) => [x.slug, x.yes, x.no]), [['help-p2p-how', 0, 1]])

  assert.equal((await call('POST', 'admin-help-create', { topic: 'wallet', title: 'Why is my balance hidden?' }, T.ada)).status, 404)
  const g = (await call('POST', 'admin-help-create', { topic: 'wallet', title: 'Why is my balance hidden?' }, T.boss)).j.guide
  assert.match(g.slug, /^help-wallet-[0-9a-f]{6}$/)
  await call('POST', 'admin-guide-save', { slug: g.slug, title: 'Why is my balance hidden?', intro: 'Tap the eye on the balance card to show it.' }, T.boss)
  const after = (await call('GET', 'help')).j.articles.find((a: any) => a.slug === g.slug)
  assert.equal(after.intro, 'Tap the eye on the balance card to show it.')
  assert.equal(after.sort, 5, 'added at the end of its topic')
  assert.equal((await call('POST', 'admin-help-delete', { slug: g.slug }, T.boss)).status, 200)
  assert.equal((await call('POST', 'admin-help-delete', { slug: 'terms' }, T.boss)).status, 404, 'terms can never be deleted here')
})
