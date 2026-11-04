// v1.12.0: guides + terms on the server, private appeal messages, P2P reviews/remind/block, server-checked ticket QR.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q']
const AENV: Record<string, string> = { ...ENV, ADMIN_EMAILS: 'boss@x.com' } as any
let ipN = 0
async function call(method: string, route: string, body?: unknown, token?: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.8.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }), AENV as any, d)
  return { status: r.status, j: (await r.json()) as any }
}
const T: Record<string, string> = {}, id: Record<string, string> = {}
const signup = async (u: string, name: string, extra: Record<string, unknown> = {}) => {
  const r = await call('POST', 'signup', { email: `${u}@x.com`, username: u, fullName: name, password: 'Lefkosa2026!', country: 'NG', ...extra })
  T[u] = r.j.session.access_token
  await call('POST', 'pin', { pin: '4826' }, T[u])
  id[u] = (await q(`select user_id from profiles where username=$1`, [u]))[0].user_id
}
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)

before(async () => {
  const m = await makeDb(); q = m.q
  d = { db: m.db, fetch: fakeWorld(m.q).f, now: () => new Date() }
  await signup('boss', 'Owner Person')
  await signup('ada', 'Ada Okafor', { terms: 1 }); await signup('kemal', 'Kemal Yilmaz'); await signup('driver', 'Bus Driver')
  await q(`update profiles set kyc_status='verified', kyc_name=upper(full_name) where username in ('ada','kemal')`)
})

test('guides and terms come from the server; accepting terms is recorded; a new version asks again', async () => {
  const g = (await call('GET', 'guide?slug=p2p-proof')).j.guide
  assert.match(g.title, /proof/); assert.ok(g.steps.length >= 6); assert.ok(g.steps.some((x: any) => /Play Store/.test(x.title)))
  assert.ok((await call('GET', 'guides?kind=tip')).j.guides.length >= 5)
  let me = (await call('GET', 'me', undefined, T.ada)).j.profile
  assert.equal(me.termsVersion, 1, 'accepted at sign-up'); assert.equal(me.termsCurrent, 1)
  assert.equal((await call('GET', 'me', undefined, T.kemal)).j.profile.termsVersion, 0)
  assert.equal((await call('POST', 'terms-accept', { version: 1 }, T.kemal)).status, 200)
  // editing the terms: content:edit can't; owner can, and can ask everyone to accept again
  await call('POST', 'admin-staff-set', { email: 'driver@x.com', roles: { content: 'edit', tickets: 'edit' }, pin: '4826' }, T.boss)
  assert.equal((await call('POST', 'admin-guide-save', { slug: 'terms', title: 'Luda Terms', intro: 'x', steps: [{ title: 'a', body: 'b' }], bump: true }, T.driver)).status, 403)
  assert.equal((await call('POST', 'admin-guide-save', { slug: 'p2p-proof', title: 'How to record proof', intro: 'Video only', steps: [{ title: 'Start', body: 'Record' }] }, T.driver)).status, 200)
  assert.equal((await call('POST', 'admin-guide-save', { slug: 'terms', title: 'Luda Terms', intro: 'Updated', steps: [{ title: '1', body: 'Rules' }], bump: true }, T.boss)).status, 200)
  me = (await call('GET', 'me', undefined, T.ada)).j.profile
  assert.equal(me.termsCurrent, 2); assert.equal(me.termsVersion, 1, 'must accept again')
  assert.equal((await call('POST', 'terms-accept', { version: 1 }, T.ada)).status, 409, 'old version refused')
  await call('POST', 'terms-accept', { version: 2 }, T.ada)
  assert.equal((await call('GET', 'me', undefined, T.ada)).j.profile.termsVersion, 2)
})

