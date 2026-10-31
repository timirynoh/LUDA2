/** Flash help: quick "I need someone to fix/do X" requests, paid safely through escrow. */
export type FlashCat = 'Appliance' | 'Plumbing' | 'Electrical' | 'Phone & laptop' | 'Cleaning' | 'Moving' | 'Hair & beauty' | 'Tutoring' | 'Other'
export type FlashStatus = 'open' | 'escrow' | 'cash' | 'done' | 'cancelled' | 'disputed'

export interface Offer { id: string; fixer: string; flag: string; rating: number; jobs: number; price: number; eta: string; note: string; verified: boolean; at: number }
export interface FlashReq {
  id: string; text: string; cat: FlashCat; emoji: string; city: string; area: string; budget?: number; urgent: boolean
  from: string; flag: string; ts: number; mine?: boolean; offers: Offer[]; status: FlashStatus; accepted?: string; rating?: number
}
/** A job I (as a fixer) offered to do. */
export interface MyGig { reqId: string; text: string; emoji: string; from: string; price: number; eta: string; status: 'sent' | 'accepted' | 'done' | 'paid'; at: number }

export const FLASH_CATS: [FlashCat, string, RegExp][] = [
  ['Appliance', '🧺', /washing|machine|fridge|freezer|oven|microwave|cooker|ac\b|air ?con|heater|boiler|kettle|iron/],
  ['Plumbing', '🚰', /pipe|leak|tap|sink|toilet|drain|shower|water heater|plumb/],
  ['Electrical', '💡', /electric|socket|light|bulb|wiring|fuse|switch|power/],
  ['Phone & laptop', '📱', /phone|screen|laptop|computer|pc\b|charger|iphone|samsung|tablet|wifi|router/],
  ['Cleaning', '🧹', /clean|wash my|laundry|tidy/],
  ['Moving', '📦', /move|moving|carry|transport|van|pick ?up|deliver/],
  ['Hair & beauty', '💇🏾', /hair|braid|barber|nails|makeup|lashes/],
  ['Tutoring', '📚', /tutor|teach|lesson|exam|math|assignment|turkish class/],
]
export const detectCat = (text: string): [FlashCat, string] => {
  const t = text.toLowerCase()
  const hit = FLASH_CATS.find(([, , re]) => re.test(t))
  return hit ? [hit[0], hit[1]] : ['Other', '⚡']
}

const FIXERS: [string, string, number, number, boolean][] = [
  ['Mehmet (Usta)', '🇹🇷', 4.9, 212, true], ['Kwabena', '🇬🇭', 4.8, 87, true], ['Joseph', '🇳🇬', 4.7, 54, true],
  ['Tafadzwa', '🇿🇼', 4.6, 31, false], ['Aylin', '🇹🇷', 4.9, 140, true], ['Patrice', '🇨🇲', 4.5, 19, false],
]
const hash = (s: string) => s.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11)

/** Demo: fixers nearby respond to a new request with quotes. */
export function demoOffers(req: Pick<FlashReq, 'id' | 'text' | 'budget' | 'cat'>): Offer[] {
  const h = hash(req.id + req.text)
  const base = req.budget || ({ Appliance: 600, Plumbing: 450, Electrical: 400, 'Phone & laptop': 700, Cleaning: 500, Moving: 800, 'Hair & beauty': 600, Tutoring: 350, Other: 400 } as Record<FlashCat, number>)[req.cat]
  return [0, 1, 2].map((i) => {
    const [fixer, flag, rating, jobs, verified] = FIXERS[(h + i * 2) % FIXERS.length]
    return {
      id: `${req.id}-o${i}`, fixer, flag, rating, jobs, verified, at: Date.now() + i * 2500,
      price: Math.round((base * (0.85 + ((h >> i) % 30) / 100)) / 10) * 10,
      eta: ['20 min', '45 min', 'Today 6pm', 'Tomorrow 10am'][(h + i) % 4],
      note: ['I fix these every day, I bring my own tools.', 'Can come right away. Payment after the job via Luda.', 'Experienced, I can also check other issues free.'][i],
    }
  })
}

/** Requests from other people nearby (so you can also be the fixer). */
export function nearbyRequests(city: string, areas: string[]): FlashReq[] {
  const now = Date.now()
  const rows: [string, string, string, number | undefined, boolean, number][] = [
    ['Washing machine not spinning, water stays inside', 'Amara', '🇳🇬', 500, true, 6],
    ['Kitchen tap leaking all night 😩', 'Tendai', '🇿🇼', 400, true, 14],
    ['Need someone to braid knotless tomorrow', 'Grâce', '🇨🇩', 900, false, 35],
    ['Help moving a fridge + bed to new flat Saturday', 'Kofi', '🇬🇭', 1000, false, 52],
    ['Laptop screen cracked, need replacement', 'Wanjiru', '🇰🇪', undefined, false, 90],
    ['Socket in bedroom sparks, need electrician', 'Ibrahim', '🇸🇩', 450, true, 120],
  ]
  return rows.map(([text, from, flag, budget, urgent, mins], i) => {
    const [cat, emoji] = detectCat(text)
    return { id: `fl-${city}-${i}`, text, cat, emoji, city, area: areas[i % areas.length], budget, urgent, from, flag, ts: now - mins * 60_000, offers: [], status: 'open' as const }
  })
}

export const FLASH_TTL = 24 * 3_600_000
export const ago = (ts: number) => { const m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago` }
