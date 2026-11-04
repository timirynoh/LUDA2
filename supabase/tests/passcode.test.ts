// v1.13.0: 6-digit sign-in code on the server, sign-in history, live search, trader profiles.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q']
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130', 'x-forwarded-for': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), ENV as any, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}
before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  for (const [u, n] of [['ada', 'Ada Okafor'], ['kemal', 'Kemal Yilmaz']]) {
    T[u] = (await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: n, password: 'Lefkosa2026!', country: 'NG' })).j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
  }
})

test('6-digit sign-in code: set with the payment PIN, checked on the server, locks after 5 wrong; PIN stays 4 digits for payments', async () => {
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.profile.hasPasscode, false)
  assert.ok((await call('GET', 'todo', undefined, T.ada)).j.items.some((x: any) => x.key === 'passcode'), 'existing users are asked on Home')
  assert.match((await call('POST', 'passcode', { code: '123456', pin: '4826' }, T.ada)).j.error, /not easy to guess/)
  assert.match((await call('POST', 'passcode', { code: '1234', pin: '4826' }, T.ada)).j.error, /6-digit/)
  assert.equal((await call('POST', 'passcode', { code: '583920', pin: '0000' }, T.ada)).status, 401, 'needs the payment PIN')
  assert.equal((await call('POST', 'passcode', { code: '583920', pin: '4826' }, T.ada)).status, 200)
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.profile.hasPasscode, true)
  assert.equal((await call('GET', 'todo', undefined, T.ada)).j.items.some((x: any) => x.key === 'passcode'), false)
  assert.equal((await call('POST', 'passcode-check', { code: '583920' }, T.ada)).status, 200)
  assert.equal((await call('POST', 'pin-check', { pin: '4826' }, T.ada)).status, 200, 'payment PIN unchanged')
  assert.equal((await call('POST', 'passcode-check', { code: '4826' }, T.ada)).status, 401, 'the PIN is not the sign-in code')
  for (let i = 0; i < 4; i++) await call('POST', 'passcode-check', { code: '000001' }, T.ada)
  assert.equal((await call('POST', 'passcode-check', { code: '583920' }, T.ada)).status, 429, 'locked after 5 wrong')
  await q(`update profiles set passcode_locked_until = null where username='ada'`)
  assert.equal((await call('POST', 'passcode', { code: '771905', oldCode: '111111' }, T.ada)).status, 401, 'changing needs the old code')
  assert.equal((await call('POST', 'passcode', { code: '771905', oldCode: '583920' }, T.ada)).status, 200)
  const log = (await call('GET', 'sign-ins', undefined, T.ada)).j.items
  assert.ok(log.some((x: any) => x.how === 'code' && /Android/.test(x.device))); assert.ok(log.some((x: any) => x.how === 'new account'))
  assert.equal((await call('GET', 'sign-ins', undefined, T.kemal)).j.items.some((x: any) => x.how === 'code'), false, 'only your own history')
})

test('search finds only live things; trader profile comes from real orders and reviews', async () => {
  const kemal = (await q(`select user_id from profiles where username='kemal'`))[0].user_id
  await q(`insert into board_posts (kind, user_id, title, data, status) values ('housing', $1, 'Room in Gönyeli near NEU', '{}', 'live'), ('housing', $1, 'Hidden room draft', '{}', 'review')`, [kemal])
  await q(`insert into p2p_ads (user_id, side, price, min_try, max_try, available_try, methods) values ($1,'sell',28,5000,500000,500000,'{cash}')`, [kemal])
  const r = (await call('GET', 'search?q=room', undefined, T.ada)).j
  assert.deepEqual(r.posts.map((x: any) => x.title), ['Room in Gönyeli near NEU'], 'posts under review stay hidden')
  assert.equal((await call('GET', 'search?q=kem', undefined, T.ada)).j.people[0].username, 'kemal')
  const t = (await call('GET', 'trader?u=kemal', undefined, T.ada)).j.trader
  assert.equal(t.name, 'Kemal'); assert.equal(t.ads, 1); assert.equal(t.blocked, false); assert.equal(t.stats.trades, 0)
  assert.equal((await call('GET', 'trader?u=nobody', undefined, T.ada)).status, 404)
})
