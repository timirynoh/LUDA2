// Fingerprint / Face ID with WebAuthn (passkeys on this phone's secure chip).
// - Unlock: checked on the phone (it only opens the app; money still needs the server).
// - Payments (live mode): the server sends a one-time challenge and verifies the signed answer.
import { LIVE, api } from './live'

const KEY = 'luda.bio'
interface Saved { id: string; server: boolean }
const enc = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const dec = (s: string): Uint8Array<ArrayBuffer> => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0)) }
const rand = (n = 32): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(n))

export const bioSaved = (): Saved | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null } }
export const bioOn = () => !!bioSaved()

export async function bioSupported() {
  try { return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) } catch { return false }
}

const device = () => { const ua = navigator.userAgent; return /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android phone' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : 'Device' }

function friendly(e: unknown): Error {
  const n = (e as { name?: string })?.name
  if (n === 'NotAllowedError') return new Error('Fingerprint cancelled or not recognised')
  if (n === 'InvalidStateError') return new Error('This phone is already set up')
  return e instanceof Error ? e : new Error('Fingerprint is not available on this phone')
}

/** Turn on fingerprint for this phone. Live mode registers it on the server (needs the PIN). */
export async function enrollBio(pin: string, user: { username: string; fullName: string }) {
  let challenge = rand(), userId = rand(16), server = false
  if (LIVE) { const g = await api('GET', 'bio'); challenge = dec(g.challenge); userId = dec(g.userId); server = true }
  let cred: PublicKeyCredential
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        challenge, rp: { name: 'Luda', id: location.hostname },
        user: { id: userId, name: user.username, displayName: user.fullName },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000, attestation: 'none',
      },
    })) as PublicKeyCredential
  } catch (e) { throw friendly(e) }
  const r = cred.response as AuthenticatorAttestationResponse
  if (server) {
    const pk = r.getPublicKey?.()
    if (!pk) throw new Error('Update your browser to use fingerprint with Luda')
    await api('POST', 'bio', { pin, id: cred.id, publicKey: enc(pk), alg: r.getPublicKeyAlgorithm(), clientDataJSON: enc(r.clientDataJSON), device: device() })
  }
  localStorage.setItem(KEY, JSON.stringify({ id: cred.id, server } satisfies Saved))
}

async function getAssertion(challenge: Uint8Array<ArrayBuffer>, id: string) {
  try {
    return (await navigator.credentials.get({
      publicKey: { challenge, allowCredentials: [{ type: 'public-key', id: dec(id) }], userVerification: 'required', rpId: location.hostname, timeout: 60_000 },
    })) as PublicKeyCredential
  } catch (e) { throw friendly(e) }
}

/** Unlock the app with the fingerprint (checked by the phone). */
export async function bioUnlock() {
  const s = bioSaved(); if (!s) return false
  await getAssertion(rand(), s.id)
  return true
}

/** Fingerprint approval for a money action (live): send this as `bio` instead of `pin`. */
export async function bioApprove() {
  const s = bioSaved()
  if (!s?.server) throw new Error('Fingerprint is not set up for payments')
  const g = await api('GET', 'bio')
  const a = await getAssertion(dec(g.challenge), s.id)
  const r = a.response as AuthenticatorAssertionResponse
  return { id: a.id, clientDataJSON: enc(r.clientDataJSON), authenticatorData: enc(r.authenticatorData), signature: enc(r.signature) }
}

export async function disableBio() {
  const s = bioSaved()
  localStorage.removeItem(KEY)
  if (s?.server && LIVE) await api('POST', 'bio-remove', { id: s.id }).catch(() => {})
}
