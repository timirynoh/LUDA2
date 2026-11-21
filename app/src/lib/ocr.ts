/**
 * On-device timetable reader.
 * The screenshot is processed by tesseract.js running in a Web Worker inside the
 * user's browser, with the engine served from our own origin. The image is never
 * uploaded anywhere and is discarded as soon as the text has been read.
 */
export interface ClassItem { id: string; course: string; day: number; start: string; end: string; room?: string }

const DAYS: [number, string[]][] = [
  [0, ['monday', 'mon', 'pazartesi', 'pzt', 'pts', 'lundi', 'lun']],
  [1, ['tuesday', 'tue', 'tues', 'salı', 'sali', 'sal', 'mardi', 'mar']],
  [2, ['wednesday', 'wed', 'çarşamba', 'carsamba', 'çar', 'car', 'mercredi', 'mer']],
  [3, ['thursday', 'thu', 'thur', 'thurs', 'perşembe', 'persembe', 'per', 'jeudi', 'jeu']],
  [4, ['friday', 'fri', 'cuma', 'cum', 'vendredi', 'ven']],
  [5, ['saturday', 'sat', 'cumartesi', 'cmt', 'samedi', 'sam']],
  [6, ['sunday', 'sun', 'pazar', 'paz', 'dimanche', 'dim']],
]
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function dayOf(word: string): number | null {
  const w = word.toLowerCase().replace(/[^a-zçğıöşü]/g, '')
  if (w.length < 3) return null
  for (const [d, names] of DAYS) if (names.includes(w)) return d
  return null
}

