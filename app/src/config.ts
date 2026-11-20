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

/**
 * Escrow services (P2P exchange, Verified Exchanger bond, Market purchases through Luda, Flash 'pay through Luda')
 * are paused "until further notice" (owner, 2026-11-18, v1.33.0). Nothing is deleted: to bring them back set this to
 * true AND the server secret ESCROW_ENABLED=true, and restore the texts from the table guides_escrow_backup.
 */
export const ESCROW = false

/**
 * Wallet (balances, top-ups, withdrawals, sending, converting, savings pots) is closed since v1.34.0 (owner,
 * 2026-11-20: the business registration doesn't allow holding money). Every service is paid directly at checkout.
 * To bring it back: set this to true AND the server secret WALLET_ENABLED=true.
 */
export const WALLET = false
/** Where people verify their ID (the wallet used to host it). */
export const KYC_LINK = WALLET ? '/wallet?a=kyc' : '/payments?a=kyc'

/** Fee charged on P2P trades (0.5%). */
export const P2P_FEE = 0.005

/** Cashback in Luda Points on bill payments (1 point = 0.01 TL). */
export const BILL_CASHBACK = 0.01

/** App discount on bus & shuttle tickets, per passenger (TL). */
export const TICKET_DISCOUNT = { single: 12, return: 14 }

/**
 * Girne ⇄ Lefkoşa bus operators and official fares (TL, per passenger).
 * Operators confirmed by the owner. Re-check current fares before launch.
 */
export const GIRNE_LEFKOSA = {
  operators: [
    { id: 'virgo', name: 'VirgoBus', color: 'from-violet-500 to-fuchsia-700', every: 20 },
    { id: 'girneliler', name: 'Girneliler Seyahat', color: 'from-sky-500 to-blue-700', every: 30 },
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
  promo: { max: 8, label: 'promo snaps' },
  vote: { max: 40, label: 'promo votes' },
}
