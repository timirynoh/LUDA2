// Converts a ticket stored on the Luda server into the app's ticket shape (for QR display).
import { randomSecret } from './crypto'
import type { LiveTicket } from './live'
import type { Ticket } from './tickets'

const OPERATOR: Record<string, string> = { virgo: 'VirgoBus', girneliler: 'Girneliler Seyahat', kibhas: 'KIBHAS' }

export function toLocalTicket(t: LiveTicket, holder: string): Ticket {
  const i = t.item
  return {
    id: t.id, code: t.code, operator: OPERATOR[i.operatorId] ?? String(i.label ?? 'Bus').split(' · ')[0],
    from: i.from, to: i.to, date: i.date, time: i.time, returnDate: i.returnDate ?? undefined, returnTime: i.returnTime ?? undefined,
    pax: i.pax, total: Number(t.base_amount), saved: 0, paidWith: t.paid_currency === 'TRY' ? 'wallet' : 'home',
    paidCur: t.paid_currency, paidAmount: t.paid_minor / 100, createdAt: Date.parse(t.created_at), status: t.status === 'refunded' ? 'refunded' : 'valid',
    kind: i.operatorId === 'kibhas' ? 'shuttle' : 'bus', holder: i.holder || holder, secret: randomSecret(), payRef: t.id,
  }
}
