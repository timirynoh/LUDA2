/** Minimal iCalendar (.ics) builder: lets users put classes/events in their phone's own calendar with alarms. */
export interface IcsEvent { title: string; start: Date; end: Date; location?: string; weekly?: boolean; alarmMin?: number; desc?: string }

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/[,;\\]/g, (m) => '\\' + m).replace(/\n/g, '\\n')

export function buildIcs(events: IcsEvent[]) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Luda//North Cyprus//EN', 'CALSCALE:GREGORIAN']
  events.forEach((e, i) => {
    lines.push('BEGIN:VEVENT', `UID:${stamp(e.start)}-${i}@luda.app`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`, `SUMMARY:${esc(e.title)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    if (e.desc) lines.push(`DESCRIPTION:${esc(e.desc)}`)
    if (e.weekly) lines.push('RRULE:FREQ=WEEKLY;COUNT=16')
    if (e.alarmMin) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.alarmMin}M`, 'END:VALARM')
    lines.push('END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/** Returns false if the host blocks downloads (e.g. sandboxed previews). */
export function downloadIcs(name: string, events: IcsEvent[]) {
  try {
    const url = URL.createObjectURL(new Blob([buildIcs(events)], { type: 'text/calendar' }))
    const a = document.createElement('a'); a.href = url; a.download = `${name}.ics`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return true
  } catch { return false }
}
