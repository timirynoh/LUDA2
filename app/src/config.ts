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
