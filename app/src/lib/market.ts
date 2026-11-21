export type ItemCat = 'Furniture' | 'Electronics' | 'Books' | 'Clothes' | 'Kitchen' | 'Other'
export type Condition = 'New' | 'Like new' | 'Good' | 'Fair'
export interface Item { id: string; title: string; price: number; cat: ItemCat; condition: Condition; seller: string; city: string; area: string; emoji: string; photos: string[]; desc: string; posted: number; mine?: boolean; sold?: boolean }
export interface Order { id: string; itemId: string; title: string; price: number; seller: string; emoji: string; status: 'escrow' | 'done' | 'disputed' | 'cancelled'; ts: number; spot: string }

const ROWS: [string, number, ItemCat, Condition, string, string, string][] = [
  ['3-seater sofa, grey', 2500, 'Furniture', 'Good', '🛋️', 'Amara N.', 'Moving out, pick up only. No stains.'],
  ['iPhone 13, 128GB', 18500, 'Electronics', 'Like new', '📱', 'Kofi A.', 'Battery 89%, with box and charger.'],
  ['Engineering Maths textbook', 450, 'Books', 'Good', '📘', 'Wanjiru K.', 'Stroud, 8th edition. Few highlights.'],
  ['Standing fan', 600, 'Electronics', 'Good', '🌀', 'Tendai M.', 'Works perfectly, 3 speeds.'],
  ['Single bed + mattress', 3000, 'Furniture', 'Fair', '🛏️', 'Mireille K.', 'Must go this week!'],
  ['Rice cooker 1.8L', 700, 'Kitchen', 'Like new', '🍚', 'Fatima B.', 'Used twice. Jollof ready 😄'],
  ['City bicycle', 3500, 'Other', 'Good', '🚲', 'Tolu A.', 'New tyres, lock included.'],
  ['Winter jacket (L)', 900, 'Clothes', 'Like new', '🧥', 'Rudo C.', 'Very warm, North Face style.'],
]
export function itemsFor(city: string, areas: string[]): Item[] {
  return ROWS.map(([title, price, cat, condition, emoji, seller, desc], i) => ({ id: `it-${city}-${i}`, title, price, cat, condition, emoji, seller, desc, city, area: areas[i % areas.length], photos: [], posted: (i * 5) % 11 }))
}
