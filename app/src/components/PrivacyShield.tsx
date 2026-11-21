// Privacy screen (v1.9.0). A website can't block phone screenshots (only a store app can), so Luda does what a
// web app can: when you leave the app it covers itself, so the recent-apps preview shows no balances or chats.
// Long-press menus and copying from the page are off too (Copy buttons still work).
import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

export function PrivacyShield() {
  const { s } = useStore()
  const on = s.security.privacyScreen !== false
  const [covered, setCovered] = useState(false)
  useEffect(() => {
    if (!on) return
    const hide = () => setCovered(true)
    const vis = () => (document.hidden ? setCovered(true) : setTimeout(() => setCovered(false), 150))
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('pagehide', hide)
    const back = () => setCovered(false)
    // (not window blur: tapping inside the KIBHAS booking frame or a file picker would cover the app)
    window.addEventListener('pageshow', back)
    return () => {
      document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', back)
    }
  }, [on])
  useEffect(() => {
    const stop = (e: Event) => { if (!typing(e.target)) e.preventDefault() }
    document.addEventListener('copy', stop); document.addEventListener('cut', stop); document.addEventListener('contextmenu', stop); document.addEventListener('dragstart', stop)
    return () => { document.removeEventListener('copy', stop); document.removeEventListener('cut', stop); document.removeEventListener('contextmenu', stop); document.removeEventListener('dragstart', stop) }
  }, [])
  if (!on || !covered) return null
  return (
    <div aria-hidden className="fixed inset-0 z-[9999] grid place-items-center bg-ink-950/95 backdrop-blur-2xl">
      <div className="text-center"><p className="text-5xl">🔒</p><p className="mt-3 text-xl font-extrabold">Luda</p><p className="text-sm text-slate-400">Hidden for your privacy</p></div>
    </div>
  )
}
