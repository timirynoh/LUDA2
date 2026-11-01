import type { State } from './store'

/** 0 = Explorer (browse), 1 = phone verified (do & post), 2 = phone + ID verified (money). */
export type Tier = 0 | 1 | 2
export const tierOf = (s: Pick<State, 'phoneVerified' | 'verified'>): Tier => (s.phoneVerified ? (s.verified ? 2 : 1) : 0)

export const TIERS = [
  { name: 'Explorer', emoji: '👀', how: 'Just signed up', color: 'from-slate-400 to-slate-600' },
  { name: 'Verified', emoji: '📱', how: 'Phone number · 30 seconds', color: 'from-sky-400 to-indigo-600' },
  { name: 'KYC verified', emoji: '🛡️', how: 'ID + selfie (KYC) · 2 minutes', color: 'from-mint-400 to-emerald-600' },
] as const

export interface Feature { label: string; emoji: string; tier: Tier }

/** Everything Luda can do, and what it takes to unlock it. */
export const FEATURES: Feature[] = [
  { label: 'Browse houses & roommates', emoji: '🏠', tier: 0 }, { label: 'See jobs near you', emoji: '💼', tier: 0 },
  { label: 'Live exchange rates', emoji: '📈', tier: 0 }, { label: 'Food, shops & pharmacies nearby', emoji: '🍽️', tier: 0 },
  { label: 'Residency guide & portal', emoji: '🪪', tier: 0 }, { label: 'Uni timetable & reminders', emoji: '🎓', tier: 0 },
  { label: 'Community events', emoji: '🎉', tier: 0 }, { label: 'Peek into group chats', emoji: '👀', tier: 0 },
  { label: 'Chat in groups & create your own', emoji: '💬', tier: 1 }, { label: 'Apply for jobs', emoji: '📝', tier: 1 },
  { label: 'Post quick jobs', emoji: '⚡', tier: 1 }, { label: 'Post your house or room', emoji: '🔑', tier: 1 },
  { label: 'Book house viewings', emoji: '📅', tier: 1 }, { label: 'Find roommates', emoji: '🤝', tier: 1 },
  { label: 'Flash help: get things fixed', emoji: '🛠️', tier: 1 }, { label: 'Bus & airport tickets', emoji: '🎟️', tier: 1 },
  { label: 'Ride Saver discounts', emoji: '💸', tier: 1 }, { label: 'RSVP & post events', emoji: '📣', tier: 1 },
  { label: 'Top up your wallet (small limits)', emoji: '💰', tier: 1 }, { label: 'Withdraw & send money home', emoji: '🏦', tier: 2 }, { label: 'Convert Naira, Cedi, CFA → Lira', emoji: '💱', tier: 2 },
  { label: 'SafeSwap in-person exchange', emoji: '🔒', tier: 2 }, { label: 'Pay bills with cashback', emoji: '⚡', tier: 2 },
  { label: 'Pay tuition from your wallet', emoji: '🏛️', tier: 2 }, { label: 'Escrow-protected payments', emoji: '🛡️', tier: 2 }, { label: 'Send money to friends', emoji: '💸', tier: 2 }, { label: 'Savings pots', emoji: '🐷', tier: 2 },
  { label: 'Buy & sell marketplace', emoji: '🛒', tier: 1 },
]

/** Minimum tier for home shortcuts (for lock badges). */
export const ACTION_TIER: Record<string, Tier> = { deposit: 1, withdraw: 2, convert: 2, p2p: 2, bills: 2, send: 2, savings: 2 }
