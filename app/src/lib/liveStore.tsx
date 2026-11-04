// Keeps the signed-in user's real wallet (from the server) in React state.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { LIVE, api, clearRef, clearSession, getSession, liveConfig, pendingRef, type Me } from './live'
import { useStore } from './store'
import { toLocalTicket } from './liveTickets'

/** Rewards worked out by the server (XP, points, streak, badges, quests, challenges, referral). The phone only shows them. */
export interface Rewards {
  xp: number; points: number; streak: number; checkedInToday: boolean; spunToday: boolean; badges: string[]; quests: string[]; questXp: Record<string, number>
  cashEarned: number; recent: { kind: string; xp: number; points: number; cash: number; note: string | null; at: string }[]
  challenges: { id: string; goal: number; progress: number; prize: string; claimed: boolean }[]
  spin: { label: string; cash: boolean }[]; redeem: { id: string; pts: number; cash: number; label: string }[]; verified: boolean
  referral: { code: string; reward: number; welcome: number; perMonthCap: number; tiers: { id: string; min: number; cash: number }[]; verifiedFriends: number; invitedBy: boolean }
}
interface LiveCtx { me: Me | null; rewards: Rewards | null; loading: boolean; error: string; refresh: () => Promise<Me | null>; refreshRewards: () => Promise<void> }
const Ctx = createContext<LiveCtx>({ me: null, rewards: null, loading: false, error: '', refresh: async () => null, refreshRewards: async () => {} })
export const useLive = () => useContext(Ctx)

export function LiveProvider({ children }: { children: ReactNode }) {
  const { s, set } = useStore()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rewards, setRewards] = useState<Rewards | null>(null)
  const refreshRewards = useCallback(async () => {
    if (!LIVE || !getSession()) return
    try {
      const r = await api<Rewards>('GET', 'rewards')
      setRewards(r)
      // Mirror for display only (level ring, points, streak, badges on Home/Profile). The server is the source of truth.
      set((p) => ({ ...p, xp: r.xp, points: r.points, streak: r.streak, badges: r.badges, quests: r.quests }))
    } catch { /* keep the last values */ }
  }, [set])

  const refresh = useCallback(async () => {
    if (!LIVE || !getSession()) return null
    setLoading(true)
    try {
      const m = await api<Me>('GET', 'me')
      setMe(m); setError('')
      // Mirror server identity/KYC into the local app so screens and tier gates agree with the server.
      const kyc = m.profile.kyc === 'verified' ? 'verified' : m.profile.kyc === 'failed' ? 'rejected' : m.profile.kyc === 'pending' ? 'pending' : 'none'
      // Phone: verified by SMS on the server; if SMS checks aren't switched on yet, a real account counts as level 1.
      const sms = await liveConfig().then((c) => c.sms).catch(() => false)
      const phone = m.profile.phoneVerified || !sms
      const adm = !!m.profile.isAdmin // the admin menu shows only for server-confirmed admins
      set((p) => (p.kyc.status === kyc && p.verified === (kyc === 'verified') && p.security.frozen === m.profile.frozen && p.phoneVerified === phone && p.isAdmin === adm ? p
        : { ...p, isAdmin: adm, shortcuts: adm ? (p.shortcuts.includes('admin') ? p.shortcuts : [...p.shortcuts.slice(0, 7), 'admin']) : p.shortcuts.filter((x) => x !== 'admin'), verified: kyc === 'verified', phoneVerified: phone, kyc: { ...p.kyc, status: kyc }, security: { ...p.security, frozen: m.profile.frozen } }))
      // Tickets bought on another phone appear here too.
      set((p) => {
        const missing = m.tickets.filter((t) => !p.tickets.some((x) => x.payRef === t.id))
        return missing.length ? { ...p, tickets: [...missing.map((t) => toLocalTicket(t, p.name)), ...p.tickets] } : p
      })
      // Signed up with Google from an invite link: hand the code to the server once (it checks the 14-day window and 'only once').
      const ref = pendingRef()
      if (ref) { clearRef(); void api('POST', 'referral-apply', { code: ref }).catch(() => {}) }
      void refreshRewards()
      return m
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your wallet'); return null } finally { setLoading(false) }
  }, [set, refreshRewards])

  // Load when signed in, refresh on focus and every minute while open.
  useEffect(() => {
    if (!LIVE || !s.signedIn) return
    void refresh() // eslint-disable-line react-hooks/set-state-in-effect -- fetching from the server
    const onFocus = () => document.visibilityState === 'visible' && refresh()
    const id = setInterval(onFocus, 60_000)
    document.addEventListener('visibilitychange', onFocus)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onFocus) }
  }, [s.signedIn, refresh])

  // Signing out locally ends the server session too; an expired session signs the app out.
  // Only on a real sign-out (signed in → signed out), never on first load: a Google sign-in may have just
  // stored a fresh session before the app state catches up.
  const wasIn = useRef(s.signedIn)
  useEffect(() => {
    if (!LIVE) return
    if (wasIn.current && !s.signedIn && getSession()) { clearSession(); setMe(null) } // eslint-disable-line react-hooks/set-state-in-effect
    wasIn.current = s.signedIn
    const out = () => set((p) => ({ ...p, signedIn: false }))
    const rw = () => void refreshRewards()
    window.addEventListener('luda:signedout', out)
    window.addEventListener('luda:rewards', rw)
    return () => { window.removeEventListener('luda:signedout', out); window.removeEventListener('luda:rewards', rw) }
  }, [s.signedIn, set, refreshRewards])

  return <Ctx.Provider value={{ me, rewards, loading, error, refresh, refreshRewards }}>{children}</Ctx.Provider>
}
