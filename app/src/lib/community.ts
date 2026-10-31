import type { PostMeta } from './posting'

export type EvCat = 'Worship' | 'Culture' | 'Sports' | 'Career' | 'Party' | 'Help'
export interface Ev extends PostMeta {
  id: string; title: string; cat: EvCat; city: string; place: string; start: number; durMin: number
  organiser: string; verifiedOrg: boolean; going: number; desc: string; emoji: string; weekly?: boolean; free: boolean; mine?: boolean
}

const MOSQUE: Record<string, string> = { lefkosa: 'Selimiye Mosque', magusa: 'Lala Mustafa Paşa Mosque', girne: 'Ağa Cafer Paşa Mosque' }

/** Next occurrence of weekday (0=Sun..6=Sat) at hh:mm. */
function next(dow: number, hh: number, mm = 0) {
  const d = new Date(); d.setHours(hh, mm, 0, 0)
  let add = (dow - d.getDay() + 7) % 7
  if (add === 0 && d.getTime() < Date.now()) add = 7
  d.setDate(d.getDate() + add)
  return d.getTime()
}

export function eventsFor(city: string, spot: string): Ev[] {
  const base = [
    { title: 'Sunday Service (English)', cat: 'Worship', place: 'International Gospel Fellowship hall', start: next(0, 10), durMin: 120, organiser: 'International Gospel Fellowship', verifiedOrg: true, going: 142, desc: 'Praise & worship, word, and fellowship lunch after. Everyone welcome.', emoji: '⛪', weekly: true },
    { title: "Jumu'ah (Friday prayer)", cat: 'Worship', place: MOSQUE[city] ?? 'Central Mosque', start: next(5, 12, 30), durMin: 60, organiser: 'Muslim Students Society', verifiedOrg: true, going: 96, desc: 'Khutbah with English summary afterwards. Sisters’ section available.', emoji: '🕌', weekly: true },
    { title: 'Messe en français', cat: 'Worship', place: 'Catholic chaplaincy hall', start: next(6, 18), durMin: 75, organiser: 'Francophone Catholic Community', verifiedOrg: true, going: 58, desc: 'Messe pour la communauté francophone (RDC, Cameroun, Congo…).', emoji: '✝️', weekly: true },
    { title: '5-a-side football', cat: 'Sports', place: `${spot.split('·')[0].trim()} pitches`, start: next(6, 10), durMin: 120, organiser: 'Africa United FC', verifiedOrg: false, going: 31, desc: 'Mixed levels. Bring water and ₺50 for pitch hire.', emoji: '⚽', weekly: true },
    { title: 'Nigerian Students Association meetup', cat: 'Culture', place: 'Student centre, room 2', start: next(6, 16), durMin: 150, organiser: 'NSA North Cyprus', verifiedOrg: true, going: 210, desc: 'Monthly general meeting, welfare updates and small chops 🇳🇬', emoji: '🇳🇬' },
    { title: 'Francophone community dinner', cat: 'Culture', place: 'Chez Mama Africa', start: next(0, 18), durMin: 180, organiser: 'Cameroon & Congo Associations', verifiedOrg: true, going: 64, desc: 'Ndolé, pondu, music and new-student welcome.', emoji: '🍲', free: false },
    { title: 'CV & interview workshop', cat: 'Career', place: 'Online + campus library', start: next(3, 18), durMin: 90, organiser: 'Luda Careers', verifiedOrg: true, going: 77, desc: 'Get your CV reviewed and practise interviews for local jobs.', emoji: '📝' },
    { title: 'Free residency Q&A clinic', cat: 'Help', place: 'International office', start: next(4, 17), durMin: 90, organiser: 'Luda Community', verifiedOrg: true, going: 53, desc: 'Ask anything about İkamet, health checks and renewals.', emoji: '🪪' },
    { title: 'Afrobeats & Amapiano night', cat: 'Party', place: 'Rooftop lounge', start: next(5, 22), durMin: 240, organiser: 'Vibes Collective', verifiedOrg: false, going: 188, desc: 'DJ lineup, 18+. Tickets at the door.', emoji: '🎶', free: false },
  ] as const
  return base.map((e, i) => ({ free: true, ...e, id: `ev-${city}-${i}`, city, status: 'live' as const })) as Ev[]
}
