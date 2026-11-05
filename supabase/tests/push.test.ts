// v1.17.0: phone notifications (Web Push) — the server encrypts and sends; we decrypt here like a phone would.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { b64u } from '../functions/_shared/webpush.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], world: ReturnType<typeof fakeWorld>['world']
const PENV = { ...ENV, PUSH_ALLOW_TEST: '1' } as any
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.7.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), PENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}
const signup = async (u: string, name: string) => {
  const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!', country: 'NG' })
  T[u] = r.j.session.access_token
  await call('POST', 'pin', { pin: '4826' }, T[u])
}

/** A fake phone: its own push keys, and a decrypt function (RFC 8291, receiver side). */
async function phone(endpoint: string) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16))
  const hk = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8))
  const te = new TextEncoder()
  const read = async (body: Uint8Array) => {
    const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen)
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, kp.privateKey, 256))
    const ikm = await hk(auth, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...pub, ...asPub]), 32)
    const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12)
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct))
    assert.equal(pt[pt.length - 1], 2)
    return JSON.parse(new TextDecoder().decode(pt.slice(0, -1)))
  }
  return { sub: { endpoint, keys: { p256dh: b64u.enc(pub), auth: b64u.enc(auth) } }, read }
}
const sentTo = (ep: string) => world.pushes.filter((p) => p.endpoint === ep)

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  await signup('ada', 'Ada Okafor'); await signup('kemal', 'Kemal Yilmaz')
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name)`)
})

test('push: phones register, the server sends encrypted, signed notifications they can read', async () => {
  const key = (await call('GET', 'config')).j.push
  assert.match(key, /^[A-Za-z0-9_-]{87}$/)
  assert.equal((await call('GET', 'config')).j.push, key, 'one key pair, kept on the server')

  const k = await phone('https://fcm.push.test/send/kemal-1')
  assert.equal((await call('POST', 'push-subscribe', { endpoint: 'https://evil.example/hook', keys: k.sub.keys }, T.kemal)).status, 400, 'only real push services')
  assert.equal((await call('POST', 'push-subscribe', k.sub, undefined)).status, 401)
  assert.equal((await call('POST', 'push-subscribe', { ...k.sub, prefs: { classes: true } }, T.kemal)).status, 200)

  const t = await call('POST', 'push-test', {}, T.kemal)
  assert.equal(t.j.sent, 1)
  const got = sentTo(k.sub.endpoint)
  assert.equal(got.length, 1)
  assert.equal(got[0].headers['content-encoding'], 'aes128gcm')
  assert.deepEqual(await k.read(got[0].body), { title: '🔔 Luda notifications are on', body: "You'll get alerts here even when Luda is closed", url: '/', tag: 'test' })
  // VAPID: signed for this push service with the server key
  const m = got[0].headers.authorization.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!
  assert.equal(m[4], key)
  const claims = JSON.parse(new TextDecoder().decode(b64u.dec(m[2])))
  assert.equal(claims.aud, 'https://fcm.push.test')
  const pk = await crypto.subtle.importKey('raw', b64u.dec(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pk, b64u.dec(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`)))
})

test('push: money received reaches the other person; To do items buzz once; categories respected; expired phones removed', async () => {
  const k = await phone('https://fcm.push.test/send/kemal-2')
  await call('POST', 'push-subscribe', k.sub, T.kemal)
  world.pushes.length = 0
  // Ada sends Kemal ₦500 → Kemal's phones get it
  const ada = (await q(`select user_id from profiles where username='ada'`))[0].user_id
  await q(`select luda_post(jsonb_build_array(jsonb_build_object('user_id','${ada}','currency','NGN','amount_minor',100000,'kind','adjustment','ref','seed')))`)
  assert.equal((await call('POST', 'send', { to: 'kemal', currency: 'NGN', amountMinor: 50000, pin: '4826' }, T.ada)).status, 200)
  const msg = await k.read(sentTo(k.sub.endpoint).at(-1)!.body)
  assert.equal(msg.title, '💸 You received ₦500')
  assert.match(msg.body, /@ada/)
  assert.ok(sentTo('https://fcm.push.test/send/kemal-1').length >= 1, 'every phone of the account')

  // A fee instalment due today shows up in To do → one notification, not repeated
  world.pushes.length = 0
  await q(`delete from rate_hits`)
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)
  assert.equal((await call('POST', 'fee-plan-save', { item: { title: 'Spring fees', due: today, amountMinor: 150000, currency: 'USD' } }, T.kemal)).status, 200)
  const fee = (await Promise.all(sentTo(k.sub.endpoint).map((p) => k.read(p.body)))).filter((x) => /Spring fees/.test(x.title))
  assert.equal(fee.length, 1)
  assert.equal(fee[0].url, '/uni?tab=fees')
  await q(`delete from rate_hits`)
  await call('GET', 'me', undefined, T.kemal)
  assert.equal((await Promise.all(sentTo(k.sub.endpoint).map((p) => k.read(p.body)))).filter((x) => /Spring fees/.test(x.title)).length, 1, 'no repeat')

  // Classes switched off on this phone → the next fee alert skips it
  await call('POST', 'push-prefs', { endpoint: k.sub.endpoint, prefs: { classes: false } }, T.kemal)
  world.pushes.length = 0
  await q(`delete from rate_hits`)
  await call('POST', 'fee-plan-save', { item: { title: 'Summer fees', due: today, amountMinor: 90000, currency: 'USD' } }, T.kemal)
  assert.equal(sentTo(k.sub.endpoint).length, 0)
  assert.ok(sentTo('https://fcm.push.test/send/kemal-1').length >= 1, 'the other phone still wants class alerts')

  // An expired subscription (410) is deleted
  const g = await phone('https://fcm.push.test/send/gone-1')
  await call('POST', 'push-subscribe', g.sub, T.ada)
  await call('POST', 'push-test', {}, T.ada)
  assert.equal((await q(`select count(*)::int n from push_subs where endpoint like '%gone-1'`))[0].n, 0)

  // Unsubscribe removes it; nothing more is sent there
  await call('POST', 'push-unsubscribe', { endpoint: k.sub.endpoint }, T.kemal)
  world.pushes.length = 0
  await call('POST', 'push-test', {}, T.kemal)
  assert.equal(sentTo(k.sub.endpoint).length, 0)
})
