// Loads the Nearby directory: fetches real OpenStreetMap places (Overpass) for every Luda city + category and
// saves them in the live places_cache through the Supabase Management API (SQL luda_places_put). Run by
// .github/workflows/places.yml (weekly + on demand). Read-only towards OpenStreetMap; one request at a time.
//   SUPABASE_ACCESS_TOKEN=… REF=… node --experimental-strip-types supabase/scripts/load-places.ts
import { OVERPASS_MIRRORS, PLACE_CATS, PLACE_CITIES, overpassQuery, parseOverpass } from '../functions/_shared/places.ts'

const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.REF
if (!token || !ref) { console.error('SUPABASE_ACCESS_TOKEN and REF are required'); process.exit(1) }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function sql(query: string) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }),
    })
    if (r.ok) return r.json()
    const t = await r.text()
    if (r.status !== 429) throw new Error(`SQL ${r.status}: ${t.slice(0, 200)}`)
    await sleep(3000 * (i + 1))
  }
  throw new Error('SQL rate limited')
}

async function overpass(city: string, cat: string) {
  const errs: string[] = []
  for (let round = 0; round < 2; round++) {
    for (const m of OVERPASS_MIRRORS) {
      try {
        const r = await fetch(m, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Luda/1.0 (student city directory; github.com/timirynoh)' },
          body: new URLSearchParams({ data: overpassQuery(city, cat) }).toString(), signal: AbortSignal.timeout(60000) })
        if (r.ok) return parseOverpass(city, await r.json())
        errs.push(`${new URL(m).host} ${r.status}`)
      } catch (e) { errs.push(`${new URL(m).host} ${(e as Error).name}`) }
      await sleep(3000)
    }
    await sleep(15000)
  }
  throw new Error(errs.join(', '))
}

// Skip lists saved in the last 6 days, so a rerun continues where a slow run stopped.
const fresh = new Set(((await sql(`select city || '/' || cat k from places_cache where fetched_at > now() - interval '6 days'`)) as { k: string }[]).map((r) => r.k))
let ok = 0, failed = 0
for (const city of Object.keys(PLACE_CITIES)) {
  for (const cat of Object.keys(PLACE_CATS)) {
    if (fresh.has(`${city}/${cat}`) && !process.env.FORCE) { console.log(`${city} / ${cat}: already saved this week`); ok++; continue }
    try {
      const places = await overpass(city, cat)
      const json = JSON.stringify({ items: places }).replace(/'/g, "''")
      await sql(`select luda_places_put('${city}', '${cat}', '${json}'::jsonb)`)
      console.log(`${city} / ${cat}: ${places.length} places saved${places[0] ? ` (e.g. ${places.slice(0, 3).map((p) => p.name).join(', ')})` : ''}`)
      ok++
    } catch (e) { console.log(`${city} / ${cat}: FAILED ${(e as Error).message}`); failed++ }
    await sleep(2500)
  }
}
console.log(`\nDone: ${ok} saved, ${failed} failed`)
if (!ok) process.exit(1)
