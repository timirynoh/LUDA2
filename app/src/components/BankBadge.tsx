// Bank "logos": each bank's brand colour + short mark, drawn locally (no third-party image hosts, nothing leaks, always loads).
const BANKS: [RegExp, string, string, string][] = [
  // pattern, mark, background, text colour
  [/opay/i, 'O', '#1DCF9F', '#fff'], [/moniepoint/i, 'M', '#0357EE', '#fff'], [/kuda/i, 'K', '#40196D', '#fff'], [/palmpay/i, 'P', '#6B21A8', '#fff'],
  [/guaranty|gtbank|gtco/i, 'GT', '#DD4F05', '#fff'], [/access/i, 'A', '#F28C00', '#fff'], [/zenith/i, 'Z', '#E30613', '#fff'],
  [/united bank for africa|\buba\b/i, 'UBA', '#D42E12', '#fff'], [/first bank|firstbank/i, 'FB', '#003B65', '#F2B705'], [/fcmb|first city/i, 'FC', '#5C2D91', '#fff'],
  [/fidelity/i, 'F', '#0E1A5C', '#fff'], [/sterling/i, 'S', '#DB3A34', '#fff'], [/wema|alat/i, 'W', '#990066', '#fff'], [/stanbic/i, 'SI', '#0033A1', '#fff'],
  [/union bank/i, 'U', '#00AEEF', '#fff'], [/unity/i, 'U', '#8DC63F', '#fff'], [/ecobank/i, 'E', '#00567D', '#9BD31C'], [/keystone/i, 'K', '#004A8F', '#fff'],
  [/polaris/i, 'P', '#6E2C91', '#fff'], [/providus/i, 'P', '#F7A600', '#1f2937'], [/jaiz/i, 'J', '#006837', '#fff'], [/standard chartered/i, 'SC', '#0072AA', '#38D200'],
  [/globus/i, 'G', '#0B3A75', '#fff'], [/taj/i, 'T', '#0E7C3A', '#fff'], [/lotus/i, 'L', '#7A1E48', '#fff'], [/carbon/i, 'C', '#111827', '#fff'],
  [/vfd/i, 'V', '#E4002B', '#fff'], [/paga/i, 'P', '#E41E26', '#fff'], [/citibank/i, 'C', '#056DAE', '#fff'], [/titan/i, 'T', '#1C3F94', '#fff'],
]
/** Popular with students: shown first when nothing is typed. */
export const POPULAR = [/opay/i, /moniepoint/i, /kuda/i, /palmpay/i, /guaranty|gtbank/i, /access/i, /zenith/i, /united bank for africa/i, /first bank/i]
export const popularity = (name: string) => { const i = POPULAR.findIndex((r) => r.test(name)); return i < 0 ? 99 : i }

const PALETTE = ['#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#b45309', '#15803d', '#9d174d', '#334155']
function look(name: string) {
  const hit = BANKS.find(([r]) => r.test(name))
  if (hit) return { mark: hit[1], bg: hit[2], fg: hit[3] }
  const words = name.replace(/\b(bank|plc|limited|ltd|microfinance|mfb|of|nigeria|the)\b/gi, '').trim().split(/\s+/).filter(Boolean)
  const mark = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase()
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { mark, bg: PALETTE[h % PALETTE.length], fg: '#fff' }
}

export function BankBadge({ name, size = 36 }: { name: string; size?: number }) {
  const l = look(name)
  return (
    <span translate="no" aria-hidden className="grid shrink-0 place-items-center rounded-xl font-extrabold shadow-sm ring-1 ring-black/10"
      style={{ width: size, height: size, background: l.bg, color: l.fg, fontSize: size * (l.mark.length > 2 ? 0.3 : 0.4), letterSpacing: '-0.02em' }}>{l.mark}</span>
  )
}
