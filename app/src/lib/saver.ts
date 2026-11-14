import { SAVER, TICKET_DISCOUNT } from '../config'
import type { State } from './store'
import type { Ticket } from './tickets'

export interface SaverCheck { key: string; label: string; ok: boolean; fix?: string }

/** Automatic selection: all checks must pass. */
export function saverChecks(s: State): SaverCheck[] {
  return [
    { key: 'phone', label: 'Phone number verified (one account per number)', ok: s.phoneVerified, fix: 'verify' },
    { key: 'id', label: 'ID + selfie verified (one person, one account)', ok: s.verified, fix: 'id' },
    { key: 'wallet', label: 'Topped up your Luda wallet at least once', ok: s.deposits > 0, fix: 'deposit' },
    { key: 'profile', label: 'Profile complete (name & city)', ok: !!s.name && !!s.city },
    { key: 'standing', label: 'Good standing (no active strikes or bans)', ok: s.chatStrikes.until < Date.now() },
    { key: 'refunds', label: `Fewer than ${SAVER.maxRefundsPerMonth} refunds this month`, ok: refundsThisMonth(s.tickets) < SAVER.maxRefundsPerMonth },
  ]
}

const sameMonth = (a: number, b = Date.now()) => new Date(a).getMonth() === new Date(b).getMonth() && new Date(a).getFullYear() === new Date(b).getFullYear()
const sameDay = (a: number, b = Date.now()) => new Date(a).toDateString() === new Date(b).toDateString()

export const refundsThisMonth = (t: Ticket[]) => t.filter((x) => x.status === 'refunded' && sameMonth(x.refundedAt ?? x.createdAt)).length

/** Discounted tickets count toward limits even if refunded later, so buy-refund loops don't reset them. */
export function saverUsage(t: Ticket[]) {
  const disc = t.filter((x) => x.saved > 0)
  return { today: disc.filter((x) => sameDay(x.createdAt)).length, month: disc.filter((x) => sameMonth(x.createdAt)).length }
}

export type SaverState =
  | { active: true; leftToday: number; leftMonth: number }
  | { active: false; reason: 'not_member' | 'paused' | 'day_limit' | 'month_limit'; message: string }

export function saverState(s: State): SaverState {
  if (s.saver.status !== 'member') return { active: false, reason: 'not_member', message: 'Opt in to Ride Saver to get the Luda price.' }
  if (saverChecks(s).some((c) => !c.ok)) return { active: false, reason: 'paused', message: 'Ride Saver is paused: an account check is failing (see Ride Saver).' }
  const u = saverUsage(s.tickets)
  if (u.month >= SAVER.perMonth) return { active: false, reason: 'month_limit', message: `Monthly limit reached (${SAVER.perMonth} discounted tickets).` }
  if (u.today >= SAVER.perDay) return { active: false, reason: 'day_limit', message: `Daily limit reached (${SAVER.perDay} discounted tickets). Back tomorrow!` }
  return { active: true, leftToday: SAVER.perDay - u.today, leftMonth: SAVER.perMonth - u.month }
}

/** Price for a booking: discount only on the member's seat + allowed companions. */
export function quote(official: number, ret: boolean, pax: number, active: boolean) {
  const off = ret ? TICKET_DISCOUNT.return : TICKET_DISCOUNT.single
  const seats = active ? Math.min(pax, 1 + SAVER.companions) : 0
  const full = official * pax
  return { full, total: full - seats * off, saved: seats * off, seats, off }
}
