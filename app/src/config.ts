/**
 * Central app configuration.
 *
 * TRNC permits portal (student/residence permits). Login → "Online Transactions" →
 * "Student Permits". Re-check this address before launch: government portals move.
 */
export const RESIDENCY_PORTAL_URL = 'https://permissions.gov.ct.tr/login'

/** Live FX source (free, CORS-enabled). Falls back to indicative rates offline. */
export const FX_API = 'https://open.er-api.com/v6/latest/USD'

/** OpenStreetMap Overpass endpoint used for the "Around me" city directory. */
export const OVERPASS_API = 'https://overpass-api.de/api/interpreter'

/** Fee charged on P2P escrow trades (0.5%). */
export const P2P_FEE = 0.005

/** Cashback in Luda Points on bill payments (1 point = 0.01 TL). */
export const BILL_CASHBACK = 0.01

/** App discount on bus & shuttle tickets, per passenger (TL). */
export const TICKET_DISCOUNT = { single: 12, return: 14 }

/**
 * Girne ⇄ Lefkoşa bus operators and official fares (TL, per passenger).
 * CONFIRM the second operator's exact name and current fares before launch.
 */
export const GIRNE_LEFKOSA = {
  operators: [
    { id: 'virgo', name: 'VirgoBus', color: 'from-violet-500 to-fuchsia-700', every: 20 },
    { id: 'girneseri', name: 'Girne Seri', color: 'from-sky-500 to-blue-700', every: 30 },
  ],
  single: 250,
  return: 450,
}

/** KIBHAS airport shuttle fares to/from Ercan (TL, as publicly reported; confirm with KIBHAS). */
export const KIBHAS_FARES: Record<string, number> = { lefkosa: 250, girne: 350, magusa: 300, guzelyurt: 350, lefke: 395, iskele: 300 }

/**
 * Ride Saver (ticket discount) anti-abuse rules. Members opt in and are selected
 * automatically if their account passes the checks in lib/saver.ts.
 */
export const SAVER = {
  perDay: 2, // discounted tickets per day (the monthly cap below is the real limit)
  perMonth: 2, // discounted tickets per calendar month
  companions: 1, // discounted seats besides the member's own, per ticket
  maxRefundsPerMonth: 3, // more refunds than this pauses the discount for the month
  noRefundMinutes: 30, // no refunds this close to departure
}

/**
 * Anti-spam: max actions per rolling 24h, per user. Duplicate posts are also blocked.
 */
export const DAILY_LIMITS: Record<string, { max: number; label: string }> = {
  flash: { max: 3, label: 'Flash requests' },
  quickjob: { max: 3, label: 'quick job posts' },
  job: { max: 3, label: 'job posts' },
  house: { max: 2, label: 'house posts' },
  event: { max: 3, label: 'event posts' },
  group: { max: 2, label: 'new groups' },
  apply: { max: 15, label: 'job applications' },
  offer: { max: 10, label: 'fixer offers' },
  viewing: { max: 5, label: 'viewing bookings' },
  roommate: { max: 10, label: 'roommate requests' },
  report: { max: 10, label: 'reports' },
  ticket: { max: 6, label: 'ticket purchases' },
  ad: { max: 5, label: 'exchange ads' },
  send: { max: 20, label: 'transfers' },
  item: { max: 5, label: 'marketplace posts' },
  review: { max: 20, label: 'reviews' },
}
