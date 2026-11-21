// Live community posts: what each kind asks for, and the posting rules shown to people (the server enforces the same rules).
export type BoardKind = 'housing' | 'job' | 'event' | 'news' | 'promo' | 'place'
export interface BoardField { key: string; label: string; type: 'text' | 'number' | 'select' | 'bool' | 'date' | 'tel'; options?: string[]; placeholder?: string; optional?: boolean }
export interface BoardPost {
  id: string; kind: BoardKind; title: string; body: string; data: Record<string, string | number | boolean>; city: string
  status: 'live' | 'review' | 'removed'; official: boolean; created_at: string; expires_at: string | null; review_note?: string | null
  author: string; authorName: string; authorVerified: boolean; mine: boolean; reported: boolean; photoUrls: (string | null)[]
  reports?: number; reasons?: string[]
}
export interface BoardRules { kyc: boolean; staffOnly?: boolean; minAgeDays?: number; review?: boolean; maxLive: number; perDay: number; days: number }
export interface BoardFeed { items: BoardPost[]; mine: BoardPost[]; rules: BoardRules; canPost: boolean; why: string | null; official: boolean }

export const BOARD: Record<BoardKind, { label: string; one: string; emoji: string; tint: string; title: string; body: string; fields: BoardField[]; empty: string }> = {
  housing: {
    label: 'Housing', one: 'room or flat', emoji: '🏠', tint: 'from-emerald-400 to-teal-600', title: 'e.g. Bright room in shared flat near NEU', body: 'Rooms, who you live with, rules, what is close by…',
    empty: 'No rooms posted yet. Landlords and students who verify their ID can post here.',
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: ['Room', 'Studio', '1+1', '2+1', '3+1', 'Dorm bed'] },
      { key: 'price', label: 'Rent per month (₺)', type: 'number', placeholder: 'e.g. 6500' },
      { key: 'deposit', label: 'Deposit (months)', type: 'select', options: ['None', '1', '2'] },
      { key: 'area', label: 'Area / street', type: 'text', placeholder: 'e.g. Gönyeli, near Lemar' },
      { key: 'furnished', label: 'Furnished', type: 'bool' }, { key: 'bills', label: 'Bills included', type: 'bool' },
      { key: 'contact', label: 'WhatsApp / phone', type: 'tel', placeholder: '+90 5xx …', optional: true },
    ],
  },
  job: {
    label: 'Jobs', one: 'job', emoji: '💼', tint: 'from-sky-400 to-indigo-600', title: 'e.g. Waiter for weekend shifts', body: 'What the work is, hours, who can apply…',
    empty: 'No jobs posted yet. Verified employers and students can post jobs here.',
    fields: [
      { key: 'company', label: 'Business / employer', type: 'text', placeholder: 'e.g. Harbour View Café' },
      { key: 'jobType', label: 'Type', type: 'select', options: ['Part-time', 'Full-time', 'One-off', 'Internship'] },
      { key: 'pay', label: 'Pay (₺)', type: 'number', placeholder: 'e.g. 160' }, { key: 'unit', label: 'Per', type: 'select', options: ['hour', 'day', 'month', 'job'] },
      { key: 'permit', label: 'Helps with work permit', type: 'bool' },
      { key: 'contact', label: 'How to apply (phone / email)', type: 'text', placeholder: 'e.g. +90 533… or jobs@…' },
    ],
  },
  event: {
    label: 'Events', one: 'event', emoji: '🎉', tint: 'from-fuchsia-400 to-rose-600', title: 'e.g. Sunday Service (English)', body: 'What happens, who it is for, what to bring…',
    empty: 'No events yet. Churches, mosques, student groups and verified organisers can post here.',
    fields: [
      { key: 'category', label: 'Kind', type: 'select', options: ['Worship', 'Culture', 'Sports', 'Career', 'Help', 'Party'] },
      { key: 'date', label: 'Date & time', type: 'date' }, { key: 'place', label: 'Place', type: 'text', placeholder: 'e.g. NEU library hall' },
      { key: 'price', label: 'Entry (₺, 0 = free)', type: 'number', placeholder: '0' },
      { key: 'organiser', label: 'Organiser', type: 'text', placeholder: 'e.g. Muslim Students Society' },
    ],
  },
  news: {
    label: 'News', one: 'news update', emoji: '📰', tint: 'from-amber-400 to-orange-600', title: 'e.g. Water cut in Girne on Friday', body: 'What happened, when, and where you heard it…',
    empty: 'No news yet. The Luda team and trusted members post updates here.',
    fields: [
      { key: 'category', label: 'Topic', type: 'select', options: ['Safety', 'Residency', 'University', 'Transport', 'Money', 'Community'] },
      { key: 'source', label: 'Source (link or who said it)', type: 'text', placeholder: 'e.g. Girne Belediyesi Facebook page' },
    ],
  },
  promo: {
    label: 'Promos', one: 'deal', emoji: '🔥', tint: 'from-orange-400 to-red-600', title: 'e.g. 2-for-1 shawarma on Tuesdays', body: 'What the deal is and any conditions…',
    empty: 'No deals yet. Spot one in a shop? Snap it and post it here.',
    fields: [
      { key: 'shop', label: 'Shop / place', type: 'text', placeholder: 'e.g. Lemar Gönyeli' }, { key: 'discount', label: 'Deal', type: 'text', placeholder: 'e.g. 30% off, 2 for 1' },
      { key: 'until', label: 'Valid until', type: 'date', optional: true },
    ],
  },
  place: {
    label: 'Places', one: 'place', emoji: '📍', tint: 'from-teal-400 to-cyan-600', title: 'e.g. African food store, Lefkoşa', body: 'What they offer, opening hours…',
    empty: 'No places added yet.',
    fields: [
      { key: 'category', label: 'Kind', type: 'select', options: ['Food', 'Shop', 'Hair & beauty', 'Church', 'Mosque', 'Health', 'Office', 'Other'] },
      { key: 'address', label: 'Address', type: 'text' }, { key: 'phone', label: 'Phone', type: 'tel', optional: true }, { key: 'hours', label: 'Opening hours', type: 'text', optional: true },
    ],
  },
}

/** Plain-language posting rules, built from the server's rules for that kind. */
export function rulesText(kind: BoardKind, r: BoardRules) {
  const out: string[] = []
  if (r.staffOnly) return ['Only the Luda team adds these, so every place is checked.']
  if (r.kyc) out.push('Your ID must be verified (passport or ID + selfie). Fake accounts can’t post.')
  if (r.minAgeDays) out.push(`Your account must be at least ${r.minAgeDays} days old.`)
  if (r.review) out.push('A Luda team member checks every news post before anyone sees it.')
  if (r.maxLive) out.push(`Up to ${r.maxLive} active ${BOARD[kind].one}${r.maxLive === 1 ? '' : 's'} at a time, ${r.perDay} new per day.`)
  if (r.days) out.push(`Posts end after ${r.days} days so the list stays fresh.`)
  out.push('Scam words, "send deposit first" and "pay outside Luda" are blocked. 3 reports hide a post until the team checks it.')
  return out
}
