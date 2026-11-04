import { setScreenLanguage } from './autoTranslate'
import { LIVE } from './live'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BADGES, LANGS, LEVELS, type Lang } from './data'
import type { Listing } from './housing'
import type { Job } from './jobs'
import type { Ev } from './community'
import type { ClassItem } from './ocr'
import type { Group, Msg } from './chat'
import type { Ticket } from './tickets'
import type { FlashReq, MyGig } from './flash'
import { translate } from './i18n'
import { hashPin } from './crypto'
import { tierOf, type Tier } from './access'
import { fingerprint, isDuplicate, limitInfo } from './antispam'
import type { Kyc } from './kyc'
import type { ThreadMsg } from './threads'
import type { Dispute } from './disputes'
import type { Ad, ExchangerApp } from './exchanger'
import type { SavedCard } from './cards'
import type { Review } from './social'
import type { Item, Order } from './market'
import type { Pot, RateAlert } from './savings'
import type { News, NotifCat, Referral } from './growth'
import type { Promo } from './promos'

export type TxType = 'deposit' | 'withdraw' | 'convert' | 'bill' | 'p2p' | 'reward'
export interface Tx { id: string; type: TxType; amount: number; currency: string; label: string; ts: number; meta?: string }

export type TradeStatus = 'escrow' | 'meeting' | 'completed' | 'cancelled' | 'disputed'
export interface Courier { name: string; flag: string; vehicle: string; plate: string; phone: string; rating: number; verified: boolean; assignedAt: number; etaSec: number; secret: string }
export interface Delegate { name: string; phone: string; plate?: string; code: string; expires: number; createdAt: number; traderVerifiedAt?: number; receivedAt?: number }
export interface Trade {
  id: string; trader: string; traderFlag: string; give: number; giveCur: string; get: number; getCur: string
  spot: string; when: string; status: TradeStatus; secret: string; createdAt: number
  /** How the cash changes hands: face to face, a courier sent by the trader, or someone collecting for you. */
  handover?: 'person' | 'courier' | 'delegate'; courier?: Courier; delegate?: Delegate
}

export interface State {
  onboarded: boolean
  name: string; country: string; city: string; lang: Lang
  pinHash: string; salt: string
  verified: boolean
  balances: Record<string, number>
  txs: Tx[]
  xp: number; points: number
  streak: number; lastDay: string
  badges: string[]
  quests: string[]
  trades: Trade[]
  savedBills: { biller: string; account: string }[]
  docs: string[]
  permitExpiry: string
  contacted: number
  savedHomes: string[]
  viewings: { id: string; listingId: string; title: string; date: string }[]
  myListings: Listing[]
  connections: string[]
  theme: 'dark' | 'light' | 'system'
  shortcuts: string[]
  sections: { flash: boolean; nextClass: boolean; rates: boolean; quests: boolean; deadline: boolean; checkin: boolean; welcome: boolean; news: boolean; promos: boolean }
  phoneVerified: boolean
  proofs: { housing?: 'resident' | 'owner' | 'agent' | 'photos'; business?: 'company' | 'individual'; org?: boolean }
  isAdmin: boolean
  reports: string[]
  myJobs: Job[]
  applications: { id: string; jobId: string; title: string; company: string; ts: number }[]
  myEvents: Ev[]
  rsvps: string[]
  university: string
  classes: ClassItem[]
  remind: { on: boolean; minutes: number }
  paidFees: string[]
  joinedGroups: string[]
  myGroups: Group[]
  chatMsgs: Record<string, Msg[]>
  lastRead: Record<string, number>
  mutedGroups: string[]
  blockedUsers: string[]
  hiddenMsgs: string[]
  chatStrikes: { count: number; until: number }
  tickets: Ticket[]
  reacts: Record<string, string>
  flash: FlashReq[]
  saver: { status: 'none' | 'member' | 'declined'; joinedAt?: number }
  createdAt: number
  toured: boolean
  activity: Record<string, number[]>
  account: { email: string; username: string; passHash: string; salt: string; stay: boolean } | null
  signedIn: boolean
  lockOnOpen: boolean
  security: { frozen: boolean; twoStep: boolean; hideBalances: boolean; dailyWithdraw: number; autoLockMin: number }
  logins: { ts: number; how: string; device: string }[]
  inbox: { id: string; ts: number; emoji: string; title: string; read: boolean; to?: string }[]
  referral: string
  kyc: Kyc
  threads: Record<string, ThreadMsg[]>
  disputes: Dispute[]
  exchanger: ExchangerApp
  ads: Ad[]
  cards: SavedCard[]
  flashPop: boolean
  reviews: Review[]
  alerts: RateAlert[]
  pots: Pot[]
  myItems: Item[]
  orders: Order[]
  avatar?: string
  referrals: Referral[]
  invitedBy?: string
  ambassador: { status: 'none' | 'active'; uni?: string }
  dealsUsed: { id: string; merchant: string; saved: number; ts: number }[]
  welcomeDone: string[]
  spin: { last?: string; total: number }
  newsSaved: string[]
  newsLiked: string[]
  challenges: string[]
  notifPrefs: Record<NotifCat, boolean>
  pushOn: boolean
  myNews: News[]
  myPromos: Promo[]
  promoVotes: Record<string, 'still' | 'gone'>
  savedPromos: string[]
  invitePaid?: boolean
  bio?: string
  sent: { id: string; to: string; amount: number; cur: string; note: string; ts: number }[]
  recentPosts: { f: string; t: number }[]
  deposits: number
  gigs: MyGig[]
}

