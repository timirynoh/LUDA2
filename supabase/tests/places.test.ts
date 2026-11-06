// v1.16.0: Nearby directory comes from the server (OpenStreetMap via Overpass), saved per city + category.
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { handleApi, type Deps } from '../functions/_shared/handlers.ts'
import { ENV, fakeWorld, makeDb } from './harness.ts'

let d: Deps, q: Awaited<ReturnType<typeof makeDb>>['q'], world: ReturnType<typeof fakeWorld>['world']
let ipN = 0
async function call(route: string) {
  const r = await handleApi(new Request(`https://proj.supabase.co/functions/v1/api/${route}`, {
    method: 'GET', headers: { origin: 'https://luda.test', 'x-forwarded-for': `10.9.0.${++ipN}` },
  }), ENV as any, d)
  return { status: r.status, j: (await r.json()) as any }
}

before(async () => {
  const m = await makeDb(); q = m.q
  const fw = fakeWorld(m.q); world = fw.world
  d = { db: m.db, fetch: fw.f, now: () => new Date() }
})

test('places: fetched once from OpenStreetMap, saved, served from the server; only known cities/categories', async () => {
  assert.equal((await call('places?city=paris&cat=pharmacy')).status, 400)
  assert.equal((await call('places?city=lefkosa&cat=nightclub')).status, 400)
  const a = await call('places?city=lefkosa&cat=pharmacy')
  assert.equal(a.status, 200)
  assert.deepEqual(a.j.places.map((p: any) => p.name), ['Gönyeli Eczanesi', 'Near East Pharmacy']) // unnamed place dropped, nearest first
  assert.equal(a.j.places[1].website, 'https://neu.edu.tr')
  assert.equal(a.j.places[0].phone, '+90 392 223 0000')
  const n = world.calls.filter((c) => c.startsWith('overpass')).length
  const b = await call('places?city=lefkosa&cat=pharmacy')
  assert.equal(b.j.places.length, 2)
  assert.equal(world.calls.filter((c) => c.startsWith('overpass')).length, n, 'second read comes from the saved copy')
  // A week later Overpass is down: the saved copy is still served
  await q(`update places_cache set fetched_at = now() - interval '15 days'`)
  world.overpassDown = true
  const c = await call('places?city=lefkosa&cat=pharmacy')
  assert.equal(c.status, 200); assert.equal(c.j.places.length, 2)
  // Nothing saved and Overpass down: a clear "try again" (the app shows Retry, never sample places)
  const e = await call('places?city=girne&cat=beauty')
  assert.equal(e.status, 503)
  world.overpassDown = false
})
