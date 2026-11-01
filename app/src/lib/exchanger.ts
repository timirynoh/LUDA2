export type AdMode = 'cash' | 'inapp'
export interface Ad {
  id: string; side: 'sell' | 'buy' // sell = I give TRY, buy = I want TRY
  cur: string; rate: number // home currency per 1 TRY
  min: number; max: number; total: number; mode: AdMode; spot: string; methods: string[]
  active: boolean; createdAt: number; trades: number; locked: number
}
export interface ExchangerApp { status: 'none' | 'pending' | 'approved'; displayName?: string; bond?: number; appliedAt?: number }

/** Refundable safety deposit held while you're an exchanger (protects buyers). */
export const EXCHANGER_BOND = 2000
export const PAY_METHODS = ['Cash in person', 'Cash delivery (courier)', 'Bank transfer (home country)', 'Mobile money', 'Luda wallet']

/** Ads: any KYC-verified user can post; Verified Exchangers get more and bigger ads. */
export const AD_LIMITS = { member: { ads: 1, total: 5000 }, exchanger: { ads: 5, total: 50000 } }