const TIME = /(\d{1,2})\s?[:.]\s?(\d{2})\s*([AaPp]\.?\s?[Mm]\.?)?/g
const COURSE = /^([A-Z]{2,5})[- ]?(\d{3,4}[A-Z]?)$/
const pad = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`
const addMin = (t: string, mins: number) => {
  const [h, m] = t.split(':').map(Number), x = h * 60 + m + mins
  return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}
const uid = () => Math.random().toString(36).slice(2, 9)

/** All clock times in a string, as HH:MM (handles 9.00, 9:00 AM, 13:30). */
function times(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TIME)) {
    let h = +m[1]; const min = m[2]; const ap = m[3]?.toLowerCase().replace(/[.\s]/g, '')
    if (h > 23 || +min > 59) continue
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    out.push(pad(String(h), min))
  }
  // "9:00 - 10:50 AM": apply the trailing PM to an earlier time too
  return out
}
const range = (ts: string[]) => (ts.length ? { start: ts[0], end: ts[1] && ts[1] > ts[0] ? ts[1] : addMin(ts[0], 50) } : null)

interface Tok { text: string; x: number; y: number; h: number }
interface Line { y: number; toks: Tok[] }

/** Fix common OCR look-alikes inside course-code letters: 1/l/| → I, 0 → O, 5 → S; drop "Zz"-style doubles. */
function fixPrefix(p: string) {
  let out = ''
  for (const ch of p) {
    const prev = out[out.length - 1]
    if (prev && prev !== ch && prev.toLowerCase() === ch.toLowerCase()) continue
    out += ch
  }
  return out.replace(/[1l|!]/g, 'I').replace(/0/g, 'O').replace(/5/g, 'S').toUpperCase()
}
const CODE_LIKE = /^([A-Za-z01l|!5]{2,6}?)-?(\d{3,4}[A-Za-z]?)$/
const PREFIX_LIKE = /^[A-Za-z01l|!5]{2,6}-?$/
const letters = (p: string) => (p.match(/[A-Za-z]/g) ?? []).length

/** Merge "CMPE" + "112" into "CMPE112", fix OCR look-alikes, and glue "1:00" + "PM". */
function normalise(words: Tok[]): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i], n = words[i + 1]
    const t = w.text.replace(/[,;:|]+$/, '')
    if (n && /\d[:.]\d{2}$/.test(t) && /^[AaPp]\.?[Mm]\.?$/.test(n.text)) { out.push({ ...w, text: t + n.text }); i++; continue }
    if (n && PREFIX_LIKE.test(t) && letters(t) >= 2 && /^\d{3,4}[A-Z]?[,;:]?$/.test(n.text)) { out.push({ ...w, text: fixPrefix(t.replace('-', '')) + n.text.replace(/[,;:]$/, '') }); i++; continue }
    const m = t.match(CODE_LIKE)
    if (m && letters(m[1]) >= 2 && !/^\d/.test(t)) { out.push({ ...w, text: fixPrefix(m[1]) + m[2].toUpperCase() }); continue }
    out.push({ ...w, text: t })
  }
  return out
}

const NOT_NAME = /^(room|class|lab|hall|derslik|salle|online|lecture|lec|tutorial|tut|week|time|day|hour|section|sec|instructor|dr|prof|mr|mrs|ms|am|pm|-|–|to)$/i
/** If a line has no course code, use its leftover words as the course name (e.g. "Calculus I"). */
function nameFrom(text: string) {
  const cleaned = text.replace(TIME, ' ').replace(/[-–|•·()]/g, ' ').split(/\s+/)
    .filter((w) => w && dayOf(w) === null && !NOT_NAME.test(w) && !/^\d+$/.test(w) && !/^[A-Z]?\d{2,4}[A-Z]?$/.test(w)).join(' ').trim()
  return cleaned.length >= 3 && /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(cleaned) ? cleaned.slice(0, 40) : ''
}
const roomFrom = (text: string) => text.match(/\b(?:room|class|lab|hall|derslik|salle|r\.)\s*[:#]?\s*([A-Z]?-?\d{1,4}[A-Z]?|[A-Z]{1,3}\s?\d{1,4})/i)?.[0]

/** Turn positioned OCR lines into classes. Handles grids (with or without a time column) and lists. */
export function parseLines(rawLines: Line[]): ClassItem[] {
  const lines = rawLines.map((l) => ({ ...l, toks: normalise(l.toks) }))
  const header = lines.find((l) => l.toks.filter((t) => dayOf(t.text) !== null).length >= 3)
  if (header) {
    const grid = parseGrid(lines, header)
    if (grid.length) return mergeBlocks(grid)
  }
  return mergeBlocks(parseList(lines))
}

function parseGrid(lines: Line[], header: Line): ClassItem[] {
  const cols = header.toks.filter((t) => dayOf(t.text) !== null).map((t) => ({ day: dayOf(t.text)!, x: t.x }))
  const colW = cols.length > 1 ? Math.abs(cols[1].x - cols[0].x) : 200
  const firstColX = Math.min(...cols.map((c) => c.x))
  const lh = header.toks[0]?.h || 16
  // Time ranges with positions (either in a left "time" column, or inside cells)
  const tRanges: { x: number; y: number; start: string; end?: string; left: boolean }[] = []
  for (const l of lines) {
    if (l.y <= header.y) continue
    const tt = l.toks.filter((t) => times(t.text).length)
    for (let i = 0; i < tt.length; i++) {
      const a = times(tt[i].text), b = tt[i + 1] && Math.abs(tt[i + 1].x - tt[i].x) < colW * 0.8 ? times(tt[i + 1].text) : []
      const start = a[0], end = a[1] ?? b[0]
      tRanges.push({ x: tt[i].x, y: l.y, start, end, left: tt[i].x < firstColX - colW * 0.4 })
      if (!a[1] && b.length) i++
    }
  }
  const out: ClassItem[] = []
  for (const l of lines) {
    if (l.y <= header.y) continue
    for (const t of l.toks) {
      if (!COURSE.test(t.text) || t.x < firstColX - colW * 0.5) continue
      const col = cols.reduce((a, b) => (Math.abs(b.x - t.x) < Math.abs(a.x - t.x) ? b : a))
      // 1) a time printed inside the same cell, just below/above the course code
      const inCell = tRanges.filter((r) => !r.left && Math.abs(r.x - col.x) < colW * 0.6 && r.y > t.y - lh * 1.5 && r.y < t.y + lh * 5)
        .sort((a, b) => Math.abs(a.y - t.y) - Math.abs(b.y - t.y))[0]
      // 2) otherwise the row label in the left time column
      const rows = tRanges.filter((r) => r.left)
      const row = inCell ?? (rows.length ? rows.reduce((a, b) => (Math.abs(b.y - t.y) < Math.abs(a.y - t.y) ? b : a)) : undefined)
      if (!row) continue
      out.push({ id: uid(), course: t.text, day: col.day, start: row.start, end: row.end ?? addMin(row.start, 50) })
    }
  }
  return out
}

function parseList(lines: Line[]): ClassItem[] {
  const out: ClassItem[] = []
  let day: number | null = null
  let pendCourse: { names: string[]; i: number; room?: string } | null = null
  let pendTime: { start: string; end: string; i: number; room?: string } | null = null
  lines.forEach((l, i) => {
    const text = l.toks.map((t) => t.text).join(' ')
    for (const t of l.toks) { const d = dayOf(t.text); if (d !== null) { day = d; pendCourse = null; pendTime = null; break } }
    const r = range(times(text))
    const codes = l.toks.filter((t) => COURSE.test(t.text)).map((t) => t.text)
    const room = roomFrom(text)
    const courseNames = codes.length ? codes : r ? [nameFrom(text)].filter(Boolean) : []
    if (day === null) return
    if (r && courseNames.length) { courseNames.forEach((c) => out.push({ id: uid(), course: c, day: day!, start: r.start, end: r.end, room })); pendCourse = null; pendTime = null; return }
    if (r) {
      if (pendCourse && i - pendCourse.i <= 3) { pendCourse.names.forEach((c) => out.push({ id: uid(), course: c, day: day!, start: r.start, end: r.end, room: room ?? pendCourse!.room })); pendCourse = null }
      else pendTime = { ...r, i, room }
      return
    }
    const names = codes.length ? codes : (nameFrom(text) && !room ? [nameFrom(text)] : [])
    if (names.length) {
      if (pendTime && i - pendTime.i <= 3) { names.forEach((c) => out.push({ id: uid(), course: c, day: day!, start: pendTime!.start, end: pendTime!.end, room: room ?? pendTime!.room })); pendTime = null }
      else pendCourse = { names, i, room }
    } else if (room && out.length && !out[out.length - 1].room) out[out.length - 1].room = room
  })
  return out
}

/** Back-to-back hours of the same course on the same day become one class. */
function mergeBlocks(items: ClassItem[]): ClassItem[] {
  const sorted = [...items].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
  const out: ClassItem[] = []
  for (const c of sorted) {
    const prev = out[out.length - 1]
    if (prev && prev.course === c.course && prev.day === c.day && (prev.end >= c.start || addMin(prev.end, 15) >= c.start)) {
      if (c.end > prev.end) prev.end = c.end
    } else if (!out.some((o) => o.course === c.course && o.day === c.day && o.start === c.start)) out.push({ ...c })
  }
  return out
}

const abs = (p: string) => new URL(import.meta.env.BASE_URL + p, document.baseURI).href // root-relative on real hosting, folder-relative in the demo

/** Upscale, greyscale and erase table borders, which otherwise confuse OCR on grid timetables. */
async function preprocess(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(3, Math.max(1, 1800 / bmp.width))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const img = ctx.getImageData(0, 0, w, h), d = img.data
  const g = new Uint8Array(w * h)
  let sum = 0
  for (let i = 0; i < w * h; i++) { g[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; sum += g[i] }
  const darkBg = sum / (w * h) < 110 // dark-mode screenshots: invert so text is dark on light
  if (darkBg) for (let i = 0; i < g.length; i++) g[i] = 255 - g[i]
  const dark = (i: number) => g[i] < 140
  const minRun = Math.max(40, Math.round(Math.min(w, h) * 0.25))
  const erase = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x <= w; x++) { if (x < w && dark(y * w + x)) run++; else { if (run >= minRun) for (let k = x - run; k < x; k++) erase[y * w + k] = 1; run = 0 } } }
  for (let x = 0; x < w; x++) { let run = 0; for (let y = 0; y <= h; y++) { if (y < h && dark(y * w + x)) run++; else { if (run >= minRun) for (let k = y - run; k < y; k++) erase[k * w + x] = 1; run = 0 } } }
  for (let i = 0; i < w * h; i++) { const v = erase[i] ? 255 : g[i]; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v }
  ctx.putImageData(img, 0, 0)
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
}

export async function readTimetable(file: Blob, onProgress?: (p: number, status: string) => void): Promise<{ classes: ClassItem[]; text: string; lines: string[] }> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    workerPath: abs('ocr/worker-wrap.js'), workerBlobURL: false, corePath: abs('ocr/'), langPath: abs('ocr/'), gzip: true, cacheMethod: 'none',
    logger: (m: { progress: number; status: string }) => onProgress?.(m.progress, m.status),
  })
  try {
    // PSM 11 = sparse text: finds words anywhere, which suits grid timetables.
    const img = await preprocess(file)
    // Pass 1: sparse text (best for grids). Pass 2: column layout (best for lists/cards).
    await worker.setParameters({ tessedit_pageseg_mode: '11' as never, preserve_interword_spaces: '1' })
    let { data } = await worker.recognize(img, {}, { blocks: true, text: true })
    let result = toLines(data)
    if (!parseLines(result).length) {
      await worker.setParameters({ tessedit_pageseg_mode: '4' as never })
      ;({ data } = await worker.recognize(img, {}, { blocks: true, text: true }))
      const second = toLines(data)
      if (parseLines(second).length) result = second
    }
    return { classes: parseLines(result), text: data.text ?? '', lines: result.map((l) => l.toks.map((t) => t.text).join(' ')) }
  } finally {
    await worker.terminate()
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLines(data: any): Line[] {
  {
    const lines: Line[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of (data.blocks ?? []) as any[]) for (const p of b.paragraphs) for (const l of p.lines) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toks: Tok[] = l.words.filter((w: any) => w.text.trim()).map((w: any) => ({
        text: w.text.trim(), x: (w.bbox.x0 + w.bbox.x1) / 2, y: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0,
      }))
      if (toks.length) lines.push({ y: toks.reduce((a, t) => a + t.y, 0) / toks.length, toks })
    }
    // Tesseract may split one visual row into several blocks: regroup by y.
    lines.sort((a, b) => a.y - b.y)
    const merged: Line[] = []
    for (const l of lines) {
      const last = merged[merged.length - 1]
      const tol = Math.max(8, (l.toks[0]?.h ?? 16) * 0.6)
      if (last && Math.abs(last.y - l.y) < tol) { last.toks.push(...l.toks); last.toks.sort((a, b) => a.x - b.x) }
      else merged.push({ y: l.y, toks: [...l.toks].sort((a, b) => a.x - b.x) })
    }
    return merged
  }
}
