export type Lang = 'en' | 'tr' | 'fr' | 'sw' | 'ar'

export const LANGS: { code: Lang; name: string; native: string; flag: string; rtl?: boolean }[] = [
  { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', flag: '🇹🇷' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili', flag: '🇰🇪' },
  { code: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇩', rtl: true },
]

/** Largest African communities in North Cyprus (mostly students), roughly by size. */
export const COUNTRIES = [
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN', lang: 'en' as Lang },
  { code: 'CD', name: 'DR Congo', flag: '🇨🇩', currency: 'CDF', lang: 'fr' as Lang },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲', currency: 'XAF', lang: 'fr' as Lang },
  { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', currency: 'USD', lang: 'en' as Lang },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', currency: 'GHS', lang: 'en' as Lang },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', currency: 'KES', lang: 'sw' as Lang },
  { code: 'SD', name: 'Sudan', flag: '🇸🇩', currency: 'SDG', lang: 'ar' as Lang },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲', currency: 'ZMW', lang: 'en' as Lang },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬', currency: 'UGX', lang: 'sw' as Lang },
  { code: 'XX', name: 'Other', flag: '🌍', currency: 'USD', lang: 'en' as Lang },
]

export const CURRENCIES: Record<string, { name: string; symbol: string; flag: string }> = {
  TRY: { name: 'Turkish Lira', symbol: '₺', flag: '🇹🇷' },
  NGN: { name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬' },
  USD: { name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  EUR: { name: 'Euro', symbol: '€', flag: '🇪🇺' },
  GBP: { name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  GHS: { name: 'Ghana Cedi', symbol: '₵', flag: '🇬🇭' },
  XAF: { name: 'CFA Franc', symbol: 'FCFA', flag: '🇨🇲' },
  CDF: { name: 'Congolese Franc', symbol: 'FC', flag: '🇨🇩' },
  KES: { name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪' },
  SDG: { name: 'Sudanese Pound', symbol: 'SDG', flag: '🇸🇩' },
  ZMW: { name: 'Zambian Kwacha', symbol: 'ZK', flag: '🇿🇲' },
  UGX: { name: 'Ugandan Shilling', symbol: 'USh', flag: '🇺🇬' },
}

/** Indicative USD-based rates used only when the live feed is unreachable. */
export const FALLBACK_RATES: Record<string, number> = {
  USD: 1, TRY: 42.5, NGN: 1480, EUR: 0.86, GBP: 0.75, GHS: 11.2, XAF: 565,
  CDF: 2850, KES: 129, SDG: 600, ZMW: 24, UGX: 3600,
}

export const CITIES = [
  { id: 'lefkosa', name: 'Lefkoşa', en: 'Nicosia', lat: 35.1856, lon: 33.3823 },
  { id: 'girne', name: 'Girne', en: 'Kyrenia', lat: 35.3364, lon: 33.3199 },
  { id: 'magusa', name: 'Gazimağusa', en: 'Famagusta', lat: 35.1251, lon: 33.9418 },
  { id: 'guzelyurt', name: 'Güzelyurt', en: 'Morphou', lat: 35.1981, lon: 32.9934 },
  { id: 'lefke', name: 'Lefke', en: 'Lefka', lat: 35.1106, lon: 32.8487 },
  { id: 'iskele', name: 'İskele', en: 'Trikomo', lat: 35.2867, lon: 33.8919 },
]

/** Public, busy, well-lit meeting points suggested for in-person exchange. */
export const SAFE_SPOTS: Record<string, string[]> = {
  lefkosa: ['Near East University · Main gate', 'Dereboyu Avenue · Main strip', 'Cyprus International University · Main gate'],
  girne: ['Girne Harbour · Front promenade', 'Girne American University · Main gate', 'Final International University · Main gate'],
  magusa: ['Eastern Mediterranean University · Main gate', 'Salamis Road · Shopping strip', 'Namık Kemal Square'],
  guzelyurt: ['Güzelyurt Town Square', 'METU NCC · Main gate'],
  lefke: ['European University of Lefke · Main gate', 'Lefke Town Square'],
  iskele: ['Long Beach · Promenade', 'İskele Municipality Square'],
}

export type BillCategory = 'electricity' | 'water' | 'gas' | 'internet' | 'mobile' | 'rent'

export const BILLERS: { id: string; name: string; category: BillCategory; hint: string; color: string }[] = [
  { id: 'kibtek', name: 'KIB-TEK', category: 'electricity', hint: 'Subscriber no. (Abone No)', color: 'from-amber-400 to-orange-500' },
  { id: 'water', name: 'Municipality Water', category: 'water', hint: 'Water subscriber no.', color: 'from-sky-400 to-blue-500' },
  { id: 'lpg', name: 'LPG Gas Cylinder', category: 'gas', hint: 'Delivery address / phone', color: 'from-rose-400 to-red-500' },
  { id: 'turkcell', name: 'Kuzey Kıbrıs Turkcell', category: 'mobile', hint: 'Phone number', color: 'from-yellow-300 to-amber-500' },
  { id: 'telsim', name: 'Vodafone Telsim', category: 'mobile', hint: 'Phone number', color: 'from-red-400 to-rose-600' },
  { id: 'fiber', name: 'Home Internet', category: 'internet', hint: 'Customer no.', color: 'from-violet-400 to-fuchsia-500' },
  { id: 'rent', name: 'Rent / Dorm', category: 'rent', hint: 'Landlord IBAN or dorm ID', color: 'from-emerald-400 to-teal-500' },
]

export const LEVELS = [
  { min: 0, name: 'Newcomer', emoji: '🌱' },
  { min: 200, name: 'Settler', emoji: '🏠' },
  { min: 600, name: 'Local', emoji: '🫒' },
  { min: 1400, name: 'Island Pro', emoji: '🏝️' },
  { min: 3000, name: 'Legend', emoji: '👑' },
]

export const BADGES: Record<string, { name: string; emoji: string; desc: string }> = {
  welcome: { name: 'Hello Cyprus', emoji: '👋', desc: 'Joined Luda' },
  first_deposit: { name: 'First Coins', emoji: '🪙', desc: 'Made your first deposit' },
  bill_slayer: { name: 'Bill Slayer', emoji: '⚡', desc: 'Paid a bill in the app' },
  fx_wizard: { name: 'FX Wizard', emoji: '💱', desc: 'Converted currency' },
  safe_trader: { name: 'Safe Trader', emoji: '🛡️', desc: 'Completed a secure in-person exchange' },
  explorer: { name: 'Explorer', emoji: '🧭', desc: 'Contacted 3 places around you' },
  paperwork: { name: 'Paperwork Pro', emoji: '📑', desc: 'Ticked off every residency document' },
  verified: { name: 'Verified', emoji: '✅', desc: 'Completed identity verification' },
  streak7: { name: 'On Fire', emoji: '🔥', desc: '7-day streak' },
  scholar: { name: 'Scholar', emoji: '🎓', desc: 'Added your class timetable' },
  hustler: { name: 'Hustler', emoji: '💼', desc: 'Applied for a job' },
  social: { name: 'Social Butterfly', emoji: '🎉', desc: 'RSVPed to a community event' },
  guardian: { name: 'Guardian', emoji: '🛡️', desc: 'Reported a suspicious post' },
  stylist: { name: 'Made It Mine', emoji: '🎨', desc: 'Customised your home screen' },
  trusted_poster: { name: 'Trusted Poster', emoji: '📮', desc: 'Passed poster verification' },
  chatter: { name: 'Chatterbox', emoji: '💬', desc: 'Joined a group chat' },
  founder: { name: 'Founder', emoji: '🏗️', desc: 'Created a group' },
  traveller: { name: 'Road Tripper', emoji: '🎟️', desc: 'Bought a bus ticket in Luda' },
  flash_asker: { name: 'Flash', emoji: '⚡', desc: 'Posted a Flash help request' },
  handy_hero: { name: 'Handy Hero', emoji: '🛠️', desc: 'Completed a Flash job and got paid safely' },
  saver: { name: 'Ride Saver', emoji: '🎟️', desc: 'Selected for Luda Ride Saver' },
  exchanger: { name: 'Verified Exchanger', emoji: '🏪', desc: 'Approved as a Luda exchanger' },
  generous: { name: 'Generous', emoji: '💝', desc: 'Sent money to a friend' },
  saver_pot: { name: 'Piggy Bank', emoji: '🐷', desc: 'Reached a savings goal milestone' },
  trader: { name: 'Market Trader', emoji: '🛒', desc: 'Bought or sold on the marketplace' },
  critic: { name: 'Helpful Reviewer', emoji: '⭐', desc: 'Left a review' },
  allstar: { name: 'All-Star', emoji: '🌟', desc: 'Completed your profile 100%' },
  recruiter: { name: 'Recruiter', emoji: '🤝', desc: 'A friend you invited got verified' },
  ambassador: { name: 'Campus Ambassador', emoji: '🎓', desc: 'Joined the ambassador programme' },
  deal_hunter: { name: 'Deal Hunter', emoji: '🎁', desc: 'Used a Luda Deal' },
  newcomer_pro: { name: 'Settled In', emoji: '🧳', desc: 'Finished the welcome pack' },
  lucky: { name: 'Lucky Spin', emoji: '🎡', desc: 'Won cash on the daily spin' },
  challenger: { name: 'Challenger', emoji: '🏆', desc: 'Completed a monthly challenge' },
  spotter: { name: 'Promo Spotter', emoji: '🔥', desc: 'Shared a promo from a shop' },
  eagle_eye: { name: 'Eagle Eye', emoji: '🦅', desc: '10 people confirmed your promos' },
  home_sweet: { name: 'Home Sweet Home', emoji: '🏡', desc: 'Booked a house viewing' },
  good_neighbour: { name: 'Good Neighbour', emoji: '🤝', desc: 'Posted a listing or found a roommate' },
}

export const QUESTS = [
  { id: 'phone', title: 'Verify your phone number', xp: 50, to: '/profile' },
  { id: 'verify', title: 'Verify your identity', xp: 150, to: '/profile' },
  { id: 'deposit', title: 'Top up your wallet', xp: 50, to: '/wallet' },
  { id: 'bill', title: 'Pay your first bill', xp: 80, to: '/bills' },
  { id: 'fx', title: 'Convert to Lira', xp: 40, to: '/exchange' },
  { id: 'p2p', title: 'Finish a safe P2P trade', xp: 200, to: '/exchange' },
  { id: 'explore', title: 'Contact 3 places nearby', xp: 60, to: '/nearby' },
  { id: 'residency', title: 'Complete residency checklist', xp: 120, to: '/residency' },
  { id: 'housing', title: 'Book a house viewing', xp: 70, to: '/housing' },
  { id: 'uni', title: 'Add your class timetable', xp: 100, to: '/uni' },
  { id: 'job', title: 'Apply for a job', xp: 60, to: '/jobs' },
  { id: 'event', title: 'RSVP to a community event', xp: 40, to: '/community' },
  { id: 'chat', title: 'Join a group chat', xp: 30, to: '/chats' },
  { id: 'flash', title: 'Post a Flash help request', xp: 40, to: '/flash' },
  { id: 'promo', title: 'Snap a promo in a shop', xp: 30, to: '/promos' },
  { id: 'ticket', title: 'Buy a bus ticket', xp: 50, to: '/transport' },
]

/** Extra details each provider needs before the Luda team can pay (what the official sites / bank transfers ask for). */
export interface BillField { key: string; label: string; placeholder?: string; options?: string[]; optional?: boolean; tel?: boolean }
const DISTRICTS = ['Lefkoşa', 'Girne', 'Gazimağusa', 'Güzelyurt', 'İskele', 'Lefke']
const NAME_ON_BILL: BillField = { key: 'name', label: 'Name on the bill', placeholder: 'As printed on the bill' }
export const BILL_FIELDS: Record<string, { account: string; accountPlaceholder: string; fields: BillField[]; note?: string }> = {
  kibtek: { account: 'Subscriber no. (Abone No)', accountPlaceholder: 'e.g. 0123456', note: 'The Abone No is at the top of your KIB-TEK bill.', fields: [
    { key: 'meter', label: 'Meter type', options: ['Monthly bill', 'Prepaid (kontör) top-up'] }, NAME_ON_BILL, { key: 'district', label: 'District', options: DISTRICTS },
    { key: 'period', label: 'Bill month', placeholder: 'e.g. October 2026', optional: true }] },
  water: { account: 'Water subscriber no.', accountPlaceholder: 'From your water bill', fields: [
    { key: 'municipality', label: 'Municipality (Belediye)', options: DISTRICTS.map((d) => `${d} Belediyesi`) }, NAME_ON_BILL,
    { key: 'address', label: 'Flat / building', placeholder: 'e.g. Block B, flat 4', optional: true }] },
  lpg: { account: 'Phone for the delivery', accountPlaceholder: '+90 533 …', fields: [
    { key: 'address', label: 'Delivery address', placeholder: 'Street, building, flat' }, { key: 'size', label: 'Cylinder', options: ['12 kg', '24 kg', '45 kg'] },
    { key: 'brand', label: 'Brand (if you know)', placeholder: 'e.g. Aygaz, Ipragaz', optional: true }] },
  turkcell: { account: 'Phone number', accountPlaceholder: '+90 533 …', fields: [
    { key: 'kind', label: 'What to pay', options: ['TL top-up (prepaid)', 'Monthly bill (postpaid)', 'Package / bundle'] },
    { key: 'package', label: 'Package name', placeholder: 'e.g. 20 GB student pack', optional: true }] },
  telsim: { account: 'Phone number', accountPlaceholder: '+90 542 …', fields: [
    { key: 'kind', label: 'What to pay', options: ['TL top-up (prepaid)', 'Monthly bill (postpaid)', 'Package / bundle'] },
    { key: 'package', label: 'Package name', placeholder: 'e.g. 20 GB student pack', optional: true }] },
  fiber: { account: 'Customer / subscriber no.', accountPlaceholder: 'From your internet bill', fields: [
    { key: 'isp', label: 'Internet provider', options: ['Telekomünikasyon Dairesi', 'Multimax', 'Kuzey Kıbrıs Turkcell', 'Vodafone Telsim', 'Other'] }, NAME_ON_BILL] },
  rent: { account: 'Room / flat / dorm ID', accountPlaceholder: 'e.g. Flat 4B or dorm no.', note: 'Rent is sent by bank transfer to the IBAN you enter.', fields: [
    { key: 'landlord', label: "Landlord's full name (account holder)", placeholder: 'Exactly as on the bank account' }, { key: 'iban', label: 'IBAN', placeholder: 'TR00 0000 0000 0000 0000 0000 00' },
    { key: 'period', label: 'Rent month', placeholder: 'e.g. November 2026' }, { key: 'reference', label: 'Payment description', placeholder: 'What the landlord wants written', optional: true }] },
}