const KEY = 'luda.v1'
const today = () => new Date().toISOString().slice(0, 10)

export const initialState: State = {
  onboarded: false, name: '', country: 'NG', city: 'lefkosa', lang: 'en',
  pinHash: '', salt: '', verified: false,
  balances: { TRY: 0, NGN: 0, USD: 0 },
  txs: [], xp: 0, points: 0, streak: 1, lastDay: today(),
  badges: [], quests: [], trades: [], savedBills: [], docs: [], permitExpiry: '', contacted: 0,
  savedHomes: [], viewings: [], myListings: [], connections: [],
  theme: 'dark', shortcuts: ['deposit', 'convert', 'p2p', 'bills'],
  sections: { flash: true, nextClass: true, rates: true, quests: true, deadline: true, checkin: true, welcome: true, news: true, promos: true },
  phoneVerified: false, proofs: {}, isAdmin: false, reports: [],
  myJobs: [], applications: [], myEvents: [], rsvps: [],
  university: '', classes: [], remind: { on: false, minutes: 15 }, paidFees: [],
  joinedGroups: ['g-help'], myGroups: [], chatMsgs: {}, lastRead: {}, mutedGroups: [], blockedUsers: [], hiddenMsgs: [],
  chatStrikes: { count: 0, until: 0 }, tickets: [], reacts: {}, flash: [], gigs: [], saver: { status: 'none' }, createdAt: Date.now(), toured: false, account: null, signedIn: false, lockOnOpen: true,
  security: { frozen: false, twoStep: false, hideBalances: false, dailyWithdraw: 20000, autoLockMin: 3 }, logins: [], inbox: [], referral: '', kyc: { status: 'none' }, threads: {}, disputes: [], exchanger: { status: 'none' }, ads: [], cards: [], flashPop: true, reviews: [], alerts: [], pots: [], myItems: [], orders: [], sent: [],
  referrals: [], ambassador: { status: 'none' }, dealsUsed: [], welcomeDone: [], spin: { total: 0 }, newsSaved: [], newsLiked: [], challenges: [],
  notifPrefs: { money: true, chats: true, classes: true, rates: true, deals: false, news: true, security: true }, pushOn: false, myNews: [], myPromos: [], promoVotes: {}, savedPromos: [], activity: {}, recentPosts: [], deposits: 0,
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initialState
    const s = { ...initialState, ...JSON.parse(raw) } as State
    s.sections = { ...initialState.sections, ...s.sections }
    s.security = { ...initialState.security, ...s.security }
    if (s.verified && s.kyc.status === 'none') s.kyc = { status: 'verified' } // older demo profiles
    if (s.account && !s.account.stay) s.signedIn = false
    // Live: never keep a copy (or hash) of the payment PIN on the phone. Older versions stored one for the lock screen.
    if (LIVE && s.pinHash && s.pinHash !== 'server') { s.pinHash = 'server'; s.salt = '' }
    if (!['en', 'tr', 'fr', 'sw', 'ar'].includes(s.lang)) s.lang = 'en' // Nigerian languages removed: English for everyone from Nigeria
    // daily streak bookkeeping (demo only; live streaks are kept by the server)
    const t = today()
    if (!LIVE && s.lastDay !== t) {
      const diff = (Date.parse(t) - Date.parse(s.lastDay)) / 86_400_000
      s.streak = diff === 1 ? s.streak + 1 : 1
      s.lastDay = t
    }
    return s
  } catch {
    return initialState
  }
}

