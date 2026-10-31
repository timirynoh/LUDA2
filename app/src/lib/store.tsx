import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BADGES, LANGS, LEVELS, type Lang } from './data'
import type { Listing } from './housing'
import type { Job } from './jobs'
import type { Ev } from './community'
import type { ClassItem } from './ocr'
import type { Group, Msg } from './chat'
import type { Ticket } from './tickets'
import { translate } from './i18n'
import { hashPin } from './crypto'

export type TxType = 'deposit' | 'withdraw' | 'convert' | 'bill' | 'p2p' | 'reward'
export interface Tx { id: string; type: TxType; amount: number; currency: string; label: string; ts: number; meta?: string }

export type TradeStatus = 'escrow' | 'meeting' | 'completed' | 'cancelled' | 'disputed'
export interface Trade {
  id: string; trader: string; traderFlag: string; give: number; giveCur: string; get: number; getCur: string
  spot: string; when: string; status: TradeStatus; secret: string; createdAt: number
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
  sections: { nextClass: boolean; rates: boolean; quests: boolean; deadline: boolean }
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
  sections: { nextClass: true, rates: true, quests: true, deadline: true },
  phoneVerified: false, proofs: {}, isAdmin: false, reports: [],
  myJobs: [], applications: [], myEvents: [], rsvps: [],
  university: '', classes: [], remind: { on: false, minutes: 15 }, paidFees: [],
  joinedGroups: ['g-help'], myGroups: [], chatMsgs: {}, lastRead: {}, mutedGroups: [], blockedUsers: [], hiddenMsgs: [],
  chatStrikes: { count: 0, until: 0 }, tickets: [], reacts: {},
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initialState
    const s = { ...initialState, ...JSON.parse(raw) } as State
    // daily streak bookkeeping
    const t = today()
    if (s.lastDay !== t) {
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
  checkPin: (pin: string) => Promise<boolean>
  reset: () => void
}

const C = createContext<Ctx | null>(null)
export const uid = () => Math.random().toString(36).slice(2, 10)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(load)
  const [toasts, setToasts] = useState<Toast[]>([])

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
  }, [s.lang, rtl])

  const set = useCallback((fn: (s: State) => State) => setS(fn), [])
  const t = useCallback((k: string) => translate(s.lang, k), [s.lang])

  const toast = useCallback((x: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts, { ...x, id }])
    setTimeout(() => setToasts((ts) => ts.filter((y) => y.id !== id)), 3200)
  }, [])

  const reward = useCallback<Ctx['reward']>((xp, opts = {}) => {
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

  const addTx = useCallback<Ctx['addTx']>((tx) => {
    setS((p) => ({ ...p, txs: [{ ...tx, id: uid(), ts: Date.now() }, ...p.txs].slice(0, 200) }))
  }, [])

  const checkPin = useCallback(async (pin: string) => (await hashPin(pin, s.salt)) === s.pinHash, [s.salt, s.pinHash])

  const reset = useCallback(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } setS({ ...initialState }) }, [])

  const level = useMemo(() => {
    let idx = 0
    LEVELS.forEach((l, i) => { if (s.xp >= l.min) idx = i })
    const cur = LEVELS[idx], nxt = LEVELS[idx + 1]
    const progress = nxt ? (s.xp - cur.min) / (nxt.min - cur.min) : 1
    return { idx: idx + 1, name: cur.name, emoji: cur.emoji, progress, next: nxt?.min ?? cur.min }
  }, [s.xp])

  const value = useMemo(() => ({ s, set, t, rtl, level, toasts, toast, reward, addTx, checkPin, reset }),
    [s, set, t, rtl, level, toasts, toast, reward, addTx, checkPin, reset])
  return <C.Provider value={value}>{children}</C.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const c = useContext(C)
  if (!c) throw new Error('StoreProvider missing')
  return c
}
