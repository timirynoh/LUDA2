// v1.30.0: Luda's own emails through Resend: welcome, top-up receipt, withdrawal sent, ID verified.
// Off without RESEND_API_KEY; sent once per event (idempotency key); a Resend outage never breaks the action.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, handleWebhook, type Deps } from '../functions/_shared/handlers.ts'
import { MAILS, mailHtml } from '../functions/_shared/mailer.ts'
import { ENV, fakeWorld, makeDb, sign } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], world: ReturnType<typeof fakeWorld>['world']
const env: any = { ...ENV, RESEND_API_KEY: 're_test_key', ADMIN_EMAILS: 'boss@x.com' }
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string, e = env) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.30.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), e, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const mailsTo = (to: string) => world.mails.filter((m) => m.to === to)

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
  for (const [u, name] of [['ada', 'ada chioma okafor'], ['boss', 'Luda Boss']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
})

test('welcome email after sign-up: from no-reply, replies go to support, logo + safety line', () => {
  const w = mailsTo('ada@x.com')
  assert.equal(w.length, 1)
  assert.equal(w[0].subject, 'Welcome to Luda 👋🏾')
  assert.equal(w[0].from, 'Luda <no-reply@useluda.com>'); assert.equal(w[0].reply_to, 'support@useluda.com')
  assert.match(w[0].html, /Welcome to Luda, Ada!/); assert.match(w[0].html, /email\/logo-96\.png/)
  assert.match(w[0].html, /never ask for your PIN/); assert.match(w[0].text, /support@useluda\.com/)
  assert.match(w[0].html, /href="https:\/\/luda\.test\/"/, 'button opens the app address')
})

test('no key → no emails, and sign-up still works', async () => {
  const before = world.mails.length
  const plain: any = { ...ENV }
  assert.equal((await call('POST', 'signup', { email: 'nokey@x.com', username: 'nokey', fullName: 'No Key Person', password: 'Lefkosa2026!' }, undefined, plain)).status, 200)
  assert.equal(world.mails.length, before)
})

test('top-up receipt: once, even when the webhook comes twice', async () => {
  const r = await call('POST', 'deposit', { provider: 'paystack', amountMinor: 10_000_00 }, T.ada)
  world.charges.set(r.j.reference, { status: 'success' })
  const raw = JSON.stringify({ event: 'charge.success', data: { reference: r.j.reference } })
  const hook = () => handleWebhook(new Request('https://x/pay-webhook', { method: 'POST', body: raw, headers: { 'x-paystack-signature': sign.paystack(raw) } }), env, d)
  await hook(); await hook()
  const t = mailsTo('ada@x.com').filter((m) => m.key === `topup:${r.j.reference}`)
  assert.equal(t.length, 1)
  assert.match(t[0].subject, /^Top-up received: ₦10,000/)
  assert.ok(t[0].html.includes(r.j.reference), 'reference on the receipt')
  assert.ok((await q(`select 1 from payment_events where reference=$1 and kind='mail_sent'`, [id.ada])).length >= 2)
})

test('ID verified email (staff approval) and withdrawal sent email', async () => {
  await call('POST', 'admin-action', { action: 'kyc-approve', userId: id.ada, legalName: 'Ada Chioma Okafor', reason: 'Checked in person', pin: '4826' }, T.boss)
  const k = mailsTo('ada@x.com').find((m) => m.key === `kyc:${id.ada}`)
  assert.ok(k); assert.equal(k!.subject, 'Your ID is verified ✅'); assert.match(k!.html, /You’re verified, Ada/)

  world.transferReply = 'starter'; world.flwReply = 'ip' // refused → team pays by hand
  const w = (await call('POST', 'withdraw', { amountMinor: 3_000_00, account: '0123456789', bankCode: '058', pin: '4826' }, T.ada)).j
  assert.equal(w.status, 'processing', JSON.stringify(w))
  assert.ok(!mailsTo('ada@x.com').some((m) => m.key === `wdr:${w.reference}`), 'no email before it is actually sent')
  await call('POST', 'admin-payout-claim', { reference: w.reference }, T.boss)
  const PHOTO = { type: 'image/png', data: Buffer.from('fakepng').toString('base64') }
  assert.equal((await call('POST', 'admin-payout', { reference: w.reference, paid: true, checked: true, files: [PHOTO], pin: '4826' }, T.boss)).status, 200)
  const m = mailsTo('ada@x.com').find((x) => x.key === `wdr:${w.reference}`)
  assert.ok(m); assert.match(m!.subject, /^Withdrawal sent: ₦3,000/); assert.match(m!.html, /••6789/)
})

