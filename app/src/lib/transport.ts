import { CITIES } from './data'

export const ERCAN = { name: 'Ercan Airport (ECN)', lat: 35.1547, lon: 33.4961 }

export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, r = Math.PI / 180
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x)) * 1.25 // road factor
}

const TERMINAL: Record<string, string> = {
  lefkosa: 'Lefkoşa Bus Terminal', girne: 'Girne Bus Station', magusa: 'Gazimağusa Bus Terminal',
  guzelyurt: 'Güzelyurt Bus Stop (centre)', lefke: 'Lefke Bus Stop (centre)', iskele: 'İskele Bus Stop (centre)',
}
const BUSY = new Set(['lefkosa-girne', 'girne-lefkosa', 'lefkosa-magusa', 'magusa-lefkosa'])

/** Approximate intercity bus/dolmuş info. Fares & times are estimates for the demo. */
export function routesFrom(cityId: string) {
  const from = CITIES.find((c) => c.id === cityId)!
  return CITIES.filter((c) => c.id !== cityId).map((to) => {
    const d = km(from, to)
    return {
      to, km: Math.round(d), mins: Math.round((d / 55) * 60 + 10),
      fare: Math.round((25 + d * 1.6) / 5) * 5,
      every: BUSY.has(`${cityId}-${to.id}`) ? 'every 15–30 min' : 'every 30–60 min',
      from: TERMINAL[cityId], firstLast: BUSY.has(`${cityId}-${to.id}`) ? '06:30 – 23:00' : '07:00 – 19:00',
    }
  }).sort((a, b) => a.km - b.km)
}

export const taxiFare = (d: number) => Math.round((80 + d * 32) / 10) * 10
