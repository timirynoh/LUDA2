import { OVERPASS_API } from '../config'

export interface Place {
  id: string; name: string; lat: number; lon: number; km: number
  phone?: string; cuisine?: string; hours?: string; kind: string; website?: string; sample?: boolean
}

export const CATEGORIES = [
  { id: 'food', label: 'Food', emoji: '🍽️', q: 'nwr["amenity"~"^(restaurant|fast_food|cafe)$"]' },
  { id: 'african', label: 'African taste', emoji: '🍲', q: 'nwr["cuisine"~"african|nigerian|ghanaian|ethiopian|eritrean|somali|senegalese|cameroonian",i]' },
  { id: 'grocery', label: 'Groceries', emoji: '🛒', q: 'nwr["shop"~"^(supermarket|convenience|greengrocer|butcher)$"]' },
  { id: 'pharmacy', label: 'Pharmacy', emoji: '💊', q: 'nwr["amenity"="pharmacy"]' },
  { id: 'health', label: 'Clinics', emoji: '🏥', q: 'nwr["amenity"~"^(hospital|clinic|doctors)$"]' },
  { id: 'money', label: 'Money', emoji: '🏦', q: 'nwr["amenity"~"^(bank|atm|bureau_de_change)$"]' },
  { id: 'beauty', label: 'Hair & beauty', emoji: '💇🏾', q: 'nwr["shop"~"^(hairdresser|beauty)$"]' },
  { id: 'worship', label: 'Worship', emoji: '⛪', q: 'nwr["amenity"="place_of_worship"]' },
]

function km(a: number, b: number, c: number, d: number) {
  const R = 6371, r = Math.PI / 180
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

const cache = new Map<string, Place[]>()

/** Live city directory from OpenStreetMap (open data, no scraping of private sites needed). */
export async function findPlaces(cat: string, lat: number, lon: number, radius = 5000): Promise<Place[]> {
  const key = `${cat}:${lat.toFixed(3)}:${lon.toFixed(3)}`
  if (cache.has(key)) return cache.get(key)!
  const c = CATEGORIES.find((x) => x.id === cat)!
  const query = `[out:json][timeout:20];${c.q}(around:${radius},${lat},${lon});out center 80;`
  const ctl = new AbortController()
  const to = setTimeout(() => ctl.abort(), 15000)
  const r = await fetch(OVERPASS_API, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctl.signal })
  clearTimeout(to)
  if (!r.ok) throw new Error(`Overpass ${r.status}`)
  const j = await r.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Place[] = (j.elements as any[])
    .filter((e) => e.tags?.name)
    .map((e) => {
      const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon, tg = e.tags
      return {
        id: `${e.type}/${e.id}`, name: tg['name:en'] ?? tg.name, lat: la, lon: lo, km: km(lat, lon, la, lo),
        phone: tg.phone ?? tg['contact:phone'] ?? tg['contact:mobile'], cuisine: tg.cuisine?.replace(/;/g, ', ').replace(/_/g, ' '),
        hours: tg.opening_hours, kind: (tg.amenity ?? tg.shop ?? '').replace(/_/g, ' '), website: tg.website ?? tg['contact:website'],
      }
    })
    .sort((a, b) => a.km - b.km)
  cache.set(key, out)
  return out
}

/** Shown only when the live directory can't be reached. Clearly marked as samples. */
export function samplePlaces(cat: string, lat: number, lon: number): Place[] {
  const names: Record<string, string[]> = {
    food: ['Harbour Grill', 'Campus Kebab House', 'Olive Tree Café', 'Midnight Burger'],
    african: ['Mama Put Kitchen', 'Jollof Corner', 'Suya Spot'],
    grocery: ['City Market', 'Mini Market 24', 'Fresh Greens'],
    pharmacy: ['Central Pharmacy', 'Duty Pharmacy'], health: ['State Hospital', 'Family Clinic'],
    money: ['Bank ATM', 'Exchange Office'], beauty: ['Braids & Locs Studio', 'Fade Masters Barber'], worship: ['Community Church', 'Central Mosque'],
  }
  return (names[cat] ?? []).map((n, i) => ({ id: `s${i}`, name: n, lat: lat + i * 0.002, lon: lon + i * 0.002, km: 0.4 + i * 0.6, kind: cat, sample: true }))
}
