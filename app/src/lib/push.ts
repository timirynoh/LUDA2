// Phone notifications (v1.17.0). The phone registers with the browser's push service and gives the Luda server
// its address; the SERVER decides what to send (money in, P2P steps, replies, deadlines…) and sends it, so alerts
// arrive even when Luda is closed. iPhone: only in Luda installed on the Home Screen (iOS 16.4+).
import { api, getSession, LIVE } from './live'

const MARK = 'luda.pushEndpoint'

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
/** iPhone/iPad in Safari (not installed): push isn't available until Luda is added to the Home Screen. */
export const needsInstall = () => isIos() && !isInstalled()

export function registerWorker() {
  if (!LIVE || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => { /* not available (private mode etc.) */ })
  // A tapped notification asks the open app to go to its page.
  navigator.serviceWorker.addEventListener?.('message', (e: MessageEvent) => {
    if (e.data?.type === 'luda:open' && typeof e.data.url === 'string') window.dispatchEvent(new CustomEvent('luda:open', { detail: e.data.url }))
  })
}

async function worker() {
  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js'))
  await Promise.race([navigator.serviceWorker.ready, new Promise((ok) => setTimeout(ok, 8000))])
  return reg
}

const b64ToBytes = (s: string) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(t, (c) => c.charCodeAt(0)) }

/** Asks permission (if needed), subscribes this phone and gives the server its address. */
export async function enablePush(prefs: Record<string, boolean>): Promise<'on' | 'denied' | 'unsupported' | 'install' | 'error'> {
  if (!LIVE || !pushSupported()) return needsInstall() ? 'install' : 'unsupported'
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
  if (perm !== 'granted') return 'denied'
  try {
    const { push } = await api<{ push: string | null }>('GET', 'config')
    if (!push) return 'error'
    const reg = await worker()
    let sub = await reg.pushManager.getSubscription()
    // A subscription made with another server key can't be used: start over.
    const want = b64ToBytes(push)
    const have = sub?.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey as ArrayBuffer) : null
    if (sub && have && (have.length !== want.length || have.some((x, i) => x !== want[i]))) { await sub.unsubscribe(); sub = null }
    if (!sub) sub = await Promise.race([reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want as unknown as BufferSource }), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 20000))])
    const j = sub.toJSON()
    await api('POST', 'push-subscribe', { endpoint: j.endpoint, keys: j.keys, prefs })
    localStorage.setItem(MARK, j.endpoint ?? '')
    return 'on'
  } catch { return 'error' }
}

/** Turns phone notifications off on this phone (and tells the server). */
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/')
    const sub = await reg?.pushManager.getSubscription()
    if (sub) { if (getSession()) await api('POST', 'push-unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe() }
  } catch { /* ignore */ }
  localStorage.removeItem(MARK)
}

/** On sign-out: this phone stops getting this account's alerts (the browser subscription stays for the next account). */
export async function forgetPushForAccount() {
  const ep = localStorage.getItem(MARK)
  if (ep && getSession()) await api('POST', 'push-unsubscribe', { endpoint: ep }).catch(() => {})
  localStorage.removeItem(MARK)
}

export async function pushPrefs(prefs: Record<string, boolean>) {
  const ep = localStorage.getItem(MARK)
  if (ep && getSession()) await api('POST', 'push-prefs', { endpoint: ep, prefs }).catch(() => {})
}

export const pushTest = () => api<{ sent: number }>('POST', 'push-test')
/** True when this phone gets alerts from the server (then the app doesn't show its own copies). */
export const serverPushActive = () => LIVE && pushSupported() && Notification.permission === 'granted' && !!localStorage.getItem(MARK)
