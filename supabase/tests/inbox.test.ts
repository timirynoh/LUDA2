// v1.20.0: the in-app 🔔 inbox lives on the server; every money movement creates an item; other events too.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q']
const AENV = { ...ENV, ADMIN_EMAILS: 'boss@x.com' } as any
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.4.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const inbox = async (u: string) => (await call('GET', 'inbox', undefined, T[u])).j

before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  for (const [u, name] of [['ada', 'Ada Okafor'], ['kwame', 'Kwame Mensah'], ['boss', 'Luda Boss']]) {
    const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!' })
    T[u] = r.j.session.access_token
    await call('POST', 'pin', { pin: '4826' }, T[u])
    id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
  }
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name)`)
})

async function flashAgree(poster: string, helper: string, title: string, amountMinor: number, extra: Record<string, unknown> = {}) {
  const job = (await call('POST', 'flash-post', { title, details: 'Ground floor to 3rd', city: 'girne', budgetMinor: amountMinor, ...extra }, T[poster])).j.job
  await call('POST', 'flash-quote', { id: job.id, amountMinor }, T[helper])
  const qm = (await call('GET', `flash-job?id=${job.id}`, undefined, T[poster])).j.job.threads[0].messages.find((m: any) => m.kind === 'quote')
  await call('POST', 'flash-accept', { id: job.id, msgId: qm.id, pin: '4826' }, T[poster])
  return job
}

test('inbox: money in and out shows for both people, unread count, mark as read; private per person', async () => {
  await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id.ada, currency: 'NGN', amount_minor: 1_000_000, kind: 'deposit', ref: 'dep_test' }])])
  assert.equal((await call('POST', 'send', { to: 'kwame', currency: 'NGN', amountMinor: 250_050, pin: '4826' }, T.ada)).status, 200)
  const a = await inbox('ada'), k = await inbox('kwame')
  assert.deepEqual(a.items.map((i: any) => i.title), ['You sent ₦2,500.50 to @kwame', 'Top-up received: ₦10,000'])
  assert.equal(k.items[0].title, 'You received ₦2,500.50 from @ada'); assert.equal(k.items[0].emoji, '💸'); assert.equal(k.items[0].url, '/wallet')
  assert.equal(a.unread, 2)
  assert.equal((await call('GET', 'me', undefined, T.kwame)).j.profile.inboxUnread, 1)
  await call('POST', 'inbox-read', { ids: [a.items[0].id] }, T.ada)
  assert.equal((await inbox('ada')).unread, 1)
  await call('POST', 'inbox-read', { ids: [k.items[0].id] }, T.ada) // someone else's item: nothing happens
  assert.equal((await inbox('kwame')).unread, 1)
  await call('POST', 'inbox-read', {}, T.ada)
  assert.equal((await inbox('ada')).unread, 0)
})

test('inbox: Market, Flash, support replies and sign-ins notify the right person', async () => {
  await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id.ada, currency: 'TRY', amount_minor: 200_000, kind: 'adjustment', ref: 'seed-try' }])])
  const item = (await call('POST', 'market-list', { title: 'Rice cooker', priceMinor: 400_00, photos: [{ type: 'image/png', data: Buffer.from('x').toString('base64') }] }, T.kwame)).j.item
  await call('POST', 'market-buy', { id: item.id, pin: '4826' }, T.ada)
  assert.ok((await inbox('kwame')).items.some((i: any) => i.title === '@ada bought "Rice cooker"'))
  assert.ok((await inbox('ada')).items.some((i: any) => i.title === 'Market purchase, held safely: ₺400'))
  await call('POST', 'market-received', { id: item.id, pin: '4826' }, T.ada)
  assert.ok((await inbox('kwame')).items.some((i: any) => i.title === 'Market sale paid to you: ₺392'))

  const job = await flashAgree('ada', 'kwame', 'Carry a fridge', 150_00)
  assert.ok((await inbox('ada')).items.some((i: any) => i.title === '@kwame sent a price for "Carry a fridge": ₺150'))
  assert.ok((await inbox('kwame')).items.some((i: any) => i.title === '@ada accepted your price for "Carry a fridge"'))
  assert.ok(job.id)

  const c = (await call('POST', 'case-create', { category: 'payment', subject: 'Missing top-up', message: 'Paid but nothing came' }, T.ada)).j.id
  await call('POST', 'admin-case-reply', { caseId: c, message: 'Can you send the receipt?' }, T.boss)
  assert.ok((await inbox('ada')).items.some((i: any) => i.title === 'The Luda team replied to you' && i.body === 'Missing top-up'))
  await call('POST', 'admin-case-reply', { caseId: c, message: 'Credited', status: 'resolved' }, T.boss)
  assert.ok((await inbox('ada')).items.some((i: any) => i.title === 'Your case is solved'))

  await call('POST', 'login', { id: 'kwame', password: 'Lefkosa2026!' })
  assert.ok((await inbox('kwame')).items.some((i: any) => /^New sign-in on /.test(i.title)))
})
