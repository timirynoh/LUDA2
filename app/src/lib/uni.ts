import type { ClassItem } from './ocr'

export const UNIVERSITIES = [
  { id: 'neu', name: 'Near East University', short: 'NEU', city: 'lefkosa' },
  { id: 'emu', name: 'Eastern Mediterranean University', short: 'EMU', city: 'magusa' },
  { id: 'ciu', name: 'Cyprus International University', short: 'CIU', city: 'lefkosa' },
  { id: 'gau', name: 'Girne American University', short: 'GAU', city: 'girne' },
  { id: 'metu', name: 'METU Northern Cyprus Campus', short: 'METU NCC', city: 'guzelyurt' },
  { id: 'eul', name: 'European University of Lefke', short: 'EUL', city: 'lefke' },
  { id: 'fiu', name: 'Final International University', short: 'FIU', city: 'girne' },
  { id: 'uok', name: 'University of Kyrenia', short: 'UoK', city: 'girne' },
  { id: 'cwu', name: 'Cyprus West University', short: 'CWU', city: 'magusa' },
  { id: 'bau', name: 'Bahçeşehir Cyprus University', short: 'BAU', city: 'lefkosa' },
  { id: 'csu', name: 'Cyprus Science University', short: 'CSU', city: 'girne' },
  { id: 'arucad', name: 'ARUCAD', short: 'ARUCAD', city: 'girne' },
]

export type CalKind = 'term' | 'deadline' | 'exam' | 'fee'
export interface CalItem { id: string; title: string; kind: CalKind; start: string; end?: string }
export interface Fee { id: string; title: string; due: string; amount: number }

const hash = (s: string) => s.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const shift = (iso: string, days: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }

/**
 * SAMPLE academic calendar per school (each school gets its own dates).
 * In the live version this syncs from each university's official calendar.
 */
export function calendarFor(uni: string): CalItem[] {
  const o = hash(uni) % 5
  const items: [string, CalKind, string, string?][] = [
    ['Fall classes begin', 'term', '2026-09-28'],
    ['Add / drop deadline', 'deadline', '2026-10-09'],
    ['Fall fee instalment 2 due', 'fee', '2026-11-13'],
    ['Midterm exams', 'exam', '2026-11-16', '2026-11-27'],
    ['Last day to withdraw from a course', 'deadline', '2026-12-11'],
    ['Fall final exams', 'exam', '2027-01-11', '2027-01-22'],
    ['Spring registration', 'deadline', '2027-02-01', '2027-02-12'],
    ['Spring fee instalment 1 due', 'fee', '2027-02-12'],
    ['Spring classes begin', 'term', '2027-02-15'],
    ['Spring midterms', 'exam', '2027-04-05', '2027-04-16'],
    ['Spring fee instalment 2 due', 'fee', '2027-04-16'],
    ['Spring final exams', 'exam', '2027-05-31', '2027-06-11'],
  ]
  return items.map(([title, kind, a, b], i) => ({ id: `${uni}-${i}`, title, kind, start: shift(a, o), end: b ? shift(b, o) : undefined }))
}

/** SAMPLE yearly tuition (USD) split into four instalments. */
export function feesFor(uni: string): { yearly: number; items: Fee[] } {
  const yearly = 3800 + (hash(uni + 'fee') % 8) * 450
  const q = yearly / 4, o = hash(uni) % 5
  return {
    yearly,
    items: [
      { id: `${uni}-f1`, title: 'Fall · instalment 1', due: shift('2026-09-25', o), amount: q },
      { id: `${uni}-f2`, title: 'Fall · instalment 2', due: shift('2026-11-13', o), amount: q },
      { id: `${uni}-f3`, title: 'Spring · instalment 1', due: shift('2027-02-12', o), amount: q },
      { id: `${uni}-f4`, title: 'Spring · instalment 2', due: shift('2027-04-16', o), amount: q },
    ],
  }
}

export const daysUntil = (iso: string) => Math.ceil((new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86_400_000)

/** Next start time (as Date) of a weekly class. Class.day: 0=Mon … 6=Sun. */
export function nextOccurrence(c: ClassItem, from = new Date()) {
  const [h, m] = c.start.split(':').map(Number)
  const d = new Date(from); d.setHours(h, m, 0, 0)
  const jsDay = (c.day + 1) % 7
  let add = (jsDay - d.getDay() + 7) % 7
  if (add === 0 && d.getTime() <= from.getTime()) add = 7
  d.setDate(d.getDate() + add)
  return d
}

export function nextClass(classes: ClassItem[]) {
  let best: { c: ClassItem; at: Date } | null = null
  for (const c of classes) { const at = nextOccurrence(c); if (!best || at < best.at) best = { c, at } }
  return best
}

export const SAMPLE_GRID = {
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  rows: [
    ['08:30-09:20', 'MATH101', '', 'MATH101', '', ''],
    ['09:30-10:20', 'MATH101', 'CMPE112', '', 'CMPE112', 'ENGL102'],
    ['10:30-11:20', '', 'CMPE112', 'PHYS101', '', 'ENGL102'],
    ['11:30-12:20', 'PHYS101', '', 'PHYS101', '', ''],
    ['13:30-14:20', '', 'HIST100', '', 'CMPE112', ''],
  ],
}

/** Draws a realistic sample timetable screenshot so users can try the reader without their own. */
export async function sampleScreenshot(): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = 900; c.height = 420
  const x = c.getContext('2d')!
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height)
  x.fillStyle = '#111'; x.font = 'bold 20px Arial'; x.fillText('2026-2027 Fall · Weekly Schedule', 24, 36)
  const cols = [24, 174, 314, 454, 614, 764], top = 60, rh = 60
  x.font = 'bold 17px Arial'
  x.fillText('Time', cols[0] + 10, top + 36)
  SAMPLE_GRID.days.forEach((d, i) => x.fillText(d, cols[i + 1] + 10, top + 36))
  x.font = '17px Arial'
  SAMPLE_GRID.rows.forEach((r, ri) => r.forEach((cell, ci) => cell && x.fillText(cell, cols[ci] + 10, top + rh * (ri + 1) + 36)))
  x.strokeStyle = '#999'; x.lineWidth = 1
  for (let i = 0; i <= SAMPLE_GRID.rows.length + 1; i++) { x.beginPath(); x.moveTo(24, top + i * rh); x.lineTo(880, top + i * rh); x.stroke() }
  for (const cx of [...cols, 880]) { x.beginPath(); x.moveTo(cx, top); x.lineTo(cx, top + rh * (SAMPLE_GRID.rows.length + 1)); x.stroke() }
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
}
