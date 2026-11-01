export type GroupCat = 'Country' | 'Campus' | 'Faith' | 'Housing' | 'Jobs' | 'Sports' | 'Buy & Sell' | 'Help'

export interface Group {
  id: string; name: string; emoji: string; tone: string; cat: GroupCat; desc: string
  members: number; online: number; official?: boolean; verified?: boolean; city?: string; mine?: boolean; createdAt?: number
  rules: string[]
}

export interface Msg {
  id: string; gid: string; from: string; flag: string; text: string; ts: number
  voice?: string; dur?: number
  mine?: boolean; reactions?: Record<string, number>; myReaction?: string; replyTo?: { from: string; text: string }; system?: boolean
}

export const BASE_RULES = ['Be respectful: no insults, hate or bullying', 'No scams: never ask for money, codes or PINs', 'No spam or repeated adverts', 'Keep personal info private']

export const GROUPS: Group[] = [
  { id: 'g-naija', name: 'Naija in North Cyprus', emoji: '🇳🇬', tone: 'from-emerald-500 to-green-800', cat: 'Country', desc: 'Nigerians helping Nigerians: news, tips, hangouts.', members: 4821, online: 312, verified: true, rules: BASE_RULES },
  { id: 'g-francophone', name: 'Francophones KKTC', emoji: '🇨🇩', tone: 'from-sky-500 to-blue-800', cat: 'Country', desc: 'RDC, Cameroun, Congo, Côte d’Ivoire… on s’entraide !', members: 2104, online: 141, verified: true, rules: BASE_RULES },
  { id: 'g-zim', name: 'Zimbos & Southern Africa', emoji: '🇿🇼', tone: 'from-amber-500 to-red-800', cat: 'Country', desc: 'Zimbabwe, Zambia, SA & friends.', members: 1288, online: 77, verified: true, rules: BASE_RULES },
  { id: 'g-eastafrica', name: 'East Africa Connect', emoji: '🇰🇪', tone: 'from-red-500 to-emerald-800', cat: 'Country', desc: 'Kenya, Uganda, Tanzania, Rwanda: karibu!', members: 903, online: 58, rules: BASE_RULES },
  { id: 'g-houses', name: 'Rooms & Roommates', emoji: '🏠', tone: 'from-amber-400 to-orange-700', cat: 'Housing', desc: 'Find rooms, flatmates and moving help. Use Luda Housing for verified listings.', members: 3560, online: 205, official: true, rules: [...BASE_RULES, 'Post houses in Luda Housing, not just in chat'] },
  { id: 'g-jobs', name: 'Jobs & Quick Gigs', emoji: '💼', tone: 'from-lime-400 to-green-700', cat: 'Jobs', desc: 'Urgent jobs and side gigs. Never pay to get a job.', members: 2877, online: 166, official: true, rules: [...BASE_RULES, 'Never pay to get a job'] },
  { id: 'g-neu', name: 'NEU International Students', emoji: '🎓', tone: 'from-indigo-500 to-blue-800', cat: 'Campus', desc: 'Near East University: classes, exams, events.', members: 1940, online: 120, city: 'lefkosa', rules: BASE_RULES },
  { id: 'g-emu', name: 'EMU Africa Society', emoji: '🎓', tone: 'from-violet-500 to-indigo-800', cat: 'Campus', desc: 'Eastern Mediterranean University African students.', members: 1612, online: 96, city: 'magusa', rules: BASE_RULES },
  { id: 'g-church', name: 'Christian Fellowship', emoji: '⛪', tone: 'from-rose-400 to-pink-800', cat: 'Faith', desc: 'Prayer requests, service times, fellowship.', members: 1150, online: 64, verified: true, rules: BASE_RULES },
  { id: 'g-muslim', name: 'Muslim Students Society', emoji: '🕌', tone: 'from-teal-400 to-emerald-800', cat: 'Faith', desc: 'Jumu’ah, Ramadan and community support.', members: 980, online: 51, verified: true, rules: BASE_RULES },
  { id: 'g-ball', name: 'Saturday Football ⚽', emoji: '⚽', tone: 'from-green-400 to-emerald-800', cat: 'Sports', desc: 'Weekly 5-a-side. All levels welcome.', members: 344, online: 22, rules: BASE_RULES },
  { id: 'g-market', name: 'Buy & Sell Student Stuff', emoji: '🛒', tone: 'from-fuchsia-500 to-purple-800', cat: 'Buy & Sell', desc: 'Furniture, phones, books. Meet in public places.', members: 2210, online: 133, rules: [...BASE_RULES, 'Meet in public, never pay before you see the item'] },
  { id: 'g-help', name: 'Ask Luda: Residency & Help', emoji: '🪪', tone: 'from-cyan-400 to-sky-800', cat: 'Help', desc: 'Questions about İkamet, health checks, banks, SIM cards.', members: 5120, online: 288, official: true, rules: BASE_RULES },
]

