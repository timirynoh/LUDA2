import type { State } from './store'

export type PostKind = 'housing' | 'job' | 'event'
export type PostStatus = 'pending' | 'live' | 'rejected'
export interface PostMeta { status?: PostStatus; createdAt?: number; confirmedAt?: number; official?: boolean; rejectReason?: string }

/** Listings disappear unless the poster confirms they're still available within this window. */
export const STALE_AFTER_DAYS = 7
export const isStale = (m: PostMeta) => !!m.confirmedAt && Date.now() - m.confirmedAt > STALE_AFTER_DAYS * 86_400_000
export const isVisible = (m: PostMeta) => (m.status ?? 'live') === 'live' && !isStale(m)

const allMine = (s: State): PostMeta[] => [...s.myListings, ...s.myJobs, ...s.myEvents]

/**
 * Anti-spam posting limits: a brand-new poster gets 1 active post per section.
 * Once Luda approves any post, the limit grows with the user's level.
 */
export function postLimit(s: State, kind: PostKind, levelIdx: number) {
  if (s.isAdmin) return { used: 0, max: Infinity }
  const list: PostMeta[] = kind === 'housing' ? s.myListings : kind === 'job' ? s.myJobs : s.myEvents
  const used = list.filter((x) => x.status === 'pending' || (x.status === 'live' && !isStale(x))).length
  const approved = allMine(s).some((x) => x.status === 'live')
  return { used, max: approved ? Math.min(2 + levelIdx, 10) : 1 }
}

export const PROOF_TEXT = {
  owner: { label: 'I own it', doc: 'Title deed (Koçan) or a KIB-TEK bill in your name for this address' },
  agent: { label: "I'm an estate agent", doc: 'Estate agent licence / company registration' },
  tenant: { label: "I'm subletting", doc: "Landlord's signed permission to sublet + your rental contract" },
} as const
