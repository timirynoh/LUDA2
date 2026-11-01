// Server-side text check for anything other people will see (listings, Flash jobs, bill notes).
// Same rules as the app's lib/moderation.ts, so a modified app can't post around them.
const BAD = [
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt', 'whore', 'slut', 'retard', 'nigga', 'nigger', 'faggot',
  'ashawo', 'mumu', 'olodo', 'werey', 'oloshi', 'kpekus',
  'amk', 'aq', 'orospu', 'siktir', 'sikerim', 'yarrak', 'piç', 'gavat', 'kahpe', 'göt', 'pezevenk',
  'merde', 'putain', 'pute', 'connard', 'connasse', 'salope', 'enculé', 'encule', 'batard', 'fdp', 'ntm',
  'malaya', 'msenge', 'mkundu',
  'شرموطة', 'كس', 'منيوك', 'زبي', 'sharmouta', 'sharmoota', 'kos omak', 'ibn el sharmouta',
]
const SCAM: [RegExp, string][] = [
  [/\b(western union|moneygram|gift ?cards?|itunes card)\b/i, 'asks for untraceable payment'],
  [/\b(send|pay|transfer)\b.{0,25}\b(fee|deposit|money|registration)\b.{0,25}\b(first|before|to get|to secure)\b/i, 'asks for money upfront'],
  [/\b(double|triple) your (money|investment)|guaranteed (profit|returns?)|forex signals?|binary option/i, 'looks like an investment scam'],
  [/\b(otp|verification code|pin)\b.{0,20}\b(send|give|share)\b|\b(send|give|share)\b.{0,20}\b(otp|verification code|pin)\b/i, 'asks for a code or PIN'],
  [/\b(visa|admission|work permit)\b.{0,30}\b(guaranteed|100%)\b/i, 'promises a guaranteed visa/permit'],
  [/\b(pay|send|transfer)\b.{0,30}\b(outside|off) (luda|the app)\b|\bwhatsapp me\b.{0,30}\b(pay|payment)\b/i, 'asks to pay outside Luda'],
]
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't' }
const normalise = (s: string) => s.toLowerCase().replace(/(?<=\p{L})!(?=\p{L})/gu, 'i').replace(/[0134@57$]/g, (c) => LEET[c] ?? c).replace(/(.)\1{2,}/g, '$1$1')

/** null = fine; otherwise a short reason to show the user. */
export function textProblem(text: string): string | null {
  const norm = normalise(text), squashed = norm.replace(/[\s._\-*]+/g, ''), words = norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  for (const w of BAD) {
    const latin = /^[a-zçğıöşüéèà ]+$/i.test(w)
    if (latin ? (w.includes(' ') ? norm.includes(w) : words.includes(w) || (w.length >= 5 && squashed.includes(w))) : text.includes(w)) return 'Please keep it respectful: remove offensive words'
  }
  const scam = SCAM.find(([re]) => re.test(text))?.[1]
  return scam ? `This can't be posted because it ${scam}. Payments must stay inside Luda.` : null
}
