// v1.21.0: phone alerts in the person's language, statements & insights, Luda HQ money report, Verified Exchanger.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, trNotify, type Deps } from '../functions/_shared/handlers.ts'
import { b64u } from '../functions/_shared/webpush.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], world: ReturnType<typeof fakeWorld>['world']
const AENV = { ...ENV, ADMIN_EMAILS: 'boss@x.com', PUSH_ALLOW_TEST: '1' } as any
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.3.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const post = (u: string, cur: string, amt: number, kind: string, ref: string, meta = {}) => q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id[u], currency: cur, amount_minor: amt, kind, ref, meta }])])

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name] of [['ada', 'Ada Okafor'], ['kwame', 'Kwame Mensah'], ['boss', 'Luda Boss']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name)`)
})

test('alerts in my language: the server translates phone notifications into the person’s app language', async () => {
  assert.equal(trNotify('fr', '💸 You received ₦500'), '💸 Vous avez reçu ₦500')
  assert.equal(trNotify('tr', '@ada says they sent ₺100'), '@ada ₺100 gönderdiğini söylüyor', 'languages that swap word order')
  assert.equal(trNotify('fr', 'Something new nobody translated'), 'Something new nobody translated')
  assert.equal((await call('POST', 'lang', { lang: 'xx' }, T.kwame)).status, 400)
  assert.equal((await call('POST', 'lang', { lang: 'fr' }, T.kwame)).status, 200)
  // a phone for Kwame; Ada sends him money → the alert arrives in French
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16))
  const ep = 'https://fcm.push.test/send/kwame-fr'
  await call('POST', 'push-subscribe', { endpoint: ep, keys: { p256dh: b64u.enc(pub), auth: b64u.enc(auth) } }, T.kwame)
  await post('ada', 'NGN', 1_000_000, 'deposit', 'dep_ada1')
  await call('POST', 'send', { to: 'kwame', currency: 'NGN', amountMinor: 50_000, pin: '4826' }, T.ada)
  const body = world.pushes.filter((p) => p.endpoint === ep).at(-1)!.body
  const te = new TextEncoder()
  const hk = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8))
  const salt = body.slice(0, 16), asPub = body.slice(21, 86), ct = body.slice(86)
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, kp.privateKey, 256))
  const ikm = await hk(auth, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...pub, ...asPub]), 32)
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12) }, await crypto.subtle.importKey('raw', await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']), ct))
  const msg = JSON.parse(new TextDecoder().decode(pt.slice(0, -1)))
  assert.equal(msg.title, '💸 Vous avez reçu ₦500'); assert.equal(msg.body, 'De @ada')
})

test('statements: opening/closing balances, money in/out, categories and every line for a month', async () => {
  const month = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7)
  const s = (await call('GET', `statement?month=${month}`, undefined, T.ada)).j
  assert.equal(s.month, month)
  assert.deepEqual(s.currencies.NGN, { opening: 0, closing: 950_000, in: 1_000_000, out: 50_000 })
  assert.deepEqual(s.categories.map((c: any) => [c.cat, c.in, c.out]).sort(), [['topups', 1_000_000, 0], ['transfers', 0, 50_000]])
  assert.equal(s.rows.length, 2); assert.equal(s.rows[1].who, 'kwame')
  assert.deepEqual(s.months, [month]); assert.equal(s.holder.username, 'ada')
  const old = (await call('GET', 'statement?month=2020-01', undefined, T.ada)).j
  assert.equal(old.rows.length, 0)
})

test('Luda HQ money report: daily top-ups and withdrawals, money held, and provider vs ledger checks', async () => {
  // one top-up confirmed by the provider AND credited, one confirmed but never credited (must show up)
  await q(`insert into payments (reference, provider, purpose, status, amount_minor, currency, base_amount, base_currency, fx_rate, email, item, user_id, paid_at)
           values ('dep_ada1', 'paystack', 'deposit', 'paid', 1000000, 'NGN', 10000, 'NGN', 1, 'ada@x.com', '{}', $1, now()),
                  ('dep_lost', 'paystack', 'deposit', 'paid', 200000, 'NGN', 2000, 'NGN', 1, 'ada@x.com', '{}', $1, now())`, [id.ada])
  assert.equal((await call('GET', 'admin-money', undefined, T.ada)).status, 404, 'staff only')
  const r = (await call('GET', 'admin-money?days=7', undefined, T.boss)).j
  assert.equal(r.days.length, 7)
  const today = r.days[0]
  assert.equal(today.topups.reduce((n: number, t: any) => n + Number(t.amount), 0), 1_200_000)
  assert.deepEqual(r.checks.paidNotCredited.map((x: any) => x.ref), ['dep_lost'])
  assert.deepEqual(r.checks.creditedNotPaid, [])
  assert.equal(Number(r.now.wallets.NGN), 1_000_000)
  assert.deepEqual(r.now.ledgerVsWallets, [])
})

test('Verified Exchanger: requirements, ₺2,000 bond held, team approves, bigger limits + badge, removal refunds the bond', async () => {
  let g = (await call('GET', 'exchanger', undefined, T.kwame)).j
  assert.equal(g.eligible, false); assert.equal(g.checks.kyc, true); assert.equal(g.checks.trades, false); assert.equal(g.rules.bond, 2000_00)
  assert.equal((await call('POST', 'exchanger-apply', { pin: '4826' }, T.kwame)).status, 403, 'needs 5 trades at 90%')
  // (a record of good trades is simulated: apply through the SQL function the route uses after its checks)
  await post('kwame', 'TRY', 3000_00, 'adjustment', 'seed-try')
  await q(`select luda_exchanger_apply($1, 200000)`, [id.kwame])
  assert.equal((await call('GET', 'me', undefined, T.kwame)).j.balances.TRY, 1000_00, 'bond held from the Lira wallet')
  g = (await call('GET', 'exchanger', undefined, T.kwame)).j
  assert.equal(g.me.status, 'pending')
  assert.ok((await call('GET', 'inbox', undefined, T.kwame)).j.items.some((i: any) => i.title === 'Exchanger bond held: ₺2,000'))
  // still member limits until approved
  assert.match((await call('POST', 'p2p-ad-save', { side: 'sell', price: 40.5, minTry: 100_00, maxTry: 20_000_00, methods: ['cash'], area: 'Gönyeli' }, T.kwame)).j.error, /50,000/)
  // the team approves (PIN required)
  assert.equal((await call('POST', 'admin-exchanger', { username: 'kwame', action: 'approve' }, T.boss)).status, 401)
  assert.equal((await call('POST', 'admin-exchanger', { username: 'kwame', action: 'approve', pin: '4826' }, T.boss)).status, 200)
  assert.equal((await call('POST', 'p2p-ad-save', { side: 'sell', price: 40.5, minTry: 100_00, maxTry: 20_000_00, methods: ['cash'], area: 'Gönyeli' }, T.kwame)).status, 200)
  assert.equal((await call('POST', 'p2p-ad-save', { side: 'buy', price: 39.5, minTry: 100_00, maxTry: 50_000_00, methods: ['cash'], area: 'Gönyeli' }, T.kwame)).status, 200, 'a second ad')
  const list = (await call('GET', 'p2p?want=buy', undefined, T.ada)).j
  assert.equal(list.ads.find((a: any) => a.maker === 'kwame').exchanger, true)
  assert.equal((await call('GET', 'p2p', undefined, T.kwame)).j.rules.maxAds, 5)
  assert.equal((await call('GET', 'trader?u=kwame', undefined, T.ada)).j.trader.exchanger, true)
  assert.ok((await call('GET', 'inbox', undefined, T.kwame)).j.items.some((i: any) => i.title === 'You’re a Verified Exchanger'))
  // removal: reason required; the bond comes back (not kept); extra ads paused
  assert.equal((await call('POST', 'admin-exchanger', { username: 'kwame', action: 'remove', pin: '4826' }, T.boss)).status, 400)
  assert.equal((await call('POST', 'admin-exchanger', { username: 'kwame', action: 'remove', note: 'Too many late releases', pin: '4826' }, T.boss)).status, 200)
  assert.equal((await call('GET', 'me', undefined, T.kwame)).j.balances.TRY, 3000_00)
  assert.equal((await q(`select count(*)::int n from p2p_ads where user_id=$1 and status='active'`, [id.kwame]))[0].n, 1)
  assert.equal((await call('GET', 'trader?u=kwame', undefined, T.ada)).j.trader.exchanger, false)
  const h = (await call('GET', 'admin-exchangers', undefined, T.boss)).j.exchangers
  assert.equal(h[0].status, 'removed'); assert.equal(h[0].bond.status, 'refunded')
})

test('ID check: when Didit has no credit, the person gets a clear way forward, the try is not used, and the team sees why', async () => {
  world.diditNoCredit = true
  await q(`update profiles set kyc_status='none' where username='ada'`)
  const r = await call('POST', 'kyc-start', {}, T.ada)
  assert.equal(r.status, 503)
  assert.match(r.j.error, /Send your ID to the Luda team/)
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.profile.kycTriesLeft, 2, 'not counted')
  const ev = (await q(`select payload from payment_events where kind='kyc_start_failed'`))[0].payload
  assert.equal(ev.reason, 'no_credit'); assert.equal(ev.status, 402)
  world.diditNoCredit = false
  assert.equal((await call('POST', 'kyc-start', {}, T.ada)).status, 200, 'works again once topped up')
})
