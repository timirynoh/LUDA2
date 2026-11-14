import { DAILY_LIMITS } from '../config'
import type { State } from './store'

const DAY = 86_400_000
export const usedToday = (s: State, kind: string) => (s.activity[kind] ?? []).filter((t) => Date.now() - t < DAY).length

/** Normalised fingerprint so "Need a PLUMBER!!" and "need a plumber" count as the same post. */
export const fingerprint = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** True if the same text was already posted by this user in the last 7 days. */
export const isDuplicate = (s: State, text: string) => {
  const f = fingerprint(text)
  return !!f && (s.recentPosts ?? []).some((p) => p.f === f && Date.now() - p.t < 7 * DAY)
}

export function limitInfo(s: State, kind: string) {
  const l = DAILY_LIMITS[kind]
  if (!l) return { ok: true, left: Infinity, max: Infinity, label: kind }
  const used = usedToday(s, kind)
  return { ok: used < l.max, left: l.max - used, max: l.max, label: l.label }
}
