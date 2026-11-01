// Transaction receipts as an image (PNG) that users can download or share (WhatsApp, email…).
export interface ReceiptData { title: string; amount: string; status: string; positive: boolean; rows: [string, string][]; name?: string }

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/(\s+|(?<=_))/), lines: string[] = []
  let line = ''
  for (const w of words) { const t = line + w; if (ctx.measureText(t).width > max && line) { lines.push(line.trim()); line = w } else line = t }
  if (line.trim()) lines.push(line.trim())
  // break very long tokens (references)
  return lines.flatMap((l) => { if (ctx.measureText(l).width <= max) return [l]; const out: string[] = []; let cur = ''; for (const ch of l) { if (ctx.measureText(cur + ch).width > max) { out.push(cur); cur = ch } else cur += ch } if (cur) out.push(cur); return out })
}

const FONT = 'Inter, "SF Pro Display", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src })
const tone = (st: string) => /success|paid|complete|valid|done/i.test(st) ? { fg: '#059669', bg: '#d1fae5', mark: 'ok' }
  : /fail|closed|not|revers|refund/i.test(st) ? { fg: '#e11d48', bg: '#ffe4e6', mark: 'bad' } : { fg: '#b45309', bg: '#fef3c7', mark: 'wait' }

/** A clean, modern receipt card (light, printable) drawn on a canvas at 2× phone width. */
export async function receiptPng(d: ReceiptData): Promise<Blob> {
  const W = 1080, M = 64, P = 72, CW = W - M * 2
  const c = document.createElement('canvas'), ctx = c.getContext('2d')!
  ctx.font = `600 32px ${FONT}`
  const valMax = CW - P * 2 - 330
  const rowLines = d.rows.map(([, v]) => wrap(ctx, v, valMax))
  const rowsH = rowLines.reduce((a, l) => a + Math.max(1, l.length) * 42 + 46, 0)
  const cardTop = 150, headH = 640, H = cardTop + headH + rowsH + 300
  c.width = W; c.height = H
  // backdrop
  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#ecfdf5'); bg.addColorStop(0.55, '#f8fafc'); bg.addColorStop(1, '#fef9c3')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  const blob = (x: number, y: number, r: number, col: string) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2) }
  blob(120, 80, 420, 'rgba(52,211,153,.35)'); blob(W - 80, H - 120, 460, 'rgba(251,191,36,.25)')
  // brand row
  const logo = await loadImg(`${import.meta.env.BASE_URL}favicon.svg`)
  if (logo) ctx.drawImage(logo, M, 44, 72, 72)
  ctx.fillStyle = '#0f172a'; ctx.font = `800 52px ${FONT}`; ctx.fillText('luda', M + (logo ? 92 : 0), 98)
  ctx.fillStyle = '#10b981'; ctx.fillText('.', M + (logo ? 92 : 0) + ctx.measureText('luda').width, 98)
  ctx.fillStyle = '#64748b'; ctx.font = `600 28px ${FONT}`; const lbl = 'PAYMENT RECEIPT'; ctx.fillText(lbl, W - M - ctx.measureText(lbl).width, 92)
  // card with ticket notches
  const cardH = H - cardTop - 110, sepY = cardTop + headH - 40
  ctx.save(); ctx.shadowColor = 'rgba(15,23,42,.12)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(M, cardTop, CW, cardH, 44); ctx.fill(); ctx.restore()
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'
  for (const x of [M, W - M]) { ctx.beginPath(); ctx.arc(x, sepY, 30, 0, Math.PI * 2); ctx.fill() }
  ctx.restore()
  ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.restore()
  // status mark
  const t = tone(d.status), cx = W / 2, cy = cardTop + 130
  ctx.fillStyle = t.bg; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = t.fg; ctx.beginPath(); ctx.arc(cx, cy, 48, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath()
  if (t.mark === 'ok') { ctx.moveTo(cx - 20, cy + 1); ctx.lineTo(cx - 5, cy + 16); ctx.lineTo(cx + 22, cy - 14) }
  else if (t.mark === 'bad') { ctx.moveTo(cx - 16, cy - 16); ctx.lineTo(cx + 16, cy + 16); ctx.moveTo(cx + 16, cy - 16); ctx.lineTo(cx - 16, cy + 16) }
  else { ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx + 14, cy + 12) }
  ctx.stroke()
  // amount + title + status
  const center = (txt: string, y: number) => ctx.fillText(txt, (W - ctx.measureText(txt).width) / 2, y)
  ctx.fillStyle = '#0f172a'; ctx.font = `800 104px ${FONT}`; center(d.amount, cardTop + 330)
  ctx.fillStyle = '#334155'; ctx.font = `600 38px ${FONT}`; center(d.title.length > 42 ? d.title.slice(0, 41) + '…' : d.title, cardTop + 400)
  ctx.font = `700 28px ${FONT}`; const sw = ctx.measureText(d.status).width + 56
  ctx.fillStyle = t.bg; ctx.beginPath(); ctx.roundRect((W - sw) / 2, cardTop + 440, sw, 58, 29); ctx.fill()
  ctx.fillStyle = t.fg; center(d.status, cardTop + 479)
  // dashed separator
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3; ctx.setLineDash([14, 12]); ctx.beginPath(); ctx.moveTo(M + 48, sepY); ctx.lineTo(W - M - 48, sepY); ctx.stroke(); ctx.setLineDash([])
  // rows
  let y = sepY + 70
  d.rows.forEach(([k], i) => {
    ctx.fillStyle = '#64748b'; ctx.font = `500 30px ${FONT}`; ctx.fillText(k, M + P, y)
    ctx.fillStyle = '#0f172a'; ctx.font = `${k === 'Reference' ? '600 28px ui-monospace, Menlo, monospace' : `650 32px ${FONT}`}`
    rowLines[i].forEach((l, j) => { const w = ctx.measureText(l).width; ctx.fillText(l, W - M - P - w, y + j * 42) })
    y += Math.max(1, rowLines[i].length) * 42 + 46
  })
  // footer inside card
  const fy = cardTop + cardH - 70
  ctx.fillStyle = '#ecfdf5'; ctx.beginPath(); ctx.roundRect(M + P, fy - 60, CW - P * 2, 84, 24); ctx.fill()
  ctx.fillStyle = '#047857'; ctx.font = `600 26px ${FONT}`; center('🔒 Secured by Luda · we never ask for your PIN', fy - 8)
  // below card
  ctx.fillStyle = '#94a3b8'; ctx.font = `500 24px ${FONT}`
  center(`${d.name ? d.name + ' · ' : ''}Generated ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, H - 50)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the receipt'))), 'image/png'))
}

const fileName = (d: ReceiptData) => `luda-receipt-${(d.rows.find(([k]) => k === 'Reference')?.[1] ?? Date.now()).toString().slice(-10)}.png`

export async function downloadReceipt(d: ReceiptData) {
  const url = URL.createObjectURL(await receiptPng(d))
  const a = document.createElement('a'); a.href = url; a.download = fileName(d); document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Shares the receipt image (WhatsApp, email…) where the phone supports it; otherwise shares the text; otherwise downloads. */
export async function shareReceipt(d: ReceiptData): Promise<'shared' | 'downloaded'> {
  const file = new File([await receiptPng(d)], fileName(d), { type: 'image/png' })
  const text = `Luda receipt · ${d.title} · ${d.amount} · ${d.status}\n` + d.rows.map(([k, v]) => `${k}: ${v}`).join('\n')
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Luda receipt', text }); return 'shared' }
    if (navigator.share) { await navigator.share({ title: 'Luda receipt', text }); return 'shared' }
  } catch (e) { if ((e as { name?: string })?.name === 'AbortError') return 'shared' }
  await downloadReceipt(d); return 'downloaded'
}
