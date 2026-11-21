import { useEffect } from 'react'
import { useStore } from './store'

/**
 * Demo progression for jobs you offered to do as a fixer:
 * offer sent → requester accepts (money locked in escrow) → you finish → they confirm → you're paid.
 */
export function useGigProgress() {
  const { s, set, toast, reward, addTx } = useStore()
  useEffect(() => {
    if (!s.gigs.some((g) => g.status === 'sent' || g.status === 'done')) return
    const id = setInterval(() => {
      const now = Date.now()
      for (const g of s.gigs) {
        if (g.status === 'sent' && now - g.at > 6000) {
          set((p) => ({ ...p, gigs: p.gigs.map((x) => (x.reqId === g.reqId ? { ...x, status: 'accepted', at: now } : x)) }))
          toast({ title: `${g.from} accepted your offer. ₺${g.price} is locked in escrow`, emoji: '🔒' })
        }
        if (g.status === 'done' && now - g.at > 4000) {
          set((p) => ({ ...p, gigs: p.gigs.map((x) => (x.reqId === g.reqId ? { ...x, status: 'paid' } : x)), balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) + g.price } }))
          addTx({ type: 'p2p', amount: g.price, currency: 'TRY', label: `Flash job paid · ${g.from}`, meta: 'escrow released' })
          reward(60, { badge: 'handy_hero', title: `${g.from} confirmed. You got ₺${g.price}` })
        }
      }
    }, 1500)
    return () => clearInterval(id)
  }, [s.gigs, set, toast, reward, addTx])
}
