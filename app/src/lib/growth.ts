/** Referrals, ambassadors, deals, welcome pack, daily spin, news & challenges. */

export const REFERRAL = { reward: 50, perMonthCap: 20, holdDays: 7 }
export type RefStage = 'invited' | 'joined' | 'phone' | 'kyc' | 'topup' | 'paid'
export const REF_STAGES: { key: RefStage; label: string }[] = [
  { key: 'invited', label: 'Invited' }, { key: 'joined', label: 'Signed up' }, { key: 'phone', label: 'Phone ✓' },
  { key: 'kyc', label: 'KYC ✓' }, { key: 'topup', label: 'Topped up' }, { key: 'paid', label: '₺ paid' },
]
export interface Referral { id: string; name: string; flag: string; stage: RefStage; ts: number }

export const AMBASSADOR_TIERS = [
  { name: 'Bronze', min: 10, perk: '₺250 bonus + Ambassador badge', emoji: '🥉' },
  { name: 'Silver', min: 25, perk: '₺750 bonus + Luda hoodie', emoji: '🥈' },
  { name: 'Gold', min: 50, perk: '₺2,000 bonus + paid internship interview', emoji: '🥇' },
]

export interface Deal { id: string; merchant: string; emoji: string; cat: 'Food' | 'Beauty' | 'Groceries' | 'Transport' | 'Phone' | 'Fun'; offer: string; pct: number; max: number; area: string; tone: string }
export function dealsFor(city: string, areas: string[]): Deal[] {
  const rows: Omit<Deal, 'id' | 'area'>[] = [
    { merchant: 'Mama Put Kitchen', emoji: '🍲', cat: 'Food', offer: '15% off jollof & suya', pct: 15, max: 100, tone: 'from-orange-500 to-red-700' },
    { merchant: 'Fade Masters Barber', emoji: '💈', cat: 'Beauty', offer: '20% off your first cut', pct: 20, max: 80, tone: 'from-sky-500 to-indigo-700' },
    { merchant: 'Afro-Euro Mini Market', emoji: '🛒', cat: 'Groceries', offer: '10% off African foodstuff', pct: 10, max: 150, tone: 'from-emerald-500 to-teal-800' },
    { merchant: 'Campus Taxi', emoji: '🚕', cat: 'Transport', offer: '₺30 off rides to Ercan', pct: 12, max: 30, tone: 'from-yellow-400 to-amber-700' },
    { merchant: 'PhoneFix Lefkoşa', emoji: '📱', cat: 'Phone', offer: '15% off screen repairs', pct: 15, max: 300, tone: 'from-fuchsia-500 to-purple-800' },
    { merchant: 'Braids & Locs Studio', emoji: '💇🏾‍♀️', cat: 'Beauty', offer: '10% off knotless braids', pct: 10, max: 120, tone: 'from-pink-500 to-rose-800' },
    { merchant: 'Rooftop Lounge', emoji: '🎶', cat: 'Fun', offer: 'Free entry before 11pm', pct: 100, max: 150, tone: 'from-violet-500 to-indigo-900' },
  ]
  return rows.map((d, i) => ({ ...d, id: `deal-${city}-${i}`, area: areas[i % areas.length] }))
}

export const WELCOME_STEPS = [
  { id: 'sim', emoji: '📱', title: 'Get a local SIM', body: 'Kuzey Kıbrıs Turkcell or Vodafone Telsim shops accept your passport. Ask for a student data package.', to: '/nearby?cat=money' },
  { id: 'group', emoji: '💬', title: 'Join your community group', body: 'Meet people from home who already know the ropes.', to: '/chats' },
  { id: 'verify', emoji: '🛡️', title: 'Verify your account', body: 'Phone + KYC unlock your wallet. Your first SafeSwap is fee-free.', to: '/profile' },
  { id: 'residency', emoji: '🪪', title: 'Start your residence permit', body: 'Collect documents and track the steps before your deadline.', to: '/residency' },
  { id: 'housing', emoji: '🏠', title: 'Find a place to live', body: 'Verified rooms and roommates; never pay before viewing.', to: '/housing' },
  { id: 'uni', emoji: '🎓', title: 'Set up your university', body: 'Your school’s deadlines, fees and timetable reminders.', to: '/uni' },
  { id: 'transport', emoji: '🚌', title: 'Learn the buses', body: 'Routes, fares and cheaper tickets with Ride Saver.', to: '/transport' },
  { id: 'emergency', emoji: '🚨', title: 'Save emergency numbers', body: 'Police 155 · Ambulance 112 · Fire 199.', to: '/more' },
]

