// Account sync (v1.25.0, owner: 'on another phone my profile, picture and progress are gone'). Personal data that
// matters follows the ACCOUNT, not the phone: it is saved on the server (GET/POST my-data) and loaded on every phone.
// Device-only things (theme, language, dismissed pop-ups, drafts, privacy screen) stay on the phone on purpose.
// Money, rewards, ID checks, tickets, university… were already on the server; this covers the rest.
import { useEffect, useRef, useState } from 'react'
import { LIVE, api, getSession } from './live'
import type { State } from './store'

type Section = { pick: (s: State) => unknown; apply: (s: State, d: any) => State }
/** What each server section holds, and how it maps onto the app's state. */
export const SECTIONS: Record<string, Section> = {
  profile: {
    pick: (s) => ({ name: s.name, bio: s.bio ?? '', city: s.city, country: s.country }),
    apply: (s, d) => ({ ...s, name: d.name || s.name, bio: d.bio ?? s.bio, city: d.city || s.city, country: d.country || s.country }),
  },
  avatar: { pick: (s) => ({ url: s.avatar ?? '' }), apply: (s, d) => ({ ...s, avatar: d.url || undefined }) },
  settings: {
    pick: (s) => ({ shortcuts: s.shortcuts.filter((x) => x !== 'admin'), sections: s.sections, notifPrefs: s.notifPrefs, remind: s.remind }),
    apply: (s, d) => ({ ...s, shortcuts: [...(d.shortcuts?.length ? d.shortcuts : s.shortcuts.filter((x) => x !== 'admin')), ...(s.shortcuts.includes('admin') ? ['admin'] : [])],
      sections: { ...s.sections, ...d.sections }, notifPrefs: { ...s.notifPrefs, ...d.notifPrefs }, remind: d.remind ?? s.remind }),
  },
  study: { pick: (s) => ({ classes: s.classes }), apply: (s, d) => ({ ...s, classes: Array.isArray(d.classes) ? d.classes : s.classes }) },
  residency: { pick: (s) => ({ docs: s.docs, permitExpiry: s.permitExpiry }), apply: (s, d) => ({ ...s, docs: d.docs ?? s.docs, permitExpiry: d.permitExpiry ?? s.permitExpiry }) },
  saved: {
    pick: (s) => ({ savedHomes: s.savedHomes, newsSaved: s.newsSaved, newsLiked: s.newsLiked, savedPromos: s.savedPromos, rsvps: s.rsvps, applications: s.applications, viewings: s.viewings }),
    apply: (s, d) => ({ ...s, savedHomes: d.savedHomes ?? s.savedHomes, newsSaved: d.newsSaved ?? s.newsSaved, newsLiked: d.newsLiked ?? s.newsLiked, savedPromos: d.savedPromos ?? s.savedPromos,
      rsvps: d.rsvps ?? s.rsvps, applications: d.applications ?? s.applications, viewings: d.viewings ?? s.viewings }),
  },
  onboard: { pick: (s) => ({ toured: s.toured, welcomeDone: s.welcomeDone }), apply: (s, d) => ({ ...s, toured: !!d.toured || s.toured, welcomeDone: [...new Set([...(s.welcomeDone ?? []), ...(d.welcomeDone ?? [])])] }) },
}

// What this phone last saw/sent for each section, per account: { key: { at, hash } }.
type Seen = Record<string, { at: string; hash: string }>
const seenKey = (u: string) => `luda.sync.${u}`
const readSeen = (u: string): Seen => { try { return JSON.parse(localStorage.getItem(seenKey(u)) ?? '{}') } catch { return {} } }
const writeSeen = (u: string, v: Seen) => { try { localStorage.setItem(seenKey(u), JSON.stringify(v)) } catch { /* full */ } }
const hashOf = (v: unknown) => JSON.stringify(v)

/**
 * Loads the account's data when someone signs in (server copy wins when it's newer than what this phone has),
 * then saves every change to the server a moment after it's made. Nothing is sent before the first load, so a
 * brand-new phone never overwrites the account with empty defaults.
 */
export function useAccountSync(s: State, set: (f: (p: State) => State) => void, username: string | undefined) {
  const [readyFor, setReadyFor] = useState<string | null>(null) // which account has finished its first load
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(s)
  useEffect(() => { latest.current = s }, [s]) // runs before the effects below

  // 1) first load for this account
  useEffect(() => {
    if (!LIVE || !username || !s.signedIn || !getSession() || readyFor === username) return
    let stop = false
    void api<{ data: Record<string, { data: unknown; at: string }> }>('GET', 'my-data').then(({ data }) => {
      if (stop) return
      const seen = readSeen(username)
      let next = latest.current
      for (const [key, sec] of Object.entries(SECTIONS)) {
        const srv = data[key]
        const mine = hashOf(sec.pick(next))
        if (srv && (!seen[key] || Date.parse(srv.at) > Date.parse(seen[key].at) || seen[key].hash === mine)) {
          // The server has something this phone hasn't seen (another phone, or a fresh install): take it.
          if (!seen[key] || Date.parse(srv.at) > Date.parse(seen[key].at)) next = sec.apply(next, srv.data)
          seen[key] = { at: srv.at, hash: hashOf(sec.pick(next)) }
        }
      }
      writeSeen(username, seen)
      if (next !== latest.current) set(() => next)
      setReadyFor(username) // from now on, changes are saved (and sections never sent before go up once)
    }).catch(() => { /* offline: try again on the next open */ })
    return () => { stop = true }
  }, [username, s.signedIn, set, readyFor])

  // 2) save changes (debounced). Sections never sent before are sent too, so an older phone's data reaches the server.
  useEffect(() => {
    if (!LIVE || !username || readyFor !== username) return
    const run = () => {
      const seen = readSeen(username)
      for (const [key, sec] of Object.entries(SECTIONS)) {
        const val = sec.pick(latest.current), hash = hashOf(val)
        if (seen[key]?.hash === hash) continue
        const at = new Date().toISOString()
        seen[key] = { at, hash }
        writeSeen(username, seen)
        void api<{ data: unknown; at: string; saved: boolean }>('POST', 'my-data', { key, data: val, at }).then((r) => {
          const cur = readSeen(username)
          if (!r.saved) { set((p) => sec.apply(p, r.data)); cur[key] = { at: r.at, hash: hashOf(sec.pick(sec.apply(latest.current, r.data))) } } // a newer copy exists elsewhere
          else cur[key] = { at: r.at, hash }
          writeSeen(username, cur)
        }).catch(() => { const cur = readSeen(username); delete cur[key]; writeSeen(username, cur) }) // retry on the next change/open
      }
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(run, 1500)
  }, [s, username, readyFor, set])
}