const PEOPLE: [string, string][] = [['Chidi', '🇳🇬'], ['Amara', '🇳🇬'], ['Tendai', '🇿🇼'], ['Kofi', '🇬🇭'], ['Mireille', '🇨🇲'], ['Wanjiru', '🇰🇪'], ['Grâce', '🇨🇩'], ['Tolu', '🇳🇬'], ['Ibrahim', '🇸🇩'], ['Esther', '🇬🇭']]

const SEED: Record<string, string[]> = {
  'g-naija': ['Good morning family 🌞', 'Anyone knows where to buy ponmo in Lefkoşa?', 'Try the African shop near the bus terminal', 'Thanks bro 🙏', 'Who dey go Saturday football?'],
  'g-francophone': ['Bonjour à tous !', 'Quelqu’un a un bon plan pour changer des euros ?', 'Utilise SafeSwap sur Luda, c’est sécurisé 👌', 'Merci beaucoup', 'La messe en français est samedi 18h'],
  'g-houses': ['Room available in Gönyeli from next month, posted on Luda Housing', 'Looking for a roommate near EMU, budget £200', 'DM me, I have a 2+1 to share', 'Always view before paying any deposit!'],
  'g-jobs': ['⚡ 2 workers needed for construction in Girne tomorrow 7am', 'Café on Dereboyu hiring baristas, apply in Luda Jobs', 'Anyone doing delivery with QuickBite? How is it?', 'Pay is weekly, it’s fine'],
  'g-help': ['How long does the İkamet health check take?', 'About 2 hours, go early in the morning', 'Do I need an appointment for the bank account?', 'Yes, bring passport + student certificate'],
}
const GENERIC = ['Hello everyone 👋', 'Welcome to the new members!', 'Any updates for this week?', 'Thanks for sharing 🙏', 'See you all there']

const hash = (s: string) => s.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 3)

export function seedMessages(gid: string): Msg[] {
  const lines = SEED[gid] ?? GENERIC
  const h = hash(gid), now = Date.now()
  return lines.map((text, i) => {
    const [from, flag] = PEOPLE[(h + i * 3) % PEOPLE.length]
    return { id: `${gid}-s${i}`, gid, from, flag, text, ts: now - (lines.length - i) * 7 * 60_000 - 3_600_000, reactions: i % 2 ? { '👍': 1 + ((h + i) % 9) } : undefined }
  })
}

/** Demo only: someone in the group answers so the room feels alive. */
export function demoReply(gid: string, text: string): Pick<Msg, 'from' | 'flag' | 'text'> {
  const t = text.toLowerCase()
  const [from, flag] = PEOPLE[(hash(text) + gid.length) % PEOPLE.length]
  const pick = (a: string[]) => a[hash(text) % a.length]
  if (/\b(hi|hello|hey|bonjour|salut|habari|selam)\b/.test(t)) return { from, flag, text: pick(['Welcome! 👋', 'Hey! Good to have you here 😊', 'Karibu! 🙌']) }
  if (/room|house|flat|rent|roommate/.test(t)) return { from, flag, text: 'Check Luda Housing: listings there are verified 🏠' }
  if (/job|work|gig|hiring/.test(t)) return { from, flag, text: 'There are new quick jobs in the Jobs tab today 💼' }
  if (/money|exchange|naira|dollar|lira|euro/.test(t)) return { from, flag, text: 'Use SafeSwap in Exchange: escrow protects you 🔒' }
  if (/\?$/.test(t.trim())) return { from, flag, text: pick(['Good question, I’d ask the international office too', 'I had the same question last month!', 'Someone here should know 🙏']) }
  return { from, flag, text: pick(['😂😂', 'True talk 💯', 'Amen 🙏', 'Nice one!', 'Facts']) }
}

export const NAME_COLORS = ['text-emerald-300', 'text-sky-300', 'text-amber-300', 'text-fuchsia-300', 'text-rose-300', 'text-cyan-300', 'text-lime-300', 'text-violet-300']
export const colorFor = (name: string) => NAME_COLORS[hash(name) % NAME_COLORS.length]