export type SpinPrize = { label: string; emoji: string; xp?: number; points?: number; tl?: number; weight: number; color: string }
export const SPIN: SpinPrize[] = [
  { label: '10 XP', emoji: '⚡', xp: 10, weight: 24, color: '#34d399' },
  { label: '50 pts', emoji: '🪙', points: 50, weight: 18, color: '#fbbf24' },
  { label: '25 XP', emoji: '⚡', xp: 25, weight: 18, color: '#60a5fa' },
  { label: '₺5', emoji: '💸', tl: 5, weight: 10, color: '#f472b6' },
  { label: '100 pts', emoji: '🪙', points: 100, weight: 12, color: '#a78bfa' },
  { label: '50 XP', emoji: '🚀', xp: 50, weight: 10, color: '#22d3ee' },
  { label: '₺20', emoji: '🎁', tl: 20, weight: 3, color: '#f97316' },
  { label: '200 pts', emoji: '💎', points: 200, weight: 5, color: '#e879f9' },
]

export type NewsCat = 'Residency' | 'University' | 'Utilities' | 'Safety' | 'Events' | 'Transport' | 'Luda'
export interface News { id: string; cat: NewsCat; title: string; body: string; ts: number; official: boolean; emoji: string; pinned?: boolean; mine?: boolean }
export function newsFeed(): News[] {
  const h = 3_600_000, now = Date.now()
  return [
    { id: 'n1', cat: 'Safety', emoji: '🚨', title: 'Scam alert: fake “agent” asking for residency fees', body: 'People are being contacted on WhatsApp by someone claiming to speed up İkamet applications for a fee. The immigration office never asks for payment through individuals. Report any such message in Luda.', ts: now - 2 * h, official: true, pinned: true },
    { id: 'n2', cat: 'Utilities', emoji: '⚡', title: 'Planned power cut in Gönyeli tomorrow 09:00–13:00', body: 'KIB-TEK maintenance on the main line. Charge your devices tonight.', ts: now - 5 * h, official: true },
    { id: 'n3', cat: 'University', emoji: '🎓', title: 'Midterm week starts in 2 weeks', body: 'Check your school’s exam schedule in the University hub and turn on class reminders.', ts: now - 9 * h, official: true },
    { id: 'n4', cat: 'Residency', emoji: '🪪', title: 'Renewing your permit? Start 60 days early', body: 'Health checks and document reviews can take several weeks. Use the Residency checklist to track documents.', ts: now - 26 * h, official: true },
    { id: 'n5', cat: 'Events', emoji: '⚽', title: 'Africa Cup on campus: teams wanted', body: '5-a-side tournament next month. Register your country team in Community.', ts: now - 30 * h, official: false },
    { id: 'n6', cat: 'Transport', emoji: '🚌', title: 'Extra late buses Girne ⇄ Lefkoşa on weekends', body: 'Departures until 00:30 on Fridays and Saturdays. Book in Transport with Ride Saver.', ts: now - 50 * h, official: true },
    { id: 'n7', cat: 'Luda', emoji: '✨', title: 'New: Marketplace & voice notes', body: 'Buy and sell safely with escrow, and send voice notes in any chat.', ts: now - 70 * h, official: true },
  ]
}

export interface Challenge { id: string; title: string; emoji: string; desc: string; goal: number; unit: string; prize: string; ends: string; kind: 'personal' | 'country' | 'campus' }
export const challengesFor = (monthEnd: string): Challenge[] => [
  { id: 'c-bills', title: 'Bill boss', emoji: '⚡', desc: 'Pay 3 bills with Luda this month', goal: 3, unit: 'bills', prize: '300 pts + Bill Boss badge', ends: monthEnd, kind: 'personal' },
  { id: 'c-save', title: 'Save ₺1,000', emoji: '🐷', desc: 'Put ₺1,000 into savings pots this month', goal: 1000, unit: '₺', prize: '₺20 bonus', ends: monthEnd, kind: 'personal' },
  { id: 'c-swap', title: 'Safe swapper', emoji: '🔒', desc: 'Complete 2 SafeSwaps', goal: 2, unit: 'swaps', prize: 'Next swap fee-free', ends: monthEnd, kind: 'personal' },
  { id: 'c-country', title: 'Country savings cup', emoji: '🏆', desc: 'Which community saves the most this month? Every lira you save counts for your country.', goal: 0, unit: '', prize: 'Winning country: ₺5,000 community party', ends: monthEnd, kind: 'country' },
  { id: 'c-campus', title: 'Campus vs Campus', emoji: '🎓', desc: 'Most newly verified students wins.', goal: 0, unit: '', prize: 'Winning campus: free event + merch', ends: monthEnd, kind: 'campus' },
]

export type NotifCat = 'money' | 'chats' | 'classes' | 'rates' | 'deals' | 'news' | 'security'
export const NOTIF_CATS: { key: NotifCat; label: string; emoji: string }[] = [
  { key: 'money', label: 'Money in & out', emoji: '💸' }, { key: 'security', label: 'Sign-ins & security', emoji: '🔐' }, { key: 'chats', label: 'Chat messages', emoji: '💬' },
  { key: 'classes', label: 'Class reminders', emoji: '🎓' }, { key: 'rates', label: 'Rate alerts', emoji: '📈' }, { key: 'deals', label: 'Deals near you', emoji: '🎁' }, { key: 'news', label: 'News & alerts', emoji: '📰' },
]
