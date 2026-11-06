/** People directory, reviews and public profiles (demo data + your own reviews). */
export interface Review { id: string; about: string; by: string; stars: number; text: string; tags: string[]; ts: number; context: string }
export interface Person { name: string; username: string; flag: string; city: string; roles: ('fixer' | 'exchanger' | 'seller' | 'member')[]; verified: boolean; kyc: boolean; joined: string; skills: string[]; jobs: number; trades: number; response: string; rating: number; reviews: number; gallery: string[] }

const hash = (s: string) => s.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17)
const FLAGS: Record<string, string> = { Chidi: '🇳🇬', Amara: '🇳🇬', Emeka: '🇳🇬', Tolu: '🇳🇬', Joseph: '🇳🇬', Tendai: '🇿🇼', Rudo: '🇿🇼', Tafadzwa: '🇿🇼', Kofi: '🇬🇭', Kwabena: '🇬🇭', Mireille: '🇨🇲', Patrice: '🇨🇲', Wanjiru: '🇰🇪', Fatima: '🇸🇩', 'Jean-Paul': '🇨🇩', Grâce: '🇨🇩', Mehmet: '🇹🇷', Aylin: '🇹🇷' }
export const DIRECTORY = ['Chidi O.', 'Amara N.', 'Tendai M.', 'Kofi A.', 'Mireille K.', 'Emeka U.', 'Wanjiru K.', 'Fatima B.', 'Jean-Paul M.', 'Tolu A.', 'Rudo C.', 'Mehmet (Usta)', 'Kwabena', 'Joseph', 'Tafadzwa', 'Aylin', 'Patrice']

export const usernameOf = (name: string) => name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '').slice(0, 12) || 'user'

export function personOf(name: string): Person {
  const h = hash(name), first = name.split(/[ (]/)[0]
  const fixer = /Usta|Kwabena|Joseph|Tafadzwa|Aylin|Patrice/.test(name)
  const skills = fixer ? [['Plumbing', 'Appliances', 'Electrical'], ['Phones & laptops', 'Wi-Fi setup'], ['Moving', 'Furniture assembly'], ['Cleaning', 'Painting'], ['Hair & braids', 'Make-up']][h % 5] : []
  return {
    name, username: usernameOf(name), flag: FLAGS[first] ?? '🌍', city: ['Lefkoşa', 'Girne', 'Gazimağusa'][h % 3],
    roles: fixer ? ['fixer', 'member'] : ['exchanger', 'seller', 'member'], verified: h % 7 !== 0, kyc: h % 5 !== 0,
    joined: `${['Jan', 'Mar', 'May', 'Aug', 'Oct'][h % 5]} 202${4 + (h % 2)}`, skills, jobs: fixer ? 20 + (h % 200) : 0, trades: fixer ? 0 : 15 + (h % 380),
    response: ['~2 min', '~5 min', '~12 min', '~30 min'][h % 4], rating: +(4.4 + (h % 60) / 100).toFixed(2), reviews: 8 + (h % 120),
    gallery: fixer ? ['🚰', '🧺', '💡', '🔧', '📦', '🧹'].slice(h % 3, (h % 3) + 4) : [],
  }
}

export const SAMPLE_REVIEWS = [
  ['Grace O.', 5, 'On time, friendly and the rate was exactly as posted.', ['On time', 'Fair price']],
  ['Kwame A.', 5, 'Very professional. Would use again 🙏', ['Professional']],
  ['Ruth M.', 4, 'Good job, came a bit late but communicated.', ['Good communication']],
] as const

export const REVIEW_TAGS = ['On time', 'Fair price', 'Friendly', 'Professional', 'Good communication', 'Would recommend']