export interface Toast { id: number; title: string; xp?: number; emoji?: string }

interface Ctx {
  s: State
  set: (fn: (s: State) => State) => void
  t: (k: string) => string
  rtl: boolean
  level: { idx: number; name: string; emoji: string; progress: number; next: number }
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  /** Award XP, optionally completing a quest and unlocking a badge. */
  reward: (xp: number, opts?: { quest?: string; badge?: string; title?: string }) => void
  addTx: (tx: Omit<Tx, 'id' | 'ts'>) => void
  notify: (emoji: string, title: string, to?: string) => void
  checkPin: (pin: string) => Promise<boolean>
  reset: () => void
  /** Returns true if the user's tier allows it; otherwise opens the unlock sheet. */
  gate: (tier: Tier, what: string) => boolean
  gateReq: { tier: Tier; what: string } | null
  closeGate: () => void
  /** Anti-spam: checks the daily limit (and duplicate text), records the action if allowed. */
  allow: (kind: string, text?: string) => boolean
}

const C = createContext<Ctx | null>(null)
export const uid = () => Math.random().toString(36).slice(2, 10)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(load)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [gateReq, setGateReq] = useState<{ tier: Tier; what: string } | null>(null)

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ } }, [s])

  const rtl = !!LANGS.find((l) => l.code === s.lang)?.rtl
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const apply = () => document.documentElement.classList.toggle('light', s.theme === 'light' || (s.theme === 'system' && !!mq?.matches))
    apply()
    mq?.addEventListener?.('change', apply)
    return () => mq?.removeEventListener?.('change', apply)
  }, [s.theme])

  useEffect(() => {
    document.documentElement.lang = s.lang
    document.documentElement.dir = rtl ? 'rtl' : 'ltr'
    void setScreenLanguage(s.lang) // translates every known text on screen, not only the t() keys
  }, [s.lang, rtl])

  const set = useCallback((fn: (s: State) => State) => setS(fn), [])
  const t = useCallback((k: string) => translate(s.lang, k), [s.lang])

  const toast = useCallback((x: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { ...x, id }])
    setTimeout(() => setToasts((ts) => ts.filter((y) => y.id !== id)), 3200)
  }, [])

  const reward = useCallback<Ctx['reward']>((xp, opts = {}) => {
    // Live: XP, badges and quests are worked out by the server from what really happened. The phone never adds them;
    // it just asks the server for the new numbers.
    if (LIVE) { if (opts.title) toast({ title: opts.title, emoji: '⚡' }); window.dispatchEvent(new Event('luda:rewards')); return }
    let bonus = 0
    let unlocked: string | undefined
    setS((prev) => {
      const next = { ...prev, xp: prev.xp + xp }
      if (opts.quest && !prev.quests.includes(opts.quest)) next.quests = [...prev.quests, opts.quest]
      const badges = [...prev.badges]
      if (opts.badge && !badges.includes(opts.badge)) { badges.push(opts.badge); unlocked = opts.badge; bonus = 25 }
      if (prev.streak >= 7 && !badges.includes('streak7')) badges.push('streak7')
      next.badges = badges
      next.xp += bonus
      return next
    })
    toast({ title: opts.title ?? 'Nice move!', xp, emoji: '⚡' })
    setTimeout(() => { if (unlocked) toast({ title: `Badge unlocked: ${BADGES[unlocked].name}`, emoji: BADGES[unlocked].emoji, xp: 25 }) }, 400)
  }, [toast])

  const sRef = useRef(s)
  useEffect(() => { sRef.current = s }, [s])
  const notify = useCallback<Ctx['notify']>((emoji, title, to) => {
    setS((p) => ({ ...p, inbox: [{ id: uid(), ts: Date.now(), emoji, title, read: false, to }, ...p.inbox].slice(0, 100) }))
    pushIfAllowed(sRef.current, emoji, title, to)
  }, [])
  const addTx = useCallback<Ctx['addTx']>((tx) => {
    setS((p) => ({
      ...p, txs: [{ ...tx, id: uid(), ts: Date.now() }, ...p.txs].slice(0, 200),
      // Every money movement creates an alert so nothing happens silently.
      inbox: tx.amount ? [{ id: uid(), ts: Date.now(), emoji: tx.amount > 0 ? '💸' : '🧾', title: `${tx.amount > 0 ? 'Money in' : 'Money out'}: ${tx.label}`, read: false, to: '/wallet' }, ...p.inbox].slice(0, 100) : p.inbox,
    }))
  }, [])

  const checkPin = useCallback(async (pin: string) => (await hashPin(pin, s.salt)) === s.pinHash, [s.salt, s.pinHash])

  const gate = useCallback((tier: Tier, what: string) => {
    if (tierOf(s) < tier) { setGateReq({ tier, what }); return false }
    if (tier === 2 && s.security.frozen && what !== 'Everything in Luda') { toast({ title: 'Your wallet is frozen. Unfreeze it in Security Center', emoji: '🧊' }); return false }
    return true
  }, [s, toast])
  const closeGate = useCallback(() => setGateReq(null), [])
  const allow = useCallback((kind: string, text?: string) => {
    if (s.isAdmin) return true
    const l = limitInfo(s, kind)
    if (!l.ok) { toast({ title: `Daily limit reached: max ${l.max} ${l.label} per day. Try again tomorrow`, emoji: '🛑' }); return false }
    if (text && isDuplicate(s, text)) { toast({ title: "You've already posted this. Duplicate posts are blocked", emoji: '🔁' }); return false }
    const now = Date.now()
    setS((p) => ({
      ...p, activity: { ...p.activity, [kind]: [...(p.activity[kind] ?? []).filter((x) => now - x < 86_400_000), now] },
      recentPosts: text ? [...p.recentPosts.filter((x) => now - x.t < 7 * 86_400_000), { f: fingerprint(text), t: now }].slice(-100) : p.recentPosts,
    }))
    return true
  }, [s, toast])

  const reset = useCallback(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } setS({ ...initialState }) }, [])

  const level = useMemo(() => {
    let idx = 0
    LEVELS.forEach((l, i) => { if (s.xp >= l.min) idx = i })
    const cur = LEVELS[idx], nxt = LEVELS[idx + 1]
    const progress = nxt ? (s.xp - cur.min) / (nxt.min - cur.min) : 1
    return { idx: idx + 1, name: cur.name, emoji: cur.emoji, progress, next: nxt?.min ?? cur.min }
  }, [s.xp])

  const value = useMemo(() => ({ s, set, t, rtl, level, toasts, toast, reward, addTx, notify, checkPin, reset, gate, gateReq, closeGate, allow }),
    [s, set, t, rtl, level, toasts, toast, reward, addTx, notify, checkPin, reset, gate, gateReq, closeGate, allow])
  return <C.Provider value={value}>{children}</C.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const c = useContext(C)
  if (!c) throw new Error('StoreProvider missing')
  return c
}

/** Category of a notification, from where it links to. */
function categoryOf(to?: string, emoji?: string): NotifCat {
  if (!to) return emoji === '🔐' ? 'security' : 'news'
  if (to.startsWith('/security')) return 'security'
  if (to.startsWith('/wallet') || to.startsWith('/disputes') || to.startsWith('/invite') || to.startsWith('/send')) return 'money'
  if (to.startsWith('/chats') || to.startsWith('/flash')) return 'chats'
  if (to.startsWith('/exchange')) return 'rates'
  if (to.startsWith('/uni')) return 'classes'
  if (to.startsWith('/deals')) return 'deals'
  return 'news'
}

/** Shows a phone/system notification when the user allowed it for that category. */
function pushIfAllowed(s: State, emoji: string, title: string, to?: string) {
  try {
    if (!s.pushOn || !('Notification' in window) || Notification.permission !== 'granted') return
    if (!s.notifPrefs[categoryOf(to, emoji)]) return
    new Notification(`${emoji} Luda`, { body: title, tag: `${Date.now()}`, icon: './icon-192.png' })
  } catch { /* not supported here */ }
}
