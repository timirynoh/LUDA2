// Automatic identity check (Nigeria) with Dojah: NIN or BVN lookup, then we
// compare the official name and date of birth with what the user told us.
// We store only the legal name, DOB, ID type and last 4 digits, never the full number.
import type { Fetch } from './providers.ts'

export interface KycEnv { DOJAH_APP_ID?: string; DOJAH_SECRET_KEY?: string; DOJAH_BASE_URL?: string }
export interface Identity { firstName: string; middleName: string; lastName: string; dob: string }

export const kycEnabled = (e: KycEnv) => !!(e.DOJAH_APP_ID && e.DOJAH_SECRET_KEY)

export async function lookupId(type: 'nin' | 'bvn', number: string, env: KycEnv, f: Fetch = fetch): Promise<Identity | null> {
  const base = (env.DOJAH_BASE_URL || 'https://api.dojah.io').replace(/\/$/, '')
  const r = await f(`${base}/api/v1/kyc/${type}?${type}=${encodeURIComponent(number)}`, {
    headers: { AppId: env.DOJAH_APP_ID!, Authorization: env.DOJAH_SECRET_KEY! }, signal: AbortSignal.timeout(20000),
  })
  if (r.status === 404 || r.status === 400) return null
  if (!r.ok) throw new Error(r.status === 402 ? 'ID checks are paused (KYC provider balance). Try later.' : `ID check failed (${r.status}), try again later`)
  const e = ((await r.json()) as { entity?: Record<string, string> }).entity
  if (!e) return null
  return { firstName: e.first_name ?? e.firstname ?? '', middleName: e.middle_name ?? e.middlename ?? '', lastName: e.last_name ?? e.surname ?? e.lastname ?? '', dob: normDate(e.date_of_birth ?? e.dateOfBirth ?? e.birthdate ?? '') }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** Accepts 1990-01-31, 31-01-1990, 31/01/1990, 31-Jan-1990 → 1990-01-31. */
export function normDate(s: string): string {
  const t = s.trim().slice(0, 11)
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/)
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

export const nameTokens = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 1)

/** The ID's first AND last name must both appear in the name the user signed up with (any order). */
export function idMatchesName(id: Identity, fullName: string) {
  const mine = new Set(nameTokens(fullName))
  const first = nameTokens(id.firstName), last = nameTokens(id.lastName)
  return first.length > 0 && last.length > 0 && first.every((w) => mine.has(w)) && last.every((w) => mine.has(w))
}

/** A bank account belongs to the verified person if at least two of its name words match the legal name. */
export function accountMatchesName(accountName: string, legalName: string) {
  const legal = new Set(nameTokens(legalName))
  return nameTokens(accountName).filter((w) => legal.has(w)).length >= 2
}
