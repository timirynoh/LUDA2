import { WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (online) return null
  return <div className="sticky top-0 z-[55] flex items-center justify-center gap-2 bg-gold-400 px-4 py-2 text-xs font-semibold text-ink-950"><WifiOff size={14} /> You're offline. Payments are paused until you reconnect.</div>
}
