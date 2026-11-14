export interface SavedCard { id: string; brand: 'Visa' | 'Mastercard' | 'Troy' | 'Amex' | 'Card'; last4: string; exp: string; name: string; isDefault: boolean }

export function brandOf(num: string): SavedCard['brand'] {
  const d = num.replace(/\D/g, '')
  if (/^4/.test(d)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard'
  if (/^9792/.test(d)) return 'Troy'
  if (/^3[47]/.test(d)) return 'Amex'
  return 'Card'
}
export const expValid = (exp: string) => {
  const m = exp.match(/^(\d{2})\/(\d{2})$/); if (!m) return false
  const mm = +m[1], yy = 2000 + +m[2]; if (mm < 1 || mm > 12) return false
  return new Date(yy, mm, 0, 23, 59) >= new Date()
}
export const BRAND_STYLE: Record<SavedCard['brand'], string> = {
  Visa: 'from-indigo-500 via-blue-700 to-slate-900', Mastercard: 'from-orange-500 via-rose-600 to-slate-900',
  Troy: 'from-teal-500 via-cyan-700 to-slate-900', Amex: 'from-sky-400 via-sky-700 to-slate-900', Card: 'from-slate-500 to-slate-800',
}
