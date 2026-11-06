// Minimal WebAuthn (passkey) verification with Web Crypto: ES256 and RS256, no attestation.
// Registration trusts the public key the browser reports (getPublicKey()); every later
// approval must be signed by that key over our one-time challenge, with user verification.

export const b64u = {
  enc(u: Uint8Array) { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') },
  dec(s: string) { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)) },
}
const sha256 = async (d: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", d as BufferSource))
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i])

export interface Expect { challenge: string; origins: string[]; rpId: string }
export class WebAuthnError extends Error {}

function clientData(raw: string, type: 'webauthn.create' | 'webauthn.get', e: Expect) {
  let cd: { type?: string; challenge?: string; origin?: string }
  try { cd = JSON.parse(new TextDecoder().decode(b64u.dec(raw))) } catch { throw new WebAuthnError('bad client data') }
  if (cd.type !== type) throw new WebAuthnError('wrong type')
  if (cd.challenge !== e.challenge) throw new WebAuthnError('wrong challenge')
  if (!e.origins.includes(String(cd.origin))) throw new WebAuthnError('wrong origin')
}

export function checkRegistration(clientDataJSON: string, e: Expect) { clientData(clientDataJSON, 'webauthn.create', e) }

/** DER-encoded ECDSA signature → raw r||s (what Web Crypto expects). */
function derToRaw(der: Uint8Array, n = 32) {
  if (der[0] !== 0x30) throw new WebAuthnError('bad signature')
  let i = 2
  const part = () => {
    if (der[i++] !== 0x02) throw new WebAuthnError('bad signature')
    const len = der[i++]; let v = der.slice(i, i + len); i += len
    while (v.length > n && v[0] === 0) v = v.slice(1)
    const out = new Uint8Array(n); out.set(v, n - v.length); return out
  }
  const r = part(), s = part(), raw = new Uint8Array(2 * n); raw.set(r); raw.set(s, n); return raw
}

export interface Assertion { id: string; clientDataJSON: string; authenticatorData: string; signature: string }

/** Verifies a fingerprint approval. Returns the new signature counter. */
export async function verifyAssertion(key: { public_key: string; alg: number; counter: number }, a: Assertion, e: Expect): Promise<number> {
  clientData(a.clientDataJSON, 'webauthn.get', e)
  const ad = b64u.dec(a.authenticatorData)
  if (ad.length < 37) throw new WebAuthnError('bad authenticator data')
  if (!eq(ad.slice(0, 32), await sha256(new TextEncoder().encode(e.rpId)))) throw new WebAuthnError('wrong site')
  const flags = ad[32]
  if (!(flags & 0x01) || !(flags & 0x04)) throw new WebAuthnError('fingerprint not verified') // user present + user verified
  const count = ((ad[33] << 24) >>> 0) + (ad[34] << 16) + (ad[35] << 8) + ad[36]
  const data = new Uint8Array(ad.length + 32); data.set(ad); data.set(await sha256(b64u.dec(a.clientDataJSON)), ad.length)
  const es = key.alg === -7
  if (!es && key.alg !== -257) throw new WebAuthnError('unsupported key')
  const pub = await crypto.subtle.importKey('spki', b64u.dec(key.public_key) as BufferSource, es ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const sig = es ? derToRaw(b64u.dec(a.signature)) : b64u.dec(a.signature)
  const ok = await crypto.subtle.verify(es ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5', pub, sig as BufferSource, data as BufferSource)
  if (!ok) throw new WebAuthnError('bad signature')
  if (count > 0 && count <= Number(key.counter)) throw new WebAuthnError('replayed or cloned key')
  return count
}
