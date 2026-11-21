// v1.28.1: the live database (PostgREST) answers SQL functions that return nothing with an EMPTY body (204).
// That used to crash Luda HQ 'Mark as paid' after the PIN with 'Unexpected end of JSON input'.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { restDb } from '../functions/_shared/db.ts'

test('database functions that return nothing (empty 204 reply) no longer crash; normal replies still parse', async () => {
  const f = (async (url: string) => {
    if (url.endsWith('/rpc/luda_payout_paid_info')) return new Response(null, { status: 204 })
    if (url.endsWith('/rpc/luda_withdraw_note')) return new Response('', { status: 200 })
    return new Response(JSON.stringify({ ok: true, n: 3 }), { status: 200 })
  }) as typeof fetch
  const db = restDb('https://proj.supabase.co', 'sb_secret_x', f)
  assert.equal(await db.fn('luda_payout_paid_info', { p_ref: 'x', p_staff: 'rynoh', p_receipt: ['a'] }), null)
  assert.equal(await db.fn('luda_withdraw_note', { p_ref: 'x', p_note: 'y' }), null)
  assert.deepEqual(await db.fn('luda_anything', {}), { ok: true, n: 3 })
})

test('when the database API is stuck (555/503/timeout) the server wakes it once and retries safe reads', async () => {
  let calls = 0, heals = 0
  const f = (async (url: string) => {
    calls++
    if (calls === 1) return new Response('timeout', { status: 555 })
    return new Response(JSON.stringify([{ user_id: 'u1', username: 'ada' }]), { status: 200 })
  }) as typeof fetch
  const db = restDb('https://proj.supabase.co', 'sb_secret_x', f, async () => { heals++ })
  const p = await db.profile('u1')
  assert.equal(p?.username, 'ada', 'read retried after waking the API')
  assert.equal(heals, 1)
  // a money call is never sent twice: it fails with a clear 'busy' error instead
  const g = (async () => new Response('timeout', { status: 555 })) as typeof fetch
  const db2 = restDb('https://proj.supabase.co', 'sb_secret_x', g, async () => { heals++ })
  await assert.rejects(db2.fn('luda_post', {}), /Database busy \(555\)/)
})
