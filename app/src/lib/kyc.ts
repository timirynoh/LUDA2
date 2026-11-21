/**
 * KYC (Know Your Customer) rules. Money can come IN before KYC (small limits),
 * but nothing can go OUT (withdraw, send home, swaps, payments) until KYC is approved.
 * Amounts in TRY equivalent.
 */
export const KYC_LIMITS = {
  none: { depositPerDay: 5000, maxBalance: 10000, withdraw: false },
  verified: { depositPerDay: 100000, maxBalance: 500000, withdraw: true },
}

export const DOC_TYPES = [
  { id: 'passport', label: 'Passport', emoji: '🛂', sides: 1 },
  { id: 'residence', label: 'TRNC residence permit', emoji: '🪪', sides: 2 },
  { id: 'national', label: 'National ID card', emoji: '🆔', sides: 2 },
] as const
export type DocType = (typeof DOC_TYPES)[number]['id']

export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected'
export interface Kyc { status: KycStatus; doc?: DocType; fullName?: string; dob?: string; nationality?: string; submittedAt?: number; reason?: string }
