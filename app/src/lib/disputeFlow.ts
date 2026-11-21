import { useEffect } from 'react'
import { uid, useStore } from './store'
import type { ThreadMsg } from './threads'

/**
 * Demo support desk: picks up new cases, asks for evidence if missing,
 * and resolves after the user replies (refund for the user in this demo).
 */
export function useDisputeProgress() {
  const { s, set, notify } = useStore()
  useEffect(() => {
    const open = s.disputes.filter((d) => d.status !== 'resolved')
    if (!open.length) return
    const t = setInterval(() => {
      const now = Date.now()
      for (const d of open) {
        const msg = (text: string): ThreadMsg => ({ id: uid(), from: 'support', text, ts: now })
        const age = now - d.updatedAt
        if (d.status === 'submitted' && age > 4000) {
          set((p) => ({ ...p, disputes: p.disputes.map((x) => (x.id === d.id ? { ...x, status: 'review', updatedAt: now, userReplied: false } : x)), threads: { ...p.threads, [`case-${d.id}`]: [...(p.threads[`case-${d.id}`] ?? []), msg(`Hi ${p.name}, I'm Amina from Luda Support 👋🏾 I've frozen the funds and I'm reviewing your case with ${d.counterparty}. I can see the trade chat history.`)] } }))
          notify('🛡️', 'Support picked up your appeal', `/disputes/${d.id}`)
        } else if (d.status === 'review' && age > 5000 && !d.userReplied) {
          set((p) => ({ ...p, disputes: p.disputes.map((x) => (x.id === d.id ? { ...x, status: 'info', updatedAt: now } : x)), threads: { ...p.threads, [`case-${d.id}`]: [...(p.threads[`case-${d.id}`] ?? []), msg('To decide quickly, please upload any proof you have: photos, receipts or screenshots, and anything else we should know.')] } }))
          notify('📎', 'Support asked for evidence on your appeal', `/disputes/${d.id}`)
        } else if ((d.status === 'review' || d.status === 'info') && d.userReplied && age > 5000) {
          resolve(d.id, d.kind, d.refId, d.amount, d.cur)
        }
      }
    }, 1500)
    return () => clearInterval(t)

    function resolve(id: string, kind: string, refId: string, amount: number, cur: string) {
      const now = Date.now()
      const outcome = `Resolved in your favour: ${Math.round(amount).toLocaleString()} ${cur} returned to your wallet. The other party has been warned.`
      set((p) => {
        const balances = { ...p.balances, [cur]: (p.balances[cur] ?? 0) + amount }
        return {
          ...p, balances,
          trades: kind === 'swap' ? p.trades.map((x) => (x.id === refId ? { ...x, status: 'cancelled' } : x)) : p.trades,
          flash: kind === 'flash' ? p.flash.map((x) => (x.id === refId ? { ...x, status: 'cancelled' } : x)) : p.flash,
          orders: kind === 'market' ? p.orders.map((x) => (x.id === refId ? { ...x, status: 'cancelled' } : x)) : p.orders,
          disputes: p.disputes.map((x) => (x.id === id ? { ...x, status: 'resolved', outcome, updatedAt: now } : x)),
          txs: [{ id: uid(), type: 'p2p', amount, currency: cur, label: 'Appeal refund', ts: now }, ...p.txs],
          threads: { ...p.threads, [`case-${id}`]: [...(p.threads[`case-${id}`] ?? []), { id: uid(), from: 'support', text: `Thank you for the evidence. ${outcome} 🙏🏾`, ts: now }, { id: uid(), from: 'system', text: 'Case closed', ts: now }] },
        }
      })
      notify('✅', 'Your appeal was resolved', `/disputes/${id}`)
    }
  }, [s.disputes, set, notify])
}

/** Demo: exchanger applications are approved after a short review. */
export function useExchangerReview() {
  const { s, set, notify, reward } = useStore()
  useEffect(() => {
    if (s.exchanger.status !== 'pending') return
    const t = setTimeout(() => {
      set((p) => ({ ...p, exchanger: { ...p.exchanger, status: 'approved' } }))
      notify('🏪', 'You’re now a verified exchanger! Create your first ad', '/chats?tab=exchange')
      reward(100, { badge: 'exchanger', title: 'Exchanger approved' })
    }, Math.max(0, (s.exchanger.appliedAt ?? Date.now()) + 5000 - Date.now()))
    return () => clearTimeout(t)
  }, [s.exchanger.status, s.exchanger.appliedAt, set, notify, reward])
}
