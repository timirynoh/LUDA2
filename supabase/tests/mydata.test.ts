// v1.25.0: personal data follows the account to every phone (profile, photo, settings, timetable, saved items).
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.13.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), ENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64')

before(async () => {
  const m = await makeDb()
  const fw = fakeWorld(m.q)
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name] of [['ada', 'Ada Okafor'], ['kemi', 'Kemi Bello']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
  }
})

test('profile, photo and settings saved on one phone come back on another', async () => {
  assert.deepEqual((await call('GET', 'my-data', undefined, T.ada)).j.data, {})
  const t1 = new Date(Date.now() - 60_000).toISOString()
  assert.equal((await call('POST', 'my-data', { key: 'profile', data: { name: 'Ada O.', bio: 'Medicine @ NEU', city: 'girne', country: 'ng' }, at: t1 }, T.ada)).j.saved, true)
  assert.equal((await call('POST', 'my-data', { key: 'avatar', data: { url: PHOTO } }, T.ada)).status, 200)
  await call('POST', 'my-data', { key: 'settings', data: { shortcuts: ['deposit', 'admin', 'bills'], sections: { flash: false, x: 'no' }, notifPrefs: { money: true }, remind: { on: true, minutes: 999 } } }, T.ada)
  await call('POST', 'my-data', { key: 'study', data: { classes: [{ id: 'c1', name: 'Anatomy', day: 1, start: '09:00' }] } }, T.ada)
  // "new phone": same account, nothing local → everything comes from the server
  const all = (await call('GET', 'my-data', undefined, T.ada)).j.data
  assert.deepEqual(all.profile.data, { name: 'Ada O.', bio: 'Medicine @ NEU', city: 'girne', country: 'NG' })
  assert.equal(all.avatar.data.url, PHOTO)
  assert.deepEqual(all.settings.data, { shortcuts: ['deposit', 'bills'], sections: { flash: false }, notifPrefs: { money: true }, remind: { on: true, minutes: 120 } }, 'cleaned: no admin shortcut, only true/false, capped minutes')
  assert.equal(all.study.data.classes[0].name, 'Anatomy')
  assert.deepEqual((await call('GET', 'my-data', undefined, T.kemi)).j.data, {}, 'only your own data')
})

test('the newest change wins; bad input is refused', async () => {
  const old = new Date(Date.now() - 3_600_000).toISOString()
  const r = await call('POST', 'my-data', { key: 'profile', data: { name: 'Stale name' }, at: old }, T.ada)
  assert.equal(r.j.saved, false); assert.equal(r.j.data.name, 'Ada O.', 'an older phone gets the newer copy back')
  assert.equal((await call('POST', 'my-data', { key: 'profile', data: { name: 'Ada New' } }, T.ada)).j.data.name, 'Ada New')
  assert.equal((await call('POST', 'my-data', { key: 'hacks', data: {} }, T.ada)).status, 400)
  assert.match((await call('POST', 'my-data', { key: 'avatar', data: { url: 'javascript:alert(1)' } }, T.ada)).j.error, /JPEG/)
  assert.match((await call('POST', 'my-data', { key: 'avatar', data: { url: 'data:image/jpeg;base64,' + 'A'.repeat(200_000) } }, T.ada)).j.error, /too big/)
  assert.equal((await call('GET', 'my-data')).status, 401, 'needs a session')
})
