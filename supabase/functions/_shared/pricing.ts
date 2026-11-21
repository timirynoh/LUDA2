// Server-side price list. The app's prices are for display only: whatever the
// phone sends, the amount charged is always computed here.
// Keep in sync with app/src/config.ts (GIRNE_LEFKOSA, KIBHAS_FARES).

export const GIRNE_LEFKOSA = { operators: { virgo: 'VirgoBus', girneliler: 'Girneliler Seyahat' } as Record<string, string>, single: 250, return: 450 }
export const KIBHAS_FARES: Record<string, number> = { lefkosa: 250, girne: 350, magusa: 300, guzelyurt: 350, lefke: 395, iskele: 300 }

export const MAX_PAX = 6
export const MAX_DAYS_AHEAD = 30

export interface TicketItem {
  type: 'ticket'
  operatorId: string // 'virgo' | 'girneliler' | 'kibhas'
  city?: string // for KIBHAS: the town end of the trip
  return: boolean
  pax: number
  from: string
  to: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  returnDate?: string
  returnTime?: string
  holder: string
}

export interface Priced { item: TicketItem; amount: number; currency: 'TRY'; label: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/
const clean = (v: unknown, max = 60) => String(v ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max)

/** Validates a ticket request and returns its price in TL, or throws a user-safe error. */
export function priceTicket(raw: Record<string, unknown>, today = new Date()): Priced {
  const operatorId = clean(raw.operatorId, 20)
  const ret = raw.return === true
  const pax = Number(raw.pax)
  if (!Number.isInteger(pax) || pax < 1 || pax > MAX_PAX) throw new Error(`Passengers must be 1–${MAX_PAX}`)
  const date = clean(raw.date, 10), time = clean(raw.time, 5)
  if (!DATE.test(date) || !TIME.test(time)) throw new Error('Pick a valid date and time')
  const day = Date.parse(date + 'T00:00:00Z'), start = Date.parse(today.toISOString().slice(0, 10) + 'T00:00:00Z')
  if (day < start || day > start + MAX_DAYS_AHEAD * 864e5) throw new Error('Date must be within the next 30 days')
  let returnDate: string | undefined, returnTime: string | undefined
  if (ret) {
    returnDate = clean(raw.returnDate, 10); returnTime = clean(raw.returnTime, 5)
    if (!DATE.test(returnDate) || !TIME.test(returnTime) || returnDate < date) throw new Error('Pick a valid return date and time')
  }

  let single: number, retFare: number, label: string, city: string | undefined
  if (GIRNE_LEFKOSA.operators[operatorId]) {
    single = GIRNE_LEFKOSA.single; retFare = GIRNE_LEFKOSA.return; label = GIRNE_LEFKOSA.operators[operatorId]
  } else if (operatorId === 'kibhas') {
    city = clean(raw.city, 20)
    const fare = KIBHAS_FARES[city]
    if (!fare) throw new Error('Unknown town for the airport shuttle')
    single = fare; retFare = fare * 2; label = 'KIBHAS'
  } else throw new Error('This route cannot be paid online yet')

  const item: TicketItem = {
    type: 'ticket', operatorId, city, return: ret, pax, date, time, returnDate, returnTime,
    from: clean(raw.from), to: clean(raw.to), holder: clean(raw.holder, 80),
  }
  return { item, amount: (ret ? retFare : single) * pax, currency: 'TRY', label: `${label} · ${item.from}→${item.to}` }
}
