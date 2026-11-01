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

/* ----------------------- Didit: document + selfie KYC ----------------------- */
// Hosted flow: we create a session, the user photographs their ID and takes a live selfie on
// Didit's page, then we ask Didit for the decision ourselves (never trusting the browser).

export interface DiditEnv { DIDIT_API_KEY?: string; DIDIT_WORKFLOW_ID?: string; DIDIT_WEBHOOK_SECRET?: string; DIDIT_BASE_URL?: string }
export const diditEnabled = (e: DiditEnv) => !!(e.DIDIT_API_KEY && e.DIDIT_WORKFLOW_ID)
const diditBase = (e: DiditEnv) => (e.DIDIT_BASE_URL || 'https://verification.didit.me').replace(/\/$/, '')

export async function diditStart(userId: string, callback: string, env: DiditEnv, f: Fetch = fetch) {
  const r = await f(`${diditBase(env)}/v3/session/`, {
    method: 'POST', headers: { 'x-api-key': env.DIDIT_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ workflow_id: env.DIDIT_WORKFLOW_ID, vendor_data: userId, callback }), signal: AbortSignal.timeout(20000),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, any>
  if (!r.ok || !j.url || !j.session_id) throw new Error(r.status === 401 || r.status === 403 ? 'ID checks are misconfigured (Didit key). Contact support.' : 'Could not start the ID check. Try again.')
  return { sessionId: String(j.session_id), url: String(j.url) }
}

export interface DiditResult { status: 'approved' | 'declined' | 'pending' | 'not_started'; name: string; firstName: string; lastName: string; dob: string; docType: string; docNumber: string; country: string; raw: string }

export async function diditDecision(sessionId: string, env: DiditEnv, f: Fetch = fetch): Promise<DiditResult> {
  const r = await f(`${diditBase(env)}/v3/session/${encodeURIComponent(sessionId)}/decision/`, { headers: { 'x-api-key': env.DIDIT_API_KEY! }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`ID check status unavailable (${r.status})`)
  const j = (await r.json()) as Record<string, any>
  const raw = String(j.status ?? '')
  const s = raw.toLowerCase()
  const id = ((Array.isArray(j.id_verifications) ? j.id_verifications[0] : j.id_verification) ?? {}) as Record<string, any>
  const firstName = String(id.first_name ?? ''), lastName = String(id.last_name ?? '')
  return {
    status: s === 'approved' ? 'approved' : s === 'declined' || s === 'abandoned' || s === 'expired' ? 'declined' : s === 'not started' ? 'not_started' : 'pending',
    name: String(id.full_name || [firstName, lastName].filter(Boolean).join(' ')), firstName, lastName,
    dob: normDate(String(id.date_of_birth ?? '')), docType: String(id.document_type ?? 'document'), docNumber: String(id.document_number ?? id.personal_number ?? ''),
    country: String(id.issuing_state ?? id.issuing_state_name ?? id.nationality ?? ''), raw,
  }
}

/** Didit signs webhooks with HMAC-SHA256 (hex) of the raw body (X-Signature). */
export async function diditSignatureOk(raw: string, sig: string | null, env: DiditEnv) {
  if (!env.DIDIT_WEBHOOK_SECRET || !sig) return false
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.DIDIT_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, '0')).join('')
  return mac.length === sig.length && [...mac].every((c, i) => c === sig[i])
}

export async function docHash(docType: string, country: string, number: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${docType}|${country}|${number}`.toLowerCase().replace(/\s/g, '')))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
