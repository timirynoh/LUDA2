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

/** Housing proof options. Any document = goes live instantly; photos only = admin review. */
export const PROOF_TEXT = {
  resident: { label: 'I live there', doc: 'Upload your KIB-TEK (electricity) or water bill for this address', instant: true },
  owner: { label: 'I own it', doc: 'Title deed (Koçan) or a utility bill in your name', instant: true },
  agent: { label: "I'm an estate agent", doc: 'Estate agent licence / company registration', instant: true },
  photos: { label: 'Just photos (no document)', doc: 'Your post waits for an admin to approve it', instant: false },
} as const
export type ProofKind = keyof typeof PROOF_TEXT
