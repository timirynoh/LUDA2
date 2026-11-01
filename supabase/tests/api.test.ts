// Full money journey against a real Postgres. Run: cd supabase && npm test
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, test } from 'node:test'
import { handleApi, handleWebhook, type Deps } from '../functions/_shared/handlers.ts'
import { depositFee, convertOut } from '../functions/_shared/money.ts'
import { priceTicket } from '../functions/_shared/pricing.ts'
import { idMatchesName, accountMatchesName, normDate } from '../functions/_shared/kyc.ts'
import { ENV, fakeWorld, makeDb, sign } from './harness.ts'

let d: Deps, world: ReturnType<typeof fakeWorld>['world'], q: Awaited<ReturnType<typeof makeDb>>['q']
const NOW = new Date('2026-11-02T10:00:00Z')

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
})

let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string, env = ENV, ip = `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), env, d)
  return { status: r.status, j: (await r.json()) as any }
}
const hook = (raw: string, headers: Record<string, string>) => handleWebhook(new Request('https://x/pay-webhook', { method: 'POST', body: raw, headers }), ENV, d)
const bal = async (t: string) => (await call('GET', 'me', undefined, t)).j.balances

let ada = '', bola = ''

test('pure rules: fees, conversion, prices, names, dates', () => {
  assert.equal(depositFee(10_000_00, {}), 25381) // ₦10,000 → fee ≈ ₦253.81 so the full ₦10,000 lands
  assert.equal(depositFee(1_000_00, {}), 1523) // under ₦2,500: no ₦100 flat
  assert.equal(depositFee(500_000_00, {}), 2_000_00) // capped at ₦2,000
  assert.equal(convertOut('NGN', 'TRY', 40_000_00, 40, 0.01), 990_00) // ₦40,000 → ₺990 after 1%
  assert.equal(convertOut('TRY', 'NGN', 100_00, 40, 0.01), 3960_00)
  assert.equal(priceTicket({ operatorId: 'virgo', return: true, pax: 2, from: 'Girne', to: 'Lefkoşa', date: '2026-11-03', time: '09:00', returnDate: '2026-11-03', returnTime: '18:00' }, NOW).amount, 900)
  assert.throws(() => priceTicket({ operatorId: 'virgo', pax: 9, date: '2026-11-03', time: '09:00' }, NOW), /Passengers/)
  assert.ok(idMatchesName({ firstName: 'ADA', middleName: 'CHIOMA', lastName: 'OKAFOR', dob: '' }, 'Ada Okafor'))
  assert.ok(!idMatchesName({ firstName: 'ADA', middleName: '', lastName: 'OKAFOR', dob: '' }, 'Ada Obi'))
  assert.ok(accountMatchesName('OKAFOR ADA CHIOMA', 'ADA CHIOMA OKAFOR')); assert.ok(!accountMatchesName('ADA STRANGER', 'ADA CHIOMA OKAFOR'))
  assert.equal(normDate('15-Apr-2000'), '2000-04-15'); assert.equal(normDate('15/04/2000'), '2000-04-15')
})

test('sign up, sign in by email or username, profile is created', async () => {
  let r = await call('POST', 'signup', { email: 'ada@x.com', username: 'ada', fullName: 'Ada Okafor', password: 'Lefkosa2026!' })
  assert.equal(r.status, 200, JSON.stringify(r.j)); ada = r.j.session.access_token
  r = await call('POST', 'signup', { email: 'ada2@x.com', username: 'ada', fullName: 'Ada Two', password: 'Lefkosa2026!' })
  assert.match(r.j.error, /taken/)
  r = await call('POST', 'signup', { email: 'b@x.com', username: 'bola', fullName: 'Bola', password: 'Lefkosa2026!' })
  assert.match(r.j.error, /full name/)
  bola = (await call('POST', 'signup', { email: 'b@x.com', username: 'bola', fullName: 'Bola Adeyemi', password: 'Lefkosa2026!' })).j.session.access_token
  assert.equal((await call('POST', 'login', { id: '@ada', password: 'Lefkosa2026!' })).status, 200)
  assert.equal((await call('POST', 'login', { id: 'ada@x.com', password: 'Lefkosa2026!' })).status, 200)
  assert.equal((await call('POST', 'login', { id: 'ada', password: 'nope' })).status, 401)
  assert.equal((await call('POST', 'login', { id: 'ghost', password: 'x' })).status, 401)
  const me = (await call('GET', 'me', undefined, ada)).j
  assert.equal(me.profile.username, 'ada'); assert.deepEqual(me.balances, { NGN: 0, TRY: 0 }); assert.equal(me.profile.kyc, 'none')
  assert.equal((await call('GET', 'me', undefined, 'tok_fake')).status, 401)
  assert.equal((await call('GET', 'me')).status, 401)
})

test('forgot password: reset link, then new password works', async () => {
  assert.equal((await call('POST', 'recover', { email: 'ada@x.com' })).status, 200)
  assert.ok(world.calls.includes('recover:ada@x.com:https://luda.test/reset'))
  assert.equal((await call('POST', 'password', { access_token: 'tok_bad', password: 'NewPass2026!' })).status, 400)
  assert.equal((await call('POST', 'password', { access_token: ada, password: 'NewPass2026!' })).status, 200)
  const hold = (await q(`select money_hold_until from profiles where username='ada'`))[0].money_hold_until
  assert.ok(new Date(hold).getTime() > Date.now() + 23 * 3600e3, 'money paused 24h after a password reset')
  await q(`update profiles set money_hold_until = null where username='ada'`)
  assert.equal((await call('POST', 'login', { id: 'ada', password: 'NewPass2026!' })).status, 200)
  assert.equal((await call('POST', 'login', { id: 'ada', password: 'Lefkosa2026!' })).status, 401)
})

test('PIN: must be set, not guessable, change needs the old one', async () => {
  assert.match((await call('POST', 'pin', { pin: '1234' }, ada)).j.error, /easy to guess/)
  assert.equal((await call('POST', 'pin', { pin: '4826' }, ada)).status, 200)
  assert.equal((await call('POST', 'pin', { pin: '9999' }, ada)).status, 400)
  assert.equal((await call('POST', 'pin', { pin: '5937', oldPin: '0000' }, ada)).status, 401)
  assert.equal((await call('POST', 'pin', { pin: '4826' }, bola)).status, 200)
})

test('deposit via Paystack: user pays the fee, wallet credited exactly once', async () => {
  const r = await call('POST', 'deposit', { provider: 'paystack', amountMinor: 10_000_00 }, ada)
  assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.feeMinor, 25381); assert.equal(r.j.chargeMinor, 10_253_81)
  assert.equal(world.inits.get(r.j.reference), 10_253_81, 'provider asked for credit + fee')
  assert.equal((await call('GET', `deposit?ref=${r.j.reference}`, undefined, ada)).j.status, 'pending')
  world.charges.set(r.j.reference, { status: 'success' })
  const raw = JSON.stringify({ event: 'charge.success', data: { reference: r.j.reference } })
  assert.equal((await hook(raw, { 'x-paystack-signature': sign.paystack(raw) })).status, 200)
  assert.equal((await hook(raw, { 'x-paystack-signature': sign.paystack(raw) })).status, 200) // retry
  assert.equal((await call('GET', `deposit?ref=${r.j.reference}`, undefined, ada)).j.status, 'paid')
  assert.equal((await bal(ada)).NGN, 10_000_00, 'exactly ₦10,000, once')
  assert.equal((await call('GET', `deposit?ref=${r.j.reference}`, undefined, bola)).status, 404, "can't peek at someone else's payment")
})

test('deposit via Flutterwave + forged and underpaid deposits', async () => {
  const r = await call('POST', 'deposit', { provider: 'flutterwave', amountMinor: 50_000_00 }, ada)
  world.charges.set(r.j.reference, { status: 'success' })
  const raw = JSON.stringify({ event: 'charge.completed', data: { tx_ref: r.j.reference } })
  assert.equal((await hook(raw, { 'flutterwave-signature': 'AAAA' })).status, 401, 'forged')
  assert.equal((await hook(raw, { 'verif-hash': 'wrong' })).status, 401, 'forged v3')
  assert.equal((await hook(raw, { 'flutterwave-signature': sign.flutterwave(raw) })).status, 200)
  assert.equal((await bal(ada)).NGN, 60_000_00)
  const u = await call('POST', 'deposit', { provider: 'paystack', amountMinor: 5_000_00 }, ada)
  world.charges.set(u.j.reference, { status: 'success', amount: 100 })
  assert.equal((await call('GET', `deposit?ref=${u.j.reference}`, undefined, ada)).j.status, 'mismatch')
  assert.equal((await bal(ada)).NGN, 60_000_00, 'underpayment not credited')
})

test('deposit limits for unverified users', async () => {
  const r = await call('POST', 'deposit', { provider: 'paystack', amountMinor: 90_000_00 }, ada)
  assert.match(r.j.error, /Daily top-up limit/)
  assert.match((await call('POST', 'deposit', { provider: 'paystack', amountMinor: 50 }, ada)).j.error, /between/)
  assert.match((await call('POST', 'deposit', { provider: 'paypal', amountMinor: 5_000_00 }, ada)).j.error, /not available/)
})

test('convert Naira → Lira with PIN; stale quote refused', async () => {
  assert.equal((await call('POST', 'convert', { from: 'NGN', to: 'TRY', amountMinor: 40_000_00, pin: '0000' }, ada)).status, 401)
  assert.equal((await call('POST', 'convert', { from: 'NGN', to: 'TRY', amountMinor: 40_000_00, pin: '4826', expectMinor: 2000_00 }, ada)).status, 409)
  const r = await call('POST', 'convert', { from: 'NGN', to: 'TRY', amountMinor: 40_000_00, pin: '4826', expectMinor: 990_00 }, ada)
  assert.equal(r.j.receivedMinor, 990_00)
  assert.deepEqual(await bal(ada), { NGN: 20_000_00, TRY: 990_00 })
  assert.match((await call('POST', 'convert', { from: 'NGN', to: 'TRY', amountMinor: 999_000_00, pin: '4826' }, ada)).j.error, /Not enough/)
})

test('bus ticket from the Lira wallet, and from Naira at today\'s rate', async () => {
  const item = { operatorId: 'virgo', return: false, pax: 1, from: 'Girne', to: 'Lefkoşa', date: new Date().toISOString().slice(0, 10), time: '23:50' }
  const t = await call('POST', 'ticket', { currency: 'TRY', item, pin: '4826' }, ada)
  assert.equal(t.status, 200, JSON.stringify(t.j)); assert.equal(Number(t.j.ticket.paid_minor), 250_00); assert.equal(t.j.ticket.item.holder, 'Ada Okafor')
  assert.equal((await bal(ada)).TRY, 740_00)
  const n = await call('POST', 'ticket', { currency: 'NGN', item: { ...item, operatorId: 'kibhas', city: 'girne' }, pin: '4826' }, ada)
  assert.equal(Number(n.j.ticket.paid_minor), Math.ceil(350 * 100 * 40 * 1.01)) // ₺350 at 40 + 1%
  assert.match((await call('POST', 'ticket', { currency: 'TRY', item: { ...item, pax: 6, return: true, returnDate: item.date, returnTime: '23:55' }, pin: '4826' }, ada)).j.error, /Not enough/)
  assert.match((await call('POST', 'ticket', { currency: 'TRY', item, pin: '4826' }, ada, { ...ENV, SELL_OPERATORS: 'girneliler' })).j.error, /coming soon/)
  assert.equal((await call('GET', 'me', undefined, ada)).j.tickets.length, 2)
})

test('sending and withdrawing need KYC; Dojah check matches name + date of birth', async () => {
  assert.equal((await call('POST', 'send', { to: 'bola', currency: 'TRY', amountMinor: 50_00, pin: '4826' }, ada)).status, 403)
  assert.equal((await call('POST', 'withdraw', { amountMinor: 5_000_00, account: '0123456789', bankCode: '058', pin: '4826' }, ada)).status, 403)
  assert.match((await call('POST', 'kyc', { type: 'nin', number: '12345678901', dob: '2001-04-16' }, ada)).j.error, /Date of birth/)
  assert.match((await call('POST', 'kyc', { type: 'nin', number: '10987654321', dob: '2000-04-15' }, ada)).j.error, /doesn't match "Ada Okafor"/)
  const ok = await call('POST', 'kyc', { type: 'nin', number: '12345678901', dob: '2001-04-15' }, ada)
  assert.equal(ok.j.status, 'verified'); assert.equal(ok.j.name, 'ADA CHIOMA OKAFOR')
  const row = (await q(`select kyc_id_last4 from profiles where username='ada'`))[0]
  assert.equal(row.kyc_id_last4, '8901', 'only the last 4 digits are stored')
  assert.match((await call('POST', 'kyc', { type: 'nin', number: '10987654321', dob: '2000-04-15' }, bola)).j.error ?? 'verified', /verified|match/)
})

test('send money between users', async () => {
  const look = await call('GET', 'user?u=@bola', undefined, ada); assert.equal(look.j.fullName, 'Bola Adeyemi')
  assert.match((await call('POST', 'send', { to: 'ada', currency: 'TRY', amountMinor: 50_00, pin: '4826' }, ada)).j.error, /yourself/)
  assert.equal((await call('POST', 'send', { to: 'ghost', currency: 'TRY', amountMinor: 50_00, pin: '4826' }, ada)).status, 404)
  const r = await call('POST', 'send', { to: 'bola', currency: 'TRY', amountMinor: 100_00, pin: '4826', note: 'for the bus <script>' }, ada)
  assert.equal(r.status, 200, JSON.stringify(r.j))
  assert.equal((await bal(ada)).TRY, 640_00); assert.equal((await bal(bola)).TRY, 100_00)
  const h = (await call('GET', 'me', undefined, bola)).j.history[0]
  assert.equal(h.kind, 'receive'); assert.equal(h.meta.from, 'ada'); assert.ok(!h.meta.note.includes('<'))
})

test('withdraw to own bank account only; failed payout refunds once; success settles', async () => {
  assert.equal((await call('GET', 'banks', undefined, ada)).j.banks[0].name, 'Access Bank')
  const res = await call('POST', 'resolve', { account: '0123456789', bankCode: '058' }, ada)
  assert.equal(res.j.accountName, 'OKAFOR ADA CHIOMA'); assert.equal(res.j.matches, true)
  assert.match((await call('POST', 'withdraw', { amountMinor: 5_000_00, account: '0999999999', bankCode: '058', pin: '4826' }, ada)).j.error, /own account/)
  const before = (await bal(ada)).NGN
  const w = await call('POST', 'withdraw', { amountMinor: 5_000_00, account: '0123456789', bankCode: '058', bankName: 'GTBank', pin: '4826' }, ada)
  assert.equal(w.j.status, 'processing'); assert.equal((await bal(ada)).NGN, before - 5_000_00 - 50_00, 'amount + ₦50 fee held')
  world.transfers.set(w.j.reference, 'failed')
  const raw = JSON.stringify({ event: 'transfer.failed', data: { reference: w.j.reference } })
  await hook(raw, { 'x-paystack-signature': sign.paystack(raw) }); await hook(raw, { 'x-paystack-signature': sign.paystack(raw) })
  assert.equal((await bal(ada)).NGN, before, 'refunded once, including the fee')
  const w2 = await call('POST', 'withdraw', { amountMinor: 2_000_00, account: '0123456789', bankCode: '058', pin: '4826' }, ada)
  world.transfers.set(w2.j.reference, 'success')
  assert.equal((await call('GET', `withdrawal?ref=${w2.j.reference}`, undefined, ada)).j.status, 'paid')
  assert.equal((await bal(ada)).NGN, before - 2_050_00)
  assert.match((await call('POST', 'withdraw', { amountMinor: 9_000_000_00, account: '0123456789', bankCode: '058', pin: '4826' }, ada)).j.error, /limit|Not enough/)
  const me = (await call('GET', 'me', undefined, ada)).j
  assert.ok(me.withdrawals.every((x: any) => x.account_number.startsWith('••••') && !x.recipient_code), 'account numbers masked')
})

test('top up in Ghana cedi via Flutterwave → Lira wallet (fee on top)', async () => {
  const before = (await bal(ada)).TRY
  assert.match((await call('POST', 'deposit', { provider: 'paystack', currency: 'GHS', amountMinor: 100_00 }, ada)).j.error, /Flutterwave/)
  assert.match((await call('POST', 'deposit', { provider: 'flutterwave', currency: 'CDF', amountMinor: 100_00 }, ada)).j.error, /not available/)
  assert.match((await call('POST', 'deposit', { provider: 'flutterwave', currency: 'GHS', amountMinor: 10_00 }, ada)).j.error, /Minimum/)
  const r = await call('POST', 'deposit', { provider: 'flutterwave', currency: 'GHS', amountMinor: 100_00 }, ada)
  assert.equal(r.status, 200, JSON.stringify(r.j))
  assert.equal(r.j.creditCurrency, 'TRY'); assert.equal(r.j.creditMinor, 247_50) // GH₵100 at 0.4/₺ = ₺250, minus 1% margin
  assert.equal(r.j.feeMinor, 3_96); assert.equal(world.inits.get(r.j.reference), 103_96, 'Flutterwave charged GH₵103.96')
  world.charges.set(r.j.reference, { status: 'success', currency: 'GHS' })
  assert.equal((await call('GET', `deposit?ref=${r.j.reference}`, undefined, ada)).j.status, 'paid')
  assert.equal((await bal(ada)).TRY, before + 247_50)
  const cfg = (await call('GET', 'config')).j; assert.deepEqual(cfg.foreign, ['USD', 'GHS', 'KES', 'UGX', 'ZMW', 'XAF'])
  assert.deepEqual((await call('GET', 'config', undefined, undefined, { ...ENV, FOREIGN_CURRENCIES: 'ghs, usd' })).j.foreign, ['USD', 'GHS'])
})

test('PIN locks after 5 wrong tries; frozen accounts cannot spend', async () => {
  for (let i = 0; i < 5; i++) await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, pin: '0000' }, bola)
  assert.equal((await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, pin: '4826' }, bola)).status, 429)
  await q(`update profiles set pin_locked_until = null, frozen = true where username = 'bola'`)
  assert.match((await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, pin: '4826' }, bola)).j.error, /on hold/)
})

test('no duplicate emails or usernames; live availability check', async () => {
  const av = (await call('GET', 'available?username=ADA&email=Ada@X.com')).j
  assert.deepEqual(av, { username: false, email: false })
  assert.deepEqual((await call('GET', 'available?username=fresh_name&email=new@x.com')).j, { username: true, email: true })
  assert.equal((await call('GET', 'available?username=a!&email=nope')).j.username, null, 'invalid → no answer')
  const r = await call('POST', 'signup', { email: 'ADA@x.com', username: 'someone_new', fullName: 'Ada Clone', password: 'Lefkosa2026!' })
  assert.equal(r.status, 409); assert.match(r.j.error, /email already exists/)
  const u = await call('POST', 'signup', { email: 'other@x.com', username: 'bola', fullName: 'Other Person', password: 'Lefkosa2026!' })
  assert.equal(u.status, 409); assert.match(u.j.error, /username is already taken/)
})

test('Continue with Google: switched on, profile made from Google name', async () => {
  assert.equal((await call('GET', 'config')).j.google, true)
  const id = randomUUID(); world.users.set(id, { id, email: 'ama.owusu@gmail.com', password: '', meta: { name: 'Ama Owusu', full_name: 'Ama Owusu' } })
  await q(`insert into auth.users values ($1,$2)`, [id, 'ama.owusu@gmail.com'])
  const me = (await call('GET', 'me', undefined, 'tok_' + id)).j.profile
  assert.equal(me.fullName, 'Ama Owusu'); assert.equal(me.username, 'ama.owusu'); assert.equal(me.hasPin, false)
})

test('fingerprint: register with PIN, approve payments, refuse replays and fakes', async () => {
  const { subtle } = globalThis.crypto
  const enc = (u: ArrayBuffer | Uint8Array) => Buffer.from(u as ArrayBuffer).toString('base64url')
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const spki = enc(await subtle.exportKey('spki', kp.publicKey)), credId = enc(Buffer.from('ada-phone-credential-0001'))
  const cdj = (type: string, challenge: string, origin = 'https://luda.test') => enc(Buffer.from(JSON.stringify({ type, challenge, origin })))
  const toDer = (raw: Uint8Array) => {
    const int = (b: Uint8Array) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; let v = b.slice(i); if (v[0] & 0x80) v = Uint8Array.from([0, ...v]); return [0x02, v.length, ...v] }
    const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))]; return Uint8Array.from([0x30, body.length, ...body])
  }
  let counter = 0
  async function approve(opts: { origin?: string; flags?: number; id?: string } = {}) {
    const { challenge } = (await call('GET', 'bio', undefined, ada)).j
    const rp = new Uint8Array(await subtle.digest('SHA-256', Buffer.from('luda.test')))
    counter++
    const ad = Uint8Array.from([...rp, opts.flags ?? 0x05, 0, 0, 0, counter])
    const clientDataJSON = cdj('webauthn.get', challenge, opts.origin)
    const data = Buffer.concat([ad, Buffer.from(await subtle.digest('SHA-256', Buffer.from(clientDataJSON, 'base64url')))])
    const sig = toDer(new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, data)))
    return { id: opts.id ?? credId, clientDataJSON, authenticatorData: enc(ad), signature: enc(sig) }
  }
  // register: needs a fresh challenge + the PIN
  let g = (await call('GET', 'bio', undefined, ada)).j
  assert.equal(g.rpId, 'luda.test')
  assert.equal((await call('POST', 'bio', { pin: '0000', id: credId, publicKey: spki, alg: -7, clientDataJSON: cdj('webauthn.create', g.challenge) }, ada)).status, 401)
  g = (await call('GET', 'bio', undefined, ada)).j
  const reg = await call('POST', 'bio', { pin: '4826', id: credId, publicKey: spki, alg: -7, clientDataJSON: cdj('webauthn.create', g.challenge), device: 'Pixel' }, ada)
  assert.equal(reg.status, 200, JSON.stringify(reg.j))
  assert.equal((await call('GET', 'bio', undefined, ada)).j.keys.length, 1)
  // approve a conversion with the fingerprint (no PIN)
  const before = await bal(ada)
  const ok = await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, bio: await approve() }, ada)
  assert.equal(ok.status, 200, JSON.stringify(ok.j)); assert.equal((await bal(ada)).TRY, before.TRY - 10_00)
  // the same approval can't be used twice (challenge is single-use)
  const a1 = await approve(); await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, bio: a1 }, ada)
  assert.equal((await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, bio: a1 }, ada)).status, 401, 'replay refused')
  // fakes
  assert.equal((await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, bio: await approve({ origin: 'https://evil.example' }) }, ada)).status, 401, 'other website')
  assert.equal((await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, bio: await approve({ flags: 0x01 }) }, ada)).status, 401, 'no fingerprint (user not verified)')
  assert.equal((await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, bio: await approve({ id: 'unknown-key-xxxxxxxx' }) }, ada)).status, 401, 'unregistered key')
  assert.equal((await call('POST', 'convert', { from: 'TRY', to: 'NGN', amountMinor: 10_00, bio: await approve() }, bola)).status, 401, "someone else's account")
  // remove
  await call('POST', 'bio-remove', { id: credId }, ada)
  assert.equal((await call('GET', 'bio', undefined, ada)).j.keys.length, 0)
})

test('phone numbers: SMS-verified, one account per number', async () => {
  assert.equal((await call('GET', 'config')).j.sms, true)
  assert.match((await call('POST', 'phone-start', { phone: '12' }, ada)).j.error, /country code/)
  const st = await call('POST', 'phone-start', { phone: '0533 812 44 55' }, ada)
  assert.equal(st.j.phone, '+905338124455', JSON.stringify(st.j)); assert.ok(world.calls.includes('sms:+905338124455'))
  assert.match((await call('POST', 'phone-check', { phone: '+905338124455', code: '000000' }, ada)).j.error, /wrong or expired/)
  assert.equal((await call('POST', 'phone-check', { phone: '+905338124455', code: '123456' }, ada)).status, 200)
  const me = (await call('GET', 'me', undefined, ada)).j.profile
  assert.equal(me.phoneVerified, true); assert.equal(me.phone, '+905•••455', 'number masked')
  const dup = await call('POST', 'phone-start', { phone: '+90 533 812 4455' }, bola)
  assert.equal(dup.status, 409); assert.match(dup.j.error, /already used by another Luda account/)
  assert.equal((await call('POST', 'phone-check', { phone: '+905338124455', code: '123456' }, bola)).status, 409, 'even with a valid code')
})

test('security: password guessing, sign-up spam and post-reset cash-out are blocked', async () => {
  for (let i = 0; i < 8; i++) assert.equal((await call('POST', 'login', { id: 'victim_user', password: 'guess' + i })).status, 401)
  const r = await call('POST', 'login', { id: 'victim_user', password: 'guess9' })
  assert.equal(r.status, 429); assert.match(r.j.error, /Too many sign-in attempts/)
  for (let i = 0; i < 5; i++) await call('POST', 'signup', { email: `spam${i}@x.com`, username: `spam_${i}`, fullName: 'Spam Bot', password: 'Lefkosa2026!' }, undefined, ENV, '6.6.6.6')
  assert.equal((await call('POST', 'signup', { email: 'spam9@x.com', username: 'spam_9', fullName: 'Spam Bot', password: 'Lefkosa2026!' }, undefined, ENV, '6.6.6.6')).status, 429)
  await q(`update profiles set money_hold_until = now() + interval '1 day' where username='ada'`)
  const s1 = await call('POST', 'send', { to: 'bola', currency: 'TRY', amountMinor: 10_00, pin: '4826' }, ada)
  assert.equal(s1.status, 403); assert.match(s1.j.error, /paused/)
  await q(`update profiles set money_hold_until = null where username='ada'`)
})

test('freeze my wallet: instant on, PIN to unfreeze, team freezes stay', async () => {
  assert.equal((await call('POST', 'freeze', {}, ada)).j.frozen, true)
  assert.match((await call('POST', 'send', { to: 'bola', currency: 'TRY', amountMinor: 10_00, pin: '4826' }, ada)).j.error ?? '', /on hold/)
  assert.equal((await call('POST', 'freeze', { freeze: false, pin: '0000' }, ada)).status, 401)
  assert.equal((await call('POST', 'freeze', { freeze: false, pin: '4826' }, ada)).j.frozen, false)
  await q(`update profiles set frozen = true, frozen_by = 'admin' where username = 'ada'`)
  assert.equal((await call('POST', 'freeze', { freeze: false, pin: '4826' }, ada)).status, 403, 'only the team lifts a team freeze')
  await q(`update profiles set frozen = false, frozen_by = null where username = 'ada'`)
})

test('change password while signed in needs the current one', async () => {
  assert.equal((await call('POST', 'change-password', { oldPassword: 'wrong-one', newPassword: 'Another2026!' }, ada)).status, 401)
  assert.equal((await call('POST', 'change-password', { oldPassword: 'NewPass2026!', newPassword: 'Another2026!' }, ada)).status, 200)
  assert.equal((await call('POST', 'login', { id: 'ada@x.com', password: 'Another2026!' })).status, 200)
})

test('top-up credited even if the user never came back and no webhook arrived (self-healing)', async () => {
  const before = (await bal(ada)).NGN
  const r = await call('POST', 'deposit', { provider: 'paystack', amountMinor: 1_000_00 }, ada)
  world.charges.set(r.j.reference, { status: 'success' }) // paid on Paystack; browser closed; webhook missing
  assert.equal((await bal(ada)).NGN, before + 1_000_00, 'credited just by opening the app')
  assert.equal((await bal(ada)).NGN, before + 1_000_00, 'and only once')
  const deps = (await call('GET', 'me', undefined, ada)).j.deposits
  const mine = deps.find((x: any) => x.reference === r.j.reference)
  assert.equal(mine.status, 'paid'); assert.equal(mine.provider, 'paystack'); assert.ok(mine.createdAt && mine.paidAt)
  assert.ok(deps.some((x: any) => x.status === 'mismatch'), 'failed / under-review top-ups are listed too')
})

test('customer paid Paystack fee on top (amount > asked): still credited as quoted', async () => {
  const before = (await bal(ada)).NGN
  const r = await call('POST', 'deposit', { provider: 'paystack', amountMinor: 1_000_00 }, ada)
  world.charges.set(r.j.reference, { status: 'success', amount: r.j.chargeMinor + 15_00, requested: r.j.chargeMinor } as any)
  assert.equal((await call('GET', `deposit?ref=${r.j.reference}`, undefined, ada)).j.status, 'paid')
  assert.equal((await bal(ada)).NGN, before + 1_000_00)
})

test('books balance: every wallet equals the sum of its ledger', async () => {
  const bad = await q(`select w.user_id from wallets w left join (select user_id, currency, sum(amount_minor) s from ledger group by 1,2) l using (user_id, currency) where w.balance_minor <> coalesce(l.s, 0)`)
  assert.equal(bad.length, 0)
  assert.equal((await call('GET', 'nope')).status, 404)
})
