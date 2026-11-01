// Private file storage (Supabase Storage) for support-case photos. Server-only (service key).
import type { Fetch } from './providers.ts'

export const BUCKET = 'case-files'
export const MAX_FILE_BYTES = 2_000_000
export const ALLOWED_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }

export interface StorageEnv { SUPABASE_URL: string; SERVICE_KEY?: string }
const hdr = (env: StorageEnv): Record<string, string> => {
  const k = env.SERVICE_KEY ?? ''
  return k.startsWith('sb_') ? { apikey: k } : { apikey: k, authorization: `Bearer ${k}` }
}

export async function putFile(env: StorageEnv, path: string, bytes: Uint8Array, type: string, f: Fetch = fetch) {
  const r = await f(`${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { ...hdr(env), 'content-type': type, 'x-upsert': 'false' }, body: bytes as BodyInit, signal: AbortSignal.timeout(30000),
  })
  if (!r.ok) throw new Error(`Upload failed (${r.status})`)
}

/** A link that works for 10 minutes. */
export async function signedUrl(env: StorageEnv, path: string, f: Fetch = fetch) {
  const base = env.SUPABASE_URL.replace(/\/$/, '')
  const r = await f(`${base}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST', headers: { ...hdr(env), 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 600 }), signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) return null
  const j = (await r.json().catch(() => ({}))) as { signedURL?: string; signedUrl?: string }
  const u = j.signedURL ?? j.signedUrl
  return u ? (u.startsWith('http') ? u : `${base}/storage/v1${u}`) : null
}

/** Decodes and checks an uploaded file ({ type, data: base64 }). */
export function decodeFile(file: { type?: unknown; data?: unknown }) {
  const type = String(file.type ?? '')
  if (!ALLOWED_TYPES[type]) throw new Error('Only photos (JPG, PNG, WEBP) or PDF files can be attached')
  const b64 = String(file.data ?? '').replace(/^data:[^,]+,/, '')
  let bin: string
  try { bin = atob(b64) } catch { throw new Error('Could not read the attached file') }
  if (bin.length > MAX_FILE_BYTES) throw new Error('Each file must be under 2 MB')
  return { type, ext: ALLOWED_TYPES[type], bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)) }
}
