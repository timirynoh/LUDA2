/** Promo Spotter: students snap discounted / free products in shops and share them. */
export type PromoCat = 'Groceries' | 'Food & drinks' | 'Household' | 'Toiletries' | 'Electronics' | 'Clothing' | 'Other'
export interface Promo {
  id: string; title: string; price: number; was?: number; store: string; area: string; city: string; cat: PromoCat
  photo?: string; emoji: string; lat?: number; lon?: number; validUntil: string; by: string; flag: string; ts: number
  still: number; gone: number; mine?: boolean
}
export const PROMO_POINTS = { post: 10, confirm: 5, voter: 2 }
/** Hidden when people say it's gone/fake this many times more than "still there". */
export const HIDE_AFTER = 3

export const pctOff = (p: Pick<Promo, 'price' | 'was'>) => (p.was && p.was > p.price ? Math.round((1 - p.price / p.was) * 100) : 0)
export const isFree = (p: Pick<Promo, 'price'>) => p.price === 0
export const expired = (p: Pick<Promo, 'validUntil'>) => new Date(p.validUntil + 'T23:59:59').getTime() < Date.now()
export const hidden = (p: Pick<Promo, 'still' | 'gone'>) => p.gone - p.still >= HIDE_AFTER

const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

/** Sample promos (generic shop names; real ones come from users). */
export function samplePromos(city: string, areas: string[]): Promo[] {
  const h = 3_600_000, now = Date.now()
  const rows: [string, number, number | undefined, string, PromoCat, string, number, [string, string], number, number][] = [
    ['Basmati rice 5kg', 189, 279, 'City Market', 'Groceries', '🍚', 2, ['Amara', '🇳🇬'], 7, 0],
    ['Palm oil 2L', 95, 140, 'Afro-Euro Mini Market', 'Groceries', '🫙', 5, ['Kofi', '🇬🇭'], 4, 0],
    ['Free bread after 9pm', 0, 25, 'Corner Bakery', 'Food & drinks', '🥖', 1, ['Tendai', '🇿🇼'], 12, 1],
    ['Chicken thighs 1kg', 129, 175, 'Fresh Butcher', 'Groceries', '🍗', 3, ['Grâce', '🇨🇩'], 3, 0],
    ['Detergent 3kg', 149, 229, 'Mega Store', 'Household', '🧺', 6, ['Wanjiru', '🇰🇪'], 5, 1],
    ['Shower gel 2 for 1', 59, 118, 'Pharmacy Plus', 'Toiletries', '🧴', 4, ['Fatima', '🇸🇩'], 2, 0],
    ['USB-C charger', 179, 299, 'Tech Corner', 'Electronics', '🔌', 10, ['Chidi', '🇳🇬'], 6, 0],
    ['Winter hoodies', 249, 499, 'Campus Outlet', 'Clothing', '🧥', 14, ['Rudo', '🇿🇼'], 2, 0],
  ]
  return rows.map(([title, price, was, store, cat, emoji, hrs, [by, flag], still, gone], i) => ({
    id: `pr-${city}-${i}`, title, price, was, store, cat, emoji, area: areas[i % areas.length], city, validUntil: day(1 + (i % 4)), by, flag, ts: now - hrs * h, still, gone,
  }))
}
