// Auto-update (v1.22.1, owner: 'old version showing up in the new update'). A phone keeps an open Luda (and the
// Home Screen app) running for days, and tapping a notification brings that same old copy back, so people kept
// seeing the previous version after a release. Now the app checks /version.json and quietly reloads itself into the
// new version at a safe moment: while it's in the background, when it comes back, or when the person moves to
// another page with no pop-up open. Never in the middle of a payment (a sheet open) and never in a loop.
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { LIVE } from '../lib/live'
import { anySheetOpen } from './ui'

const KEY = 'luda.updatedTo'
let newer: string | null = null

async function check() {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    const v = r.ok ? ((await r.json()) as { version?: string }).version : undefined
    newer = v && v !== __VERSION__ ? v : null
  } catch { /* offline: try later */ }
  return newer
}

function apply(reason: 'hidden' | 'safe') {
  if (!newer) return
  if (reason === 'safe' && anySheetOpen()) return // never interrupt a payment or a form
  // one try per version: if the host still serves the old page, don't reload over and over
  try { if (sessionStorage.getItem(KEY) === newer) return; sessionStorage.setItem(KEY, newer) } catch { return }
  window.location.reload()
}

export function useAutoUpdate() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (!LIVE) return
    void check().then(() => apply('safe')) // opened from an old copy (e.g. a notification tap)
    const t = setInterval(() => { void check().then(() => { if (document.hidden) apply('hidden') }) }, 5 * 60e3)
    const vis = () => {
      if (document.hidden) apply('hidden') // in the background: update now, nobody sees it
      else void check().then(() => apply('safe'))
    }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [])
  // moving to another page is a natural moment to switch to the new version
  useEffect(() => { if (LIVE && newer && pathname) apply('safe') }, [pathname])
}
