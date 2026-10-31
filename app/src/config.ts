/**
 * Central app configuration.
 *
 * IMPORTANT: confirm RESIDENCY_PORTAL_URL against the official TRNC Ministry of
 * Interior / Immigration Department (Muhaceret) website before launch. Government
 * portals change addresses and we never want to send users to a look-alike site.
 */
export const RESIDENCY_PORTAL_URL = 'https://www.icisleri.gov.ct.tr'

/** Live FX source (free, CORS-enabled). Falls back to indicative rates offline. */
export const FX_API = 'https://open.er-api.com/v6/latest/USD'

/** OpenStreetMap Overpass endpoint used for the "Around me" city directory. */
export const OVERPASS_API = 'https://overpass-api.de/api/interpreter'

/** Fee charged on P2P escrow trades (0.5%). */
export const P2P_FEE = 0.005

/** Cashback in Luda Points on bill payments (1 point = 0.01 TL). */
export const BILL_CASHBACK = 0.01
