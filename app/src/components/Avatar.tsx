import { Camera } from 'lucide-react'
import { useStore } from '../lib/store'

/** Square-crops and shrinks a photo to a small JPEG (kept on-device in the demo). */
export async function avatarFrom(file: Blob, size = 320): Promise<string> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas'); c.width = c.height = size
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.82)
}

/** The user's avatar: photo if set, otherwise their initial on the brand gradient. */
export function Avatar({ size = 40, className = '', editable }: { size?: number; className?: string; editable?: boolean }) {
  const { s, set, toast } = useStore()
  const pick = async (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return toast({ title: 'Please choose a photo', emoji: '🖼️' })
    try { const url = await avatarFrom(f); set((p) => ({ ...p, avatar: url })); toast({ title: 'Profile photo updated', emoji: '📸' }) }
    catch { toast({ title: 'Could not read that photo', emoji: '⚠️' }) }
  }
  const inner = s.avatar
    ? <img src={s.avatar} alt="Your profile" className="size-full rounded-[inherit] object-cover" />
    : <span className="font-black text-ink-950" style={{ fontSize: size * 0.42 }}>{(s.name || 'L')[0]?.toUpperCase()}</span>
  const box = <span className={`relative grid shrink-0 place-items-center overflow-visible rounded-full bg-gradient-to-br from-mint-400 to-gold-400 ${className}`} style={{ width: size, height: size }}>{inner}
    {editable && <span className="absolute -end-0.5 -bottom-0.5 grid size-7 place-items-center rounded-full border-2 border-ink-900 bg-mint-400 text-ink-950"><Camera size={14} /></span>}</span>
  if (!editable) return box
  return <label className="cursor-pointer" aria-label="Change profile photo">{box}<input type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} /></label>
}
