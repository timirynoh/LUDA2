export interface Ticket {
  id: string; code: string; operator: string; from: string; to: string; date: string; time: string
  returnDate?: string; returnTime?: string; pax: number; total: number; saved: number; paidWith: 'wallet' | 'card' | 'home'; paidCur?: string; paidAmount?: number
  createdAt: number; status: 'valid' | 'used' | 'refunded'; kind: 'bus' | 'shuttle'
  holder: string; secret: string; refundedAt?: number
  payRef?: string // set when paid online via Paystack / Flutterwave
}

export function departures(date: string, first = '06:30', last = '23:00', everyMin = 30) {
  const out: string[] = []
  const [fh, fm] = first.split(':').map(Number), [lh, lm] = last.split(':').map(Number)
  const today = new Date().toISOString().slice(0, 10) === date
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  for (let m = fh * 60 + fm; m <= lh * 60 + lm; m += everyMin) {
    if (today && m < nowMin + 10) continue
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return out
}

export const ticketCode = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')

/** Basic card validation (Luhn) for the direct card payment form. */
export function luhn(num: string) {
  const d = num.replace(/\D/g, '')
  if (d.length < 13) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9 } sum += n }
  return sum % 10 === 0
}
