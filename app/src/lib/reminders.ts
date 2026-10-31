import { useEffect, useRef } from 'react'
import { nextOccurrence } from './uni'
import { useStore } from './store'
import { DAY_NAMES } from './ocr'

export const canNotify = () => typeof window !== 'undefined' && 'Notification' in window

export async function askNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!canNotify()) return 'unsupported'
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

/**
 * Runs only after the user switches reminders on. Fires an in-app toast (and a
 * system notification if the user allowed it) N minutes before each class.
 * Everything is computed on the device.
 */
export function useClassReminders() {
  const { s, toast } = useStore()
  const fired = useRef(new Set<string>())
  useEffect(() => {
    if (!s.remind.on || !s.classes.length) return
    const check = () => {
      const now = Date.now(), lead = s.remind.minutes * 60_000
      for (const c of s.classes) {
        const at = nextOccurrence(c, new Date(now - 60_000)).getTime()
        const key = `${c.id}@${at}`
        if (at - now <= lead && at > now && !fired.current.has(key)) {
          fired.current.add(key)
          const body = `${c.course} starts at ${c.start}${c.room ? ` · ${c.room}` : ''} (${DAY_NAMES[c.day]})`
          toast({ title: `⏰ ${body}`, emoji: '🎓' })
          try { if (canNotify() && Notification.permission === 'granted') new Notification('Class reminder', { body, tag: key }) } catch { /* ignore */ }
        }
      }
    }
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [s.remind.on, s.remind.minutes, s.classes, toast])
}
