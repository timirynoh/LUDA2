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

export async function receiptPng(d: ReceiptData): Promise<Blob> {
  const W = 1080, pad = 72
  const c = document.createElement('canvas'), ctx = c.getContext('2d')!
  // measure height first
  ctx.font = '600 34px system-ui, sans-serif'
  const rowLines = d.rows.map(([, v]) => wrap(ctx, v, W - pad * 2 - 360))
  const H = 620 + rowLines.reduce((a, l) => a + Math.max(1, l.length) * 46 + 40, 0) + 200
  c.width = W; c.height = H
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, W, H)
  const g = ctx.createLinearGradient(0, 0, W, 360); g.addColorStop(0, '#10b981'); g.addColorStop(1, '#065f46')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 360)
  ctx.fillStyle = '#ffffff'; ctx.font = '800 64px system-ui, sans-serif'; ctx.fillText('luda.', pad, 120)
  ctx.font = '500 32px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText('Transaction receipt', pad, 172)
  ctx.font = '800 92px system-ui, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(d.amount, pad, 300)
  ctx.font = '700 40px system-ui, sans-serif'; ctx.fillStyle = '#e5e7eb'; ctx.fillText(d.title, pad, 440)
  ctx.font = '600 30px system-ui, sans-serif'
  const st = d.status, sw = ctx.measureText(st).width + 48
  ctx.fillStyle = /success/i.test(st) ? 'rgba(16,185,129,.2)' : /fail|closed|not/i.test(st) ? 'rgba(244,63,94,.2)' : 'rgba(251,191,36,.2)'
  ctx.beginPath(); ctx.roundRect(pad, 470, sw, 56, 28); ctx.fill()
  ctx.fillStyle = /success/i.test(st) ? '#6ee7b7' : /fail|closed|not/i.test(st) ? '#fda4af' : '#fcd34d'; ctx.fillText(st, pad + 24, 508)
  let y = 600
  d.rows.forEach(([k], i) => {
    ctx.fillStyle = '#9ca3af'; ctx.font = '500 32px system-ui, sans-serif'; ctx.fillText(k, pad, y + 34)
    ctx.fillStyle = '#f3f4f6'; ctx.font = '600 34px system-ui, sans-serif'
    rowLines[i].forEach((l, j) => { const w = ctx.measureText(l).width; ctx.fillText(l, W - pad - w, y + 34 + j * 46) })
    y += Math.max(1, rowLines[i].length) * 46 + 40
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(pad, y - 20, W - pad * 2, 2)
  })
  ctx.fillStyle = '#6b7280'; ctx.font = '500 28px system-ui, sans-serif'
  ctx.fillText(`${d.name ? d.name + ' · ' : ''}Generated ${new Date().toLocaleString()}`, pad, H - 110)
  ctx.fillText('Keep the reference for support. Luda never asks for your PIN.', pad, H - 66)
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
