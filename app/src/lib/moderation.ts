/**
 * Lightweight on-device content filter for chats, group names and posts.
 * Covers common insults in the app's languages + Nigerian Pidgin, catches
 * letter/number disguises (e.g. "sh1t", "f.u.c.k"), and flags typical scams.
 * The live version adds server-side checks and human moderators on top.
 */
const BAD = [
  // English
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt', 'whore', 'slut', 'retard', 'nigga', 'nigger', 'faggot',
  // Pidgin / West African
  'ashawo', 'mumu', 'olodo', 'werey', 'oloshi', 'kpekus',
  // Turkish
  'amk', 'aq', 'orospu', 'siktir', 'sikerim', 'yarrak', 'piç', 'gavat', 'kahpe', 'göt', 'pezevenk',
  // French
  'merde', 'putain', 'pute', 'connard', 'connasse', 'salope', 'enculé', 'encule', 'batard', 'fdp', 'ntm',
  // Swahili
  'malaya', 'msenge', 'mkundu',
  // Arabic (script + common latin spellings)
  'شرموطة', 'كس', 'منيوك', 'زبي', 'sharmouta', 'sharmoota', 'kos omak', 'ibn el sharmouta',
]

const SCAM: [RegExp, string][] = [
  [/\b(western union|moneygram|gift ?cards?|itunes card)\b/i, 'Asks for untraceable payment'],
  [/\b(send|pay|transfer)\b.{0,25}\b(fee|deposit|money|registration)\b.{0,25}\b(first|before|to get|to secure)\b/i, 'Asks for money upfront'],
  [/\b(double|triple) your (money|investment)|guaranteed (profit|returns?)|forex signals?|binary option/i, 'Investment scam pattern'],
  [/\b(otp|verification code|pin)\b.{0,20}\b(send|give|share)\b|\b(send|give|share)\b.{0,20}\b(otp|verification code|pin)\b/i, 'Asks for a code or PIN'],
  [/\b(visa|admission|work permit)\b.{0,30}\b(guaranteed|100%)\b/i, 'Guaranteed visa/permit claim'],
]

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't' }

const normalise = (s: string) =>
  s.toLowerCase().replace(/(?<=\p{L})!(?=\p{L})/gu, 'i').replace(/[0134@57$]/g, (c) => LEET[c] ?? c).replace(/(.)\1{2,}/g, '$1$1')

export interface Check { ok: boolean; bad: string[]; scam?: string; masked: string }

export function checkText(text: string): Check {
  const norm = normalise(text)
  const squashed = norm.replace(/[\s._\-*]+/g, '') // catches f.u.c.k / f u c k
  const words = norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const bad = new Set<string>()
  for (const w of BAD) {
    const latin = /^[a-zçğıöşüéèà ]+$/i.test(w)
    if (latin) {
      if (w.includes(' ') ? norm.includes(w) : words.includes(w) || (w.length >= 5 && squashed.includes(w))) bad.add(w)
    } else if (text.includes(w)) bad.add(w)
  }
  const scam = SCAM.find(([re]) => re.test(text))?.[1]
  let masked = text
  for (const w of bad) masked = masked.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => m[0] + '•'.repeat(Math.max(1, m.length - 1)))
  return { ok: bad.size === 0 && !scam, bad: [...bad], scam, masked }
}

/** Simple flood control: max `limit` messages per `windowMs`. */
export function rateLimited(times: number[], limit = 5, windowMs = 10_000) {
  const now = Date.now()
  return times.filter((t) => now - t < windowMs).length >= limit
}
