// Keeps the signed-in user's real wallet (from the server) in React state.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { LIVE, api, clearSession, getSession, liveConfig, type Me } from './live'
import { useStore } from './store'
import { toLocalTicket } from './liveTickets'

interface LiveCtx { me: Me | null; loading: boolean; error: string; refresh: () => Promise<Me | null> }
const Ctx = createContext<LiveCtx>({ me: null, loading: false, error: '', refresh: async () => null })
export const useLive = () => useContext(Ctx)

export function LiveProvider({ children }: { children: ReactNode }) {
  const { s, set } = useStore()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      set((p) => (p.kyc.status === kyc && p.verified === (kyc === 'verified') && p.security.frozen === m.profile.frozen && p.phoneVerified === phone ? p
        : { ...p, verified: kyc === 'verified', phoneVerified: phone, kyc: { ...p.kyc, status: kyc }, security: { ...p.security, frozen: m.profile.frozen } }))
      // Tickets bought on another phone appear here too.
      set((p) => {
        const missing = m.tickets.filter((t) => !p.tickets.some((x) => x.payRef === t.id))
        return missing.length ? { ...p, tickets: [...missing.map((t) => toLocalTicket(t, p.name)), ...p.tickets] } : p
      })
      return m
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your wallet'); return null } finally { setLoading(false) }
  }, [set])

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
    window.addEventListener('luda:signedout', out)
    return () => window.removeEventListener('luda:signedout', out)
  }, [s.signedIn, set])

  return <Ctx.Provider value={{ me, loading, error, refresh }}>{children}</Ctx.Provider>
}
