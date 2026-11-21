// Web Push (v1.17.0): sends notifications to phones even when Luda is closed. Standard protocol, no third-party
// service: VAPID (RFC 8292) signs who we are, RFC 8291 (aes128gcm) encrypts the message so only that phone can read it.
// Uses only WebCrypto, so it runs the same on Supabase Edge (Deno) and in the Node tests.

type Fetch = typeof fetch
const enc = new TextEncoder()
/** WebCrypto wants plain ArrayBuffer-backed views (stricter TS lib types). */
const B = (u: Uint8Array) => u as unknown as BufferSource

export const b64u = {
  enc(b: Uint8Array) { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') },
  dec(s: string) { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(t, (c) => c.charCodeAt(0)) },
}

export interface Vapid { publicKey: string; privateJwk: JsonWebKey }

/** Makes a fresh VAPID key pair (P-256). publicKey = raw uncompressed point, base64url (what browsers need). */
export async function newVapid(): Promise<Vapid> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
  return { publicKey: b64u.enc(raw), privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) }
}

async function vapidAuth(endpoint: string, v: Vapid, subject: string) {
  const aud = new URL(endpoint).origin
  const header = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u.enc(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })))
  const key = await crypto.subtle.importKey('jwk', { ...v.privateJwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, B(enc.encode(`${header}.${claims}`))))
  return `vapid t=${header}.${claims}.${b64u.enc(sig)}, k=${v.publicKey}`
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', B(ikm), 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: B(salt), info: B(info) }, k, len * 8))
}
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length } return o }

/** RFC 8291 message encryption (aes128gcm, one record). */
export async function encryptPayload(payload: Uint8Array, p256dh: string, auth: string) {
  const uaPublic = b64u.dec(p256dh), authSecret = b64u.dec(auth)
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', B(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256))
  const ikm = await hkdf(authSecret, shared, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', B(cek), 'AES-GCM', false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: B(nonce) }, key, B(cat(payload, new Uint8Array([2])))))
  const rs = new Uint8Array([0, 0, 16, 0]) // record size 4096
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct)
}

export interface PushSub { endpoint: string; p256dh: string; auth: string }
export interface PushMsg { title: string; body?: string; url?: string; tag?: string }

/** Push services we deliver to (Chrome/Android, Firefox, Safari/iOS, Edge). Anything else is refused (no SSRF). */
export function pushHostOk(endpoint: string, allowTest = false) {
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:') return false
    const h = u.hostname
    return h === 'fcm.googleapis.com' || h === 'updates.push.services.mozilla.com' || h.endsWith('.push.apple.com')
      || h.endsWith('.notify.windows.com') || h === 'android.googleapis.com' || (allowTest && h.endsWith('.push.test'))
  } catch { return false }
}

/** Sends one notification. Returns 'ok', 'gone' (subscription expired: delete it) or 'fail'. */
export async function sendPush(sub: PushSub, msg: PushMsg, v: Vapid, subject: string, f: Fetch = fetch): Promise<'ok' | 'gone' | 'fail'> {
  try {
    const body = await encryptPayload(enc.encode(JSON.stringify(msg)), sub.p256dh, sub.auth)
    const r = await f(sub.endpoint, {
      method: 'POST', body: B(body),
      headers: { authorization: await vapidAuth(sub.endpoint, v, subject), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'high' },
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 404 || r.status === 410) return 'gone'
    return r.ok ? 'ok' : 'fail'
  } catch { return 'fail' }
}
