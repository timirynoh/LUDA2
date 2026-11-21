const enc = new TextEncoder()

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256(text: string) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

/** PINs are never stored in plain text — only a salted hash. */
export const hashPin = (pin: string, salt: string) => sha256(`${salt}:${pin}`)

export function randomSecret(bytes = 20) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Rotating 6-digit handshake code (TOTP-style, RFC 6238 truncation) bound to a trade.
 * Each trade gets its own secret; codes rotate every 30s so a screenshot or
 * overheard code is useless moments later.
 */
export async function handshakeCode(secret: string, tradeId: string, at = Date.now(), step = 30) {
  const counter = Math.floor(at / 1000 / step)
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${tradeId}:${counter}`)))
  const off = mac[mac.length - 1] & 0x0f
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

/** Accept the current code or the previous window (clock skew tolerance). */
export async function verifyHandshake(secret: string, tradeId: string, code: string) {
  const now = Date.now()
  for (const t of [now, now - 30_000]) if ((await handshakeCode(secret, tradeId, t)) === code) return true
  return false
}
