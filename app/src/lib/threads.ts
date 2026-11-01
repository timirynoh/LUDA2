/** 1:1 conversation attached to a trade, Flash job or dispute. */
export interface ThreadMsg { id: string; from: 'me' | 'them' | 'support' | 'system'; text: string; img?: string; voice?: string; dur?: number; ts: number }

/** Shrinks a photo to a small JPEG thumbnail (kept on-device; evidence for disputes). */
export async function thumb(file: Blob, max = 360): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close()
  return c.toDataURL('image/jpeg', 0.7)
}

const REPLIES: [RegExp, string][] = [
  [/where|location|address|spot/i, "I'm at the Safe Spot now, near the main gate 👋"],
  [/when|time|late|eta/i, 'About 10 minutes away, see you soon.'],
  [/photo|picture|proof|receipt/i, 'Sure, sending it now.'],
  [/thank|thanks|merci|asante/i, 'You’re welcome! 🙏'],
  [/hello|hi|hey|bonjour|salam|habari/i, 'Hello! All good on my side.'],
]
export const counterReply = (text: string) => REPLIES.find(([re]) => re.test(text))?.[1] ?? 'Okay 👍'
