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

const TIME = /(\d{1,2})[:.](\d{2})/g
const COURSE = /^([A-Z]{2,5})[- ]?(\d{3}[A-Z]?)$/
const pad = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`
const addMin = (t: string, mins: number) => {
  const [h, m] = t.split(':').map(Number), x = h * 60 + m + mins
  return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}
const uid = () => Math.random().toString(36).slice(2, 9)

interface Tok { text: string; x: number; y: number; h: number }
interface Line { y: number; toks: Tok[] }

/** Merge "CMPE" + "112" into "CMPE112"; keep x/y of the first part. */
function normalise(words: Tok[]): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i], n = words[i + 1]
    if (n && /^[A-Z]{2,5}-?$/.test(w.text) && /^\d{3}[A-Z]?$/.test(n.text)) { out.push({ ...w, text: w.text.replace('-', '') + n.text }); i++ }
    else out.push(w)
  }
  return out
}

/** Turn positioned OCR lines into classes. Handles grid (days as columns) and list (day headings) layouts. */
export function parseLines(lines: Line[]): ClassItem[] {
  lines = lines.map((l) => ({ ...l, toks: normalise(l.toks) }))
  const result: ClassItem[] = []

  // ---- Grid layout: a header row with 3+ day names
  const header = lines.find((l) => l.toks.filter((t) => dayOf(t.text) !== null).length >= 3)
  if (header) {
    const cols = header.toks.filter((t) => dayOf(t.text) !== null).map((t) => ({ day: dayOf(t.text)!, x: t.x }))
    const rows: { y: number; start: string; end?: string }[] = []
    for (const l of lines) {
      if (l.y <= header.y) continue
      const txt = l.toks.slice(0, 3).map((t) => t.text).join(' ')
      const times = [...txt.matchAll(TIME)]
      if (times.length) rows.push({ y: l.y, start: pad(times[0][1], times[0][2]), end: times[1] ? pad(times[1][1], times[1][2]) : undefined })
    }
    if (rows.length) {
      for (const l of lines) {
        if (l.y <= header.y) continue
        for (const t of l.toks) {
          if (!COURSE.test(t.text)) continue
          const col = cols.reduce((a, b) => (Math.abs(b.x - t.x) < Math.abs(a.x - t.x) ? b : a))
          const row = rows.reduce((a, b) => (Math.abs(b.y - t.y) < Math.abs(a.y - t.y) ? b : a))
          result.push({ id: uid(), course: t.text, day: col.day, start: row.start, end: row.end ?? addMin(row.start, 50) })
        }
      }
      return mergeBlocks(result)
    }
  }

  // ---- List layout: "Monday" headings followed by "09:00-10:50 CMPE112 Room A"
  let day: number | null = null
  for (const l of lines) {
    const text = l.toks.map((t) => t.text).join(' ')
    for (const t of l.toks) { const d = dayOf(t.text); if (d !== null) { day = d; break } }
    const times = [...text.matchAll(TIME)]
    const courses = l.toks.filter((t) => COURSE.test(t.text))
    if (day === null || !times.length || !courses.length) continue
    const start = pad(times[0][1], times[0][2])
    const end = times[1] ? pad(times[1][1], times[1][2]) : addMin(start, 50)
    const room = text.match(/\b(?:room|class|lab|hall|derslik|salle)\s*([A-Z0-9-]+)/i)?.[0]
    for (const c of courses) result.push({ id: uid(), course: c.text, day, start, end, room })
  }
  return mergeBlocks(result)
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

const abs = (p: string) => new URL(p, document.baseURI).href

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
    await worker.setParameters({ tessedit_pageseg_mode: '11' as never, preserve_interword_spaces: '1' })
    const { data } = await worker.recognize(await preprocess(file), {}, { blocks: true, text: true })
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
    return { classes: parseLines(merged), text: data.text ?? '', lines: merged.map((l) => l.toks.map((t) => `${t.text}@${Math.round(t.x)},${Math.round(t.y)}`).join(' ')) }
  } finally {
    await worker.terminate()
  }
}
