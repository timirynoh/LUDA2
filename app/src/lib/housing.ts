/** Demo housing data. Prices are illustrative monthly rents in GBP (common in North Cyprus). */
import type { PostMeta } from './posting'

export type HomeType = 'Room' | 'Studio' | '1+1' | '2+1' | 'Dorm'

export interface Listing extends PostMeta {
  id: string; title: string; type: HomeType; city: string; area: string
  price: number; deposit: number; furnished: boolean; bills: boolean; uni?: string
  beds: number; baths: number; landlord: string; verified: boolean; rating: number; reviews: number
  posted: number; emoji: string; tone: string; mine?: boolean; photos?: number
}

export interface Roommate {
  id: string; name: string; flag: string; uni: string; budget: number; moveIn: string; tags: string[]; bio: string; match: number
}

export const AREAS: Record<string, string[]> = {
  lefkosa: ['Gönyeli', 'Hamitköy', 'Kumsal', 'Ortaköy', 'Yenikent', 'Dereboyu'],
  girne: ['Alsancak', 'Karaoğlanoğlu', 'Doğanköy', 'Lapta', 'Zeytinlik', 'Center'],
  magusa: ['Sakarya', 'Karakol', 'Çanakkale', 'Tuzla', 'Baykal', 'Center'],
  guzelyurt: ['Center', 'Kalkanlı', 'Bostancı'],
  lefke: ['Gemikonağı', 'Cengizköy', 'Center'],
  iskele: ['Long Beach', 'Boğaz', 'Center'],
}

const UNIS: Record<string, string> = {
  lefkosa: 'Near East University', girne: 'Girne American University', magusa: 'Eastern Mediterranean University',
  guzelyurt: 'METU NCC', lefke: 'European University of Lefke', iskele: 'Cyprus Science University',
}

const TYPES: { type: HomeType; range: [number, number]; beds: number; emoji: string; tone: string }[] = [
  { type: 'Room', range: [150, 260], beds: 1, emoji: '🛏️', tone: 'from-sky-500 to-indigo-700' },
  { type: 'Studio', range: [250, 400], beds: 1, emoji: '🏢', tone: 'from-emerald-500 to-teal-800' },
  { type: '1+1', range: [300, 460], beds: 1, emoji: '🏠', tone: 'from-amber-500 to-orange-800' },
  { type: '2+1', range: [400, 680], beds: 2, emoji: '🏡', tone: 'from-fuchsia-500 to-purple-800' },
  { type: 'Dorm', range: [120, 210], beds: 1, emoji: '🎓', tone: 'from-rose-500 to-pink-800' },
]
const LANDLORDS = ['Mehmet K.', 'Ayşe D.', 'Hasan T.', 'Emine S.', 'Ali R.', 'Zeynep Ö.', 'Mustafa B.', 'Fatma Y.']
const ADJ = ['Bright', 'Cosy', 'Modern', 'Quiet', 'Spacious', 'Sunny', 'Renovated', 'Garden']

function rng(seed: number) { return () => ((seed = (seed * 9301 + 49297) % 233280) / 233280) }

export function listingsFor(city: string): Listing[] {
  const r = rng(city.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
  const areas = AREAS[city] ?? AREAS.lefkosa
  return Array.from({ length: 10 }, (_, i) => {
    const t = TYPES[i % TYPES.length]
    const price = Math.round((t.range[0] + r() * (t.range[1] - t.range[0])) / 5) * 5
    const area = areas[Math.floor(r() * areas.length)]
    const nearUni = r() > 0.4
    return {
      id: `${city}-${i}`, type: t.type, city, area, price,
      title: `${ADJ[Math.floor(r() * ADJ.length)]} ${t.type === 'Room' ? 'room in shared flat' : t.type === 'Dorm' ? 'dorm bed' : t.type + ' apartment'}`,
      deposit: t.type === 'Dorm' ? 1 : r() > 0.5 ? 2 : 1, furnished: r() > 0.2, bills: t.type === 'Dorm' || r() > 0.6,
      uni: nearUni ? UNIS[city] : undefined, beds: t.beds, baths: t.type === '2+1' && r() > 0.5 ? 2 : 1,
      landlord: LANDLORDS[Math.floor(r() * LANDLORDS.length)], verified: r() > 0.25, rating: +(3.9 + r() * 1.1).toFixed(1),
      reviews: 3 + Math.floor(r() * 60), posted: 1 + Math.floor(r() * 14), emoji: t.emoji, tone: t.tone,
    }
  })
}

const PEOPLE: [string, string][] = [
  ['Chioma E.', '🇳🇬'], ['Brian O.', '🇰🇪'], ['Tatenda S.', '🇿🇼'], ['Esther A.', '🇬🇭'], ['Patrick N.', '🇨🇲'],
  ['Grâce M.', '🇨🇩'], ['Ibrahim A.', '🇸🇩'], ['Tunde B.', '🇳🇬'], ['Mutinta C.', '🇿🇲'], ['Joseph K.', '🇺🇬'],
]
const TAGS = ['Non-smoker', 'Quiet', 'Night owl', 'Early riser', 'Cooks a lot', 'Gym', 'Neat', 'Plays music', 'Pet-friendly', 'Studies at home']

export function roommatesFor(city: string): Roommate[] {
  const r = rng(city.length * 131 + 7)
  return PEOPLE.map(([name, flag], i) => {
    const tags = [...TAGS].sort(() => r() - 0.5).slice(0, 3)
    return {
      id: `rm-${city}-${i}`, name, flag, uni: UNIS[city] ?? UNIS.lefkosa, budget: 150 + Math.round(r() * 30) * 5,
      moveIn: ['ASAP', 'Next month', 'Next semester'][Math.floor(r() * 3)], tags, match: 60 + Math.floor(r() * 39),
      bio: ['Final-year student, looking for a calm place close to campus.', 'Easy-going, I cook jollof on Sundays 😄', 'Engineering student, tidy and respectful.', 'Looking to split a 2+1 near the main road.', 'Nursing student with early shifts.'][i % 5],
    }
  }).sort((a, b) => b.match - a.match)
}

export const REVIEWS = [
  ['Grace O. 🇳🇬', 5, 'Landlord fixed the AC the same day. Deposit returned in full.'],
  ['Kwame A. 🇬🇭', 4, 'Good location, a bit noisy on weekends. Fair landlord.'],
  ['Ruth M. 🇿🇼', 5, 'Felt safe and welcome. Water heater works well in winter.'],
] as const
