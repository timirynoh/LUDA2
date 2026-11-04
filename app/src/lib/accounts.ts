// Several Luda accounts on one phone (live mode). Each account keeps its own on-phone data (set-up, city, PIN lock,
// fingerprint, inbox…), saved when someone else signs in and restored when that account comes back, so switching
// never wipes anyone's set-up. Passwords are never stored here: only usernames and display names.
import type { State } from './store'

const KNOWN = 'luda.knownAccounts'
const SNAP = (u: string) => `luda.acct.${u}`
const BIO = 'luda.bio'
const MAX = 4

export interface KnownAccount { username: string; name: string; at: number }
export function knownAccounts(): KnownAccount[] { try { return JSON.parse(localStorage.getItem(KNOWN) ?? '[]') } catch { return [] } }
export function rememberAccount(username: string, name: string) {
  const list = [{ username, name, at: Date.now() }, ...knownAccounts().filter((a) => a.username !== username)]
  for (const old of list.slice(MAX)) { try { localStorage.removeItem(SNAP(old.username)); localStorage.removeItem(`${BIO}.${old.username}`) } catch { /* ignore */ } }
  try { localStorage.setItem(KNOWN, JSON.stringify(list.slice(0, MAX))) } catch { /* ignore */ }
}
export function forgetAccount(username: string) {
  try { localStorage.setItem(KNOWN, JSON.stringify(knownAccounts().filter((a) => a.username !== username))); localStorage.removeItem(SNAP(username)); localStorage.removeItem(`${BIO}.${username}`) } catch { /* ignore */ }
}

/** Returns the phone's state for `who` after a successful sign-in (same account: unchanged; another: swapped). */
export function switchAccount(p: State, who: { username: string; email: string; fullName: string }, stay: boolean): State {
  const account = { email: who.email, username: who.username, passHash: '', salt: '', stay }
  const first = who.fullName.split(' ')[0] || 'Friend'
  rememberAccount(who.username, who.fullName)
  if (p.account?.username === who.username) return { ...p, account, name: p.name || first }
  try {
    // Park the previous person's data (and their fingerprint key) so it is there when they come back.
    if (p.account?.username) {
      localStorage.setItem(SNAP(p.account.username), JSON.stringify({ ...p, signedIn: false }))
      const bio = localStorage.getItem(BIO)
      if (bio) localStorage.setItem(`${BIO}.${p.account.username}`, bio)
    }
    localStorage.removeItem(BIO)
    const bio = localStorage.getItem(`${BIO}.${who.username}`)
    if (bio) localStorage.setItem(BIO, bio)
    const saved = localStorage.getItem(SNAP(who.username))
    if (saved) {
      const back = JSON.parse(saved) as State
      // Phone-wide preferences stay as they are now.
      return { ...p, ...back, lang: p.lang, theme: p.theme, account, name: back.name || first }
    }
  } catch { /* storage full or blocked: fall through to a fresh start */ }
  // Someone new on this phone: their own set-up (PIN step, city…), nothing of the previous person's shown.
  return { ...p, account, name: first, onboarded: false, pinHash: '', salt: '', tickets: [], txs: [], inbox: [], toured: false, logins: [], isAdmin: false }
}