test('Resend down: the action still succeeds, the failure is logged', async () => {
  world.mailDown = true
  const r = await call('POST', 'signup', { email: 'down@x.com', username: 'downy', fullName: 'Down Person', password: 'Lefkosa2026!' })
  assert.equal(r.status, 200)
  const uid = (await q(`select user_id from profiles where username='downy'`))[0].user_id
  assert.equal((await q(`select count(*)::int n from payment_events where reference=$1 and kind='mail_failed'`, [uid]))[0].n, 1)
  world.mailDown = false
})

test('email HTML escapes what people typed', () => {
  const h = mailHtml(MAILS.welcome({ name: '<script>x</script> Doe' }), 'https://useluda.com')
  assert.ok(!h.includes('<script>x')); assert.match(h, /&lt;script&gt;/)
})

test('support team: new request → email + To do (phone alert); a user reply → new alert; staff without the Support job get nothing', async () => {
  for (const [u, roles] of [['sam', '{"overview":"view","cases":"edit","users":"view"}'], ['bill', '{"bills":"edit"}']] as const) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: `${u} Staffer`, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await q(`insert into staff (email, roles) values ($1, $2::jsonb)`, [`${u}@x.com`, roles])
  }
  const c = await call('POST', 'case-create', { category: 'other', subject: 'Top-up missing', message: 'I paid but my wallet is empty' }, T.ada)
  assert.equal(c.status, 200, JSON.stringify(c.j))
  const ticket = '#' + c.j.id.replace(/-/g, '').slice(0, 6).toUpperCase()
  const m = mailsTo('sam@x.com').filter((x) => x.key.startsWith(`case:${c.j.id}`))
  assert.equal(m.length, 1); assert.equal(m[0].subject, `New support request ${ticket}: Top-up missing`)
  assert.match(m[0].html, /I paid but my wallet is empty/); assert.match(m[0].html, /admin\?tab=cases/)
  assert.equal(mailsTo('bill@x.com').length, 1, 'bills staff only got their welcome email')
  const todo1 = (await call('GET', 'todo', undefined, T.sam)).j.items.find((i: any) => i.key.startsWith(`staffcase:${c.j.id}`))
  assert.ok(todo1); assert.equal(todo1.level, 'action'); assert.match(todo1.title, new RegExp(ticket))
  assert.ok(!(await call('GET', 'todo', undefined, T.bill)).j.items.some((i: any) => i.key.startsWith('staffcase:')))
  assert.ok(!(await call('GET', 'todo', undefined, T.ada)).j.items.some((i: any) => i.key.startsWith('staffcase:')))
  // the team answers → no longer waiting; the person replies → a NEW alert key (new phone alert); email waits 30 min per case
  await call('POST', 'admin-case-reply', { caseId: c.j.id, message: 'Checking now', status: 'waiting_user' }, T.sam)
  assert.ok(!(await call('GET', 'todo', undefined, T.sam)).j.items.some((i: any) => i.key.startsWith(`staffcase:${c.j.id}`)))
  await new Promise((r) => setTimeout(r, 5))
  await call('POST', 'case-reply', { caseId: c.j.id, message: 'Here is the receipt' }, T.ada)
  const todo2 = (await call('GET', 'todo', undefined, T.sam)).j.items.find((i: any) => i.key.startsWith(`staffcase:${c.j.id}`))
  assert.ok(todo2); assert.notEqual(todo2.key, todo1.key)
  assert.equal(mailsTo('sam@x.com').filter((x) => x.key.startsWith(`case:${c.j.id}`)).length, 1, 'no second email within 30 min')
})
