// Nearby directory (v1.16.0). Real places from OpenStreetMap, fetched by the SERVER from Overpass and saved in
// places_cache per city + category (refreshed weekly). Phones only read the saved list, so Overpass throttling,
// slow mobile networks or blocked hosts never leave a student with an empty page. Data © OpenStreetMap contributors.

export const PLACE_CITIES: Record<string, { lat: number; lon: number; radius: number }> = {
  lefkosa: { lat: 35.1856, lon: 33.3823, radius: 7000 },
  girne: { lat: 35.3364, lon: 33.3199, radius: 7000 },
  magusa: { lat: 35.1251, lon: 33.9418, radius: 7000 },
  guzelyurt: { lat: 35.1981, lon: 32.9934, radius: 6000 },
  lefke: { lat: 35.1106, lon: 32.8487, radius: 6000 },
  iskele: { lat: 35.2867, lon: 33.8919, radius: 8000 },
}

/** Overpass selectors per category (several selectors = union). Keep the ids in sync with app lib/places.ts. */
export const PLACE_CATS: Record<string, string[]> = {
  food: ['nwr["amenity"~"^(restaurant|fast_food|cafe)$"]'],
  african: ['nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["cuisine"~"african|nigerian|ghanaian|ethiopian|eritrean|somali|senegalese|cameroonian|congolese|kenyan",i]',
    'nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"~"afri|naija|jollof|suya|mama put|lagos|abuja|accra|nairobi",i]',
    'nwr["shop"]["name"~"afri|naija|lagos|abuja|accra|nairobi",i]'],
  grocery: ['nwr["shop"~"^(supermarket|convenience|greengrocer|butcher|bakery|grocery)$"]'],
  pharmacy: ['nwr["amenity"="pharmacy"]', 'nwr["healthcare"="pharmacy"]'],
  health: ['nwr["amenity"~"^(hospital|clinic|doctors|dentist)$"]', 'nwr["healthcare"~"^(hospital|clinic|doctor|dentist)$"]'],
  money: ['nwr["amenity"~"^(bank|atm|bureau_de_change|money_transfer)$"]'],
  beauty: ['nwr["shop"~"^(hairdresser|beauty|cosmetics)$"]'],
  worship: ['nwr["amenity"="place_of_worship"]'],
}

export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

export interface PlaceOut {
  id: string; name: string; lat: number; lon: number; km: number
  phone?: string; cuisine?: string; hours?: string; kind: string; website?: string; religion?: string
}

function km(a: number, b: number, c: number, d: number) {
  const R = 6371, r = Math.PI / 180
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

const clean = (v: unknown, n = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
const safeUrl = (v: unknown) => { const s = clean(v, 300); if (!s) return undefined; const u = /^https?:\/\//i.test(s) ? s : `https://${s}`; try { return new URL(u).protocol.startsWith('http') ? u : undefined } catch { return undefined } }

export function overpassQuery(city: string, cat: string) {
  const c = PLACE_CITIES[city], sel = PLACE_CATS[cat]
  return `[out:json][timeout:60];(${sel.map((s) => `${s}(around:${c.radius},${c.lat},${c.lon});`).join('')});out center 150;`
}

// deno-lint-ignore no-explicit-any
export function parseOverpass(city: string, j: any): PlaceOut[] {
  const c = PLACE_CITIES[city]
  const seen = new Set<string>()
  const out: PlaceOut[] = []
  for (const e of (j?.elements ?? []) as any[]) {
    const tg = e.tags ?? {}
    const name = clean(tg['name:en'] ?? tg.name)
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon
    if (!name || typeof la !== 'number' || typeof lo !== 'number') continue
    const id = `${e.type}/${e.id}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id, name, lat: la, lon: lo, km: Math.round(km(c.lat, c.lon, la, lo) * 10) / 10,
      phone: clean(tg.phone ?? tg['contact:phone'] ?? tg['contact:mobile'] ?? tg.mobile, 60),
      cuisine: clean(tg.cuisine)?.replace(/;/g, ', ').replace(/_/g, ' '),
      hours: clean(tg.opening_hours),
      kind: (clean(tg.healthcare) ?? clean(tg.amenity) ?? clean(tg.shop) ?? '').replace(/_/g, ' '),
      website: safeUrl(tg.website ?? tg['contact:website']),
      religion: clean(tg.religion, 30),
    })
  }
  return out.sort((a, b) => a.km - b.km).slice(0, 150)
}
