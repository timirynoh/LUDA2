// Keeps this phone's notification address with the server for the signed-in account (after sign-in, account switch
// or a browser renewing its subscription), and opens the right page when a notification is tapped.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LIVE, api, getSession } from '../lib/live'
import { enablePush, pushSupported } from '../lib/push'
import { useStore } from '../lib/store'

export function usePushSync() {
  const { s } = useStore()
  const nav = useNavigate()
  const who = s.account?.username ?? ''
  useEffect(() => {
    if (!LIVE || !who || !s.signedIn || !s.pushOn || !pushSupported() || Notification.permission !== 'granted' || !getSession()) return
    const k = `luda.pushSync.${who}`
    if (sessionStorage.getItem(k)) return
    sessionStorage.setItem(k, '1')
    void enablePush(s.notifPrefs)
  }, [who, s.signedIn, s.pushOn, s.notifPrefs])
  // The server remembers the app language so phone notifications arrive in it (v1.21.0).
  useEffect(() => {
    if (!LIVE || !who || !s.signedIn || !getSession()) return
    const k = `luda.langSync.${who}`
    if (sessionStorage.getItem(k) === s.lang) return
    void api('POST', 'lang', { lang: s.lang }).then(() => sessionStorage.setItem(k, s.lang)).catch(() => {})
  }, [who, s.signedIn, s.lang])
  useEffect(() => {
    const go = (e: Event) => { const url = (e as CustomEvent<string>).detail; if (typeof url === 'string' && url.startsWith('/')) nav(url) }
    window.addEventListener('luda:open', go)
    return () => window.removeEventListener('luda:open', go)
  }, [nav])
}
