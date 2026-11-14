import { Flame, MapPin, MessageCircle, Wrench, Send, PiggyBank, ShoppingBag, Tag, Newspaper, Trophy, UserPlus, Megaphone, Luggage, ArrowDownLeft, ArrowUpRight, Briefcase, Building2, Bus, Gift, GraduationCap, Handshake, House, Repeat, ShieldCheck, Users, UtensilsCrossed, Zap, type LucideIcon } from 'lucide-react'

export interface Action { id: string; to: string; icon: LucideIcon; key: string; c: string; admin?: boolean }

/** Every shortcut a user can pin to their home screen. */
export const ACTIONS: Action[] = [
  { id: 'deposit', to: '/wallet?a=deposit', icon: ArrowDownLeft, key: 'act.deposit', c: 'from-mint-400 to-emerald-600' },
  { id: 'withdraw', to: '/wallet?a=withdraw', icon: ArrowUpRight, key: 'act.withdraw', c: 'from-sky-400 to-indigo-500' },
  { id: 'convert', to: '/exchange', icon: Repeat, key: 'act.convert', c: 'from-gold-300 to-amber-500' },
  { id: 'p2p', to: '/exchange?tab=p2p', icon: Handshake, key: 'act.p2p', c: 'from-fuchsia-400 to-purple-600' },
  { id: 'bills', to: '/bills', icon: Zap, key: 'act.bills', c: 'from-orange-400 to-rose-500' },
  { id: 'uni', to: '/uni', icon: GraduationCap, key: 'act.uni', c: 'from-indigo-400 to-blue-700' },
  { id: 'housing', to: '/housing', icon: House, key: 'act.housing', c: 'from-amber-400 to-orange-600' },
  { id: 'jobs', to: '/jobs', icon: Briefcase, key: 'act.jobs', c: 'from-lime-400 to-green-700' },
  { id: 'community', to: '/community', icon: Users, key: 'act.community', c: 'from-pink-400 to-rose-600' },
  { id: 'transport', to: '/transport', icon: Bus, key: 'act.transport', c: 'from-cyan-400 to-sky-700' },
  { id: 'promos', to: '/promos', icon: Flame, key: 'act.promos', c: 'from-red-400 to-orange-600' },
  { id: 'deals', to: '/deals', icon: Tag, key: 'act.deals', c: 'from-orange-400 to-red-600' },
  { id: 'news', to: '/news', icon: Newspaper, key: 'act.news', c: 'from-slate-400 to-indigo-700' },
  { id: 'challenges', to: '/challenges', icon: Trophy, key: 'act.challenges', c: 'from-yellow-300 to-amber-700' },
  { id: 'invite', to: '/invite', icon: UserPlus, key: 'act.invite', c: 'from-emerald-400 to-lime-700' },
  { id: 'ambassador', to: '/ambassadors', icon: Megaphone, key: 'act.ambassador', c: 'from-indigo-400 to-violet-800' },
  { id: 'welcome', to: '/welcome', icon: Luggage, key: 'act.welcome', c: 'from-teal-300 to-emerald-700' },
  { id: 'send', to: '/send', icon: Send, key: 'act.send', c: 'from-emerald-400 to-cyan-700' },
  { id: 'savings', to: '/savings', icon: PiggyBank, key: 'act.savings', c: 'from-pink-400 to-fuchsia-700' },
  { id: 'market', to: '/market', icon: ShoppingBag, key: 'act.market', c: 'from-amber-300 to-rose-600' },
  { id: 'flash', to: '/flash', icon: Wrench, key: 'act.flash', c: 'from-yellow-300 to-orange-600' },
  { id: 'chats', to: '/chats', icon: MessageCircle, key: 'nav.chats', c: 'from-emerald-400 to-teal-700' },
  { id: 'nearby', to: '/nearby?cat=grocery', icon: MapPin, key: 'nav.nearby', c: 'from-sky-400 to-indigo-600' },
  { id: 'food', to: '/nearby', icon: UtensilsCrossed, key: 'act.food', c: 'from-rose-400 to-pink-600' },
  { id: 'residency', to: '/residency', icon: Building2, key: 'act.residency', c: 'from-teal-300 to-cyan-600' },
  { id: 'rewards', to: '/rewards', icon: Gift, key: 'act.rewards', c: 'from-violet-400 to-indigo-600' },
  { id: 'admin', to: '/admin', icon: ShieldCheck, key: 'act.admin', c: 'from-slate-500 to-slate-700', admin: true },
]
export const MAX_SHORTCUTS = 8