test('P2P: Luda-team-only evidence, reviews after completion, remind, block', async () => {
  await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: id.ada, currency: 'NGN', amount_minor: 1_000_000_00, kind: 'adjustment', ref: 'seed-ada' }])])
  const ad = (await q(`insert into p2p_ads (user_id, side, price, min_try, max_try, available_try, methods) values ($1,'sell',28,5000,500000,500000,'{cash}') returning id`, [id.kemal]))[0].id
  const o = (await call('POST', 'p2p-order', { adId: ad, amountTry: 100_00, method: 'cash', area: 'Gonyeli', pin: '4826' }, T.ada)).j.order
  assert.ok(o?.id, 'order opened')
  assert.equal((await call('POST', 'p2p-msg', { id: o.id, body: 'secret', private: true }, T.ada)).status, 409, 'private only in an appeal')
  await q(`update p2p_orders set status='appeal', appeal_stage='review', appeal_at=now() where id=$1`, [o.id])
  await call('POST', 'p2p-msg', { id: o.id, body: 'My bank statement (team only)', private: true }, T.ada)
  await call('POST', 'p2p-msg', { id: o.id, body: 'Everyone can see this' }, T.ada)
  const kemalSees = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.kemal)).j.order.messages.map((m: any) => m.body)
  assert.ok(kemalSees.includes('Everyone can see this')); assert.equal(kemalSees.includes('My bank statement (team only)'), false, 'other side cannot see it')
  const adaSees = (await call('GET', `p2p-order?id=${o.id}`, undefined, T.ada)).j.order.messages.find((m: any) => m.private)
  assert.equal(adaSees.body, 'My bank statement (team only)', 'the author still sees it, marked private')
  assert.ok((await call('GET', `admin-p2p?id=${o.id}`, undefined, T.boss)).j.order.messages.some((m: any) => m.private), 'staff see it')
  // remind: once per 5 minutes, shows on the other person's To do
  assert.equal((await call('POST', 'p2p-remind', { id: o.id }, T.ada)).status, 200)
  assert.equal((await call('POST', 'p2p-remind', { id: o.id }, T.ada)).status, 429)
  assert.ok((await call('GET', 'todo', undefined, T.kemal)).j.items.some((x: any) => /@ada is waiting for you/.test(x.title)))
  // review only after done, once
  assert.equal((await call('POST', 'p2p-review', { id: o.id, good: true }, T.ada)).status, 409)
  await q(`update p2p_orders set status='done', done_at=now(), sent_at=now()-interval '6 minutes', appeal_stage=null where id=$1`, [o.id])
  assert.ok((await call('GET', 'todo', undefined, T.ada)).j.items.some((x: any) => /Rate your trade/.test(x.title)))
  assert.equal((await call('POST', 'p2p-review', { id: o.id, good: true, body: 'Fast and honest' }, T.ada)).status, 200)
  assert.equal((await call('POST', 'p2p-review', { id: o.id, good: false }, T.ada)).status, 409, 'once')
  assert.equal((await call('GET', 'p2p-reviews?u=kemal', undefined, T.ada)).j.reviews[0].body, 'Fast and honest')
  const stats = (await q(`select luda_p2p_stats($1) s`, [id.ada]))[0].s
  assert.equal(stats.releaseMin, 6, 'average release time from real orders')
  assert.equal((await q(`select luda_p2p_stats($1) s`, [id.kemal]))[0].s.good, 1)
  // block: their ads disappear and they can't open an order with you
  assert.equal((await call('GET', 'p2p?want=buy', undefined, T.ada)).j.ads.length, 1)
  await call('POST', 'p2p-block', { username: 'kemal' }, T.ada)
  assert.equal((await call('GET', 'p2p?want=buy', undefined, T.ada)).j.ads.length, 0, 'hidden')
  assert.equal((await call('POST', 'p2p-order', { adId: ad, amountTry: 100_00, method: 'cash', area: 'x', pin: '4826' }, T.ada)).status, 403)
  await call('POST', 'p2p-block', { username: 'kemal', on: false }, T.ada)
  assert.equal((await call('GET', 'p2p?want=buy', undefined, T.ada)).j.ads.length, 1, 'unblocked')
})

test('bus ticket QR: made by the server, checked by staff with the tickets role; screenshots/old codes and reuse fail', async () => {
  const tk = (await q(`insert into tickets (user_id, code, item, base_amount, paid_minor, paid_currency) values ($1, 'LUDA7Q2K', $2, 250, 25000, 'TRY') returning id`,
    [id.ada, JSON.stringify({ from: 'Girne', to: 'Lefkoşa', date: today(), time: '10:00', pax: 1, operatorId: 'virgo' })]))[0]
  assert.equal((await call('GET', 'ticket-qr?code=LUDA7Q2K', undefined, T.kemal)).status, 404, 'only the holder gets the code')
  const qr = (await call('GET', 'ticket-qr?code=LUDA7Q2K', undefined, T.ada)).j
  assert.match(qr.payload, /^luda:\/\/ticket\/LUDA7Q2K\/\d{6}$/)
  assert.equal((await call('POST', 'ticket-check', { payload: qr.payload }, T.ada)).status, 404, 'passengers cannot check tickets')
  const bad = (await call('POST', 'ticket-check', { payload: 'luda://ticket/LUDA7Q2K/000000' }, T.driver)).j
  assert.equal(bad.ok, false); assert.match(bad.verdict, /Old code/)
  const ok = (await call('POST', 'ticket-check', { payload: qr.payload }, T.driver)).j
  assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(ok.ticket.holder, 'Ada Okafor')
  const again = (await call('POST', 'ticket-check', { payload: qr.payload }, T.driver)).j
  assert.equal(again.ok, false); assert.match(again.verdict, /Already used/)
  assert.equal((await q(`select status from tickets where id=$1`, [tk.id]))[0].status, 'used')
  // wrong day
  await q(`insert into tickets (user_id, code, item, base_amount, paid_minor, paid_currency) values ($1, 'LUDAOLD1', $2, 250, 25000, 'TRY')`, [id.ada, JSON.stringify({ from: 'Girne', to: 'Lefkoşa', date: '2026-01-01', time: '10:00', pax: 1 })])
  assert.match((await call('POST', 'ticket-check', { code: 'LUDAOLD1' }, T.driver)).j.verdict, /Wrong day/)
})

test('proof videos: only real phone video types under 50 MB, only into your own folder for that order', async () => {
  const o = (await q(`select id from p2p_orders limit 1`))[0]
  await q(`update p2p_orders set status='appeal' where id=$1`, [o.id])
  assert.match((await call('POST', 'p2p-video-start', { id: o.id, type: 'application/zip', size: 1000 }, T.ada)).j.error, /MP4/)
  assert.match((await call('POST', 'p2p-video-start', { id: o.id, type: 'video/mp4', size: 80_000_000 }, T.ada)).j.error, /50 MB/)
  assert.equal((await call('POST', 'p2p-video-start', { id: o.id, type: 'video/mp4', size: 1000 }, T.driver)).status, 404, 'not your order')
  assert.match((await call('POST', 'p2p-msg', { id: o.id, video: `${id.kemal}/p2p-${o.id}/0123456789abcdef.mp4` }, T.ada)).j.error, /not valid/, 'someone else\'s folder')
  assert.equal((await call('POST', 'p2p-msg', { id: o.id, video: `${id.ada}/p2p-${o.id}/0123456789abcdef.mp4`, private: true }, T.ada)).status, 200)
  const m = (await call('GET', `admin-p2p?id=${o.id}`, undefined, T.boss)).j.order.messages.at(-1)
  assert.equal(m.private, true)
})
