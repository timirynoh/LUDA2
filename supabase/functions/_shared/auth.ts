// Accounts via Supabase Auth (GoTrue REST). The server checks every request's token.
import type { Fetch } from './providers.ts'

export interface AuthEnv { SUPABASE_URL: string; AUTH_KEY: string } // AUTH_KEY: anon/publishable key (or service key)
export interface Session { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } }
export interface AuthUser { id: string; email: string; user_metadata?: Record<string, unknown> }

async function gt(env: AuthEnv, f: Fetch, path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const r = await f(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/${path}`, {
    method: init.method ?? 'POST',
    headers: { apikey: env.AUTH_KEY, 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(15000),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, any>
  return { ok: r.ok, status: r.status, j }
}

export async function userFromToken(token: string, env: AuthEnv, f: Fetch = fetch): Promise<AuthUser | null> {
  if (!token) return null
  const r = await gt(env, f, 'user', { method: 'GET', token })
  return r.ok && r.j.id ? { id: r.j.id, email: r.j.email, user_metadata: r.j.user_metadata } : null
}

export async function signUp(email: string, password: string, data: Record<string, unknown>, env: AuthEnv, f: Fetch = fetch) {
  const r = await gt(env, f, 'signup', { body: { email, password, data } })
  if (!r.ok) throw new Error(friendly(r.j))
  // With email confirmation on, Supabase returns the user without a session.
  const userId = String(r.j.user?.id ?? r.j.id ?? '')
  return r.j.access_token ? { session: r.j as Session, userId } : { session: null, userId }
}

export async function signIn(email: string, password: string, env: AuthEnv, f: Fetch = fetch): Promise<Session> {
  const r = await gt(env, f, 'token?grant_type=password', { body: { email, password } })
  if (!r.ok) throw new Error(/confirm/i.test(JSON.stringify(r.j)) ? 'Please confirm your email first (check your inbox)' : 'Wrong username/email or password')
  return r.j as Session
}

export async function refresh(refreshToken: string, env: AuthEnv, f: Fetch = fetch): Promise<Session> {
  const r = await gt(env, f, 'token?grant_type=refresh_token', { body: { refresh_token: refreshToken } })
  if (!r.ok) throw new Error('Session expired, please sign in again')
  return r.j as Session
}

/** Sends a reset link. Always "succeeds" so nobody can probe which emails have accounts. */
export async function recover(email: string, redirectTo: string, env: AuthEnv, f: Fetch = fetch) {
  await gt(env, f, `recover?redirect_to=${encodeURIComponent(redirectTo)}`, { body: { email } }).catch(() => {})
}

/** Sets a new password using the access token from the reset link. */
export async function setPassword(accessToken: string, password: string, env: AuthEnv, f: Fetch = fetch) {
  const r = await gt(env, f, 'user', { method: 'PUT', token: accessToken, body: { password } })
  if (!r.ok) throw new Error(r.status === 401 ? 'This reset link has expired. Ask for a new one.' : friendly(r.j))
}

function friendly(j: Record<string, any>) {
  const m = String(j.msg ?? j.error_description ?? j.message ?? 'Sign-up failed')
  if (/already registered|exists/i.test(m)) return 'An account with this email already exists. Sign in instead.'
  if (/password/i.test(m)) return 'Choose a stronger password (at least 8 characters)'
  return m
}

/* ---------------------------------- PIN ---------------------------------- */
const enc = new TextEncoder()
export async function hashPin(pin: string, salt: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100_000 }, k, 256)
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export function randomHex(n = 16) { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join('') }
