// Live mode: pay for a bus / airport ticket from the Luda wallet (Lira, or Naira at today's rate).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReviewAndPin, errMsg } from './LiveMoney'
import { Success } from './ui'
import { api, money, type Cur, type LiveTicket } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { toLocalTicket } from '../lib/liveTickets'
import { useStore } from '../lib/store'
import type { Ticket } from '../lib/tickets'

export interface TicketOrder {
  operatorId: string; city?: string; return: boolean; pax: number; from: string; to: string
  date: string; time: string; returnDate?: string; returnTime?: string; holder: string
}

export function LiveTicketPay({ order, total, ready, onDone }: { operator: string; ticketKind: Ticket['kind']; order: TicketOrder; total: number; ready: boolean; onDone: () => void }) {
  const { s, set, reward, allow } = useStore()
  const { me, refresh } = useLive()
  const [cur, setCur] = useState<Cur>('TRY')
  const [rate, setRate] = useState<{ ngnPerTry: number; margin: number } | null>(null)
  const [review, setReview] = useState(false)
  const [made, setMade] = useState<Ticket | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api('GET', 'rate').then(setRate).catch((e) => setErr(errMsg(e))) }, [])
  const cost = cur === 'TRY' ? Math.round(total * 100) : rate ? Math.ceil(total * 100 * rate.ngnPerTry * (1 + rate.margin)) : 0
  const bal = me?.balances[cur] ?? 0
  const enough = cost > 0 && bal >= cost

  if (review) return (
    <ReviewAndPin
      rows={[['Trip', `${order.from} → ${order.to}`], ['When', `${order.date} · ${order.time}${order.return ? ` (return ${order.returnDate} · ${order.returnTime})` : ''}`], ['Passengers', String(order.pax)], ['You pay', <b key="v">{money(cost, cur)}</b>]]}
      holdLabel="Hold to pay" onClose={() => setReview(false)}
      run={async (pin) => {
        const r = await api<{ ticket: LiveTicket }>('POST', 'ticket', { currency: cur, item: order, pin, expectMinor: cost })
        const tk = toLocalTicket(r.ticket, s.name)
        set((p) => ({ ...p, tickets: [tk, ...p.tickets.filter((x) => x.payRef !== tk.payRef)] }))
        reward(s.quests.includes('ticket') ? 10 : 50, { quest: 'ticket', badge: 'traveller', title: 'Ticket booked' })
        setMade(tk); await refresh()
      }}
      done={<Success title="Ticket booked 🎟️" sub={made ? `${made.from} → ${made.to} · ${made.time}. Code ${made.code}. Find it under "My tickets".` : ''} onClose={onDone} />} />
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="label">Pay from</p>
      <div className="grid grid-cols-2 gap-2">
        {(['TRY', 'NGN'] as Cur[]).map((c) => (
          <button key={c} onClick={() => setCur(c)} className={`glass flex flex-col items-start gap-1 rounded-2xl p-3 text-start ${cur === c ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
            <span className="text-sm font-semibold">{c === 'TRY' ? '🇹🇷 Lira wallet' : '🇳🇬 Naira wallet'}</span>
            <span className="text-xs text-slate-400">{me ? money(me.balances[c], c) : '…'}</span>
          </button>
        ))}
      </div>
      {cur === 'NGN' && rate && <p className="text-xs text-slate-400">≈ {money(cost, 'NGN')} at today's rate (₺1 = ₦{rate.ngnPerTry.toFixed(2)} + {(rate.margin * 100).toFixed(1)}%)</p>}
      {cost > 0 && !enough && <p className="text-sm text-rose-300">Not enough in your {cur === 'TRY' ? 'Lira' : 'Naira'} wallet. <Link to="/wallet?a=deposit" className="underline">Top up</Link>{cur === 'TRY' ? <> or <Link to="/wallet?a=convert" className="underline">convert Naira</Link></> : null}.</p>}
      <p className="text-[11px] text-slate-500">Ride Saver discounts aren't applied to real-money tickets yet.</p>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      <button className="btn-primary py-4" disabled={!ready || !enough} onClick={() => { if (allow('ticket')) setReview(true) }}>Review · {cost ? money(cost, cur) : '…'}</button>
    </div>
  )
}
