import { motion } from 'framer-motion'
import { AtSign, Copy, QrCode, Search, Send as SendIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useMemo, useState } from 'react'
import { DemoNote, Header, PinPad, Segmented, Sheet, Success } from '../components/ui'
import { CURRENCIES } from '../lib/data'
import { convert, fmt, useRates } from '../lib/fx'
import { checkText } from '../lib/moderation'
import { DIRECTORY, personOf, usernameOf } from '../lib/social'
import { uid, useStore } from '../lib/store'

/** Instant, free Luda-to-Luda transfers by @username or QR. */
export default function Send() {
  const { s, toast } = useStore()
  const [tab, setTab] = useState<'send' | 'receive'>('send')
  const [q, setQ] = useState('')
  const [to, setTo] = useState<string | null>(null)
  const me = s.account?.username ?? usernameOf(s.name)
  const recent = [...new Set(s.sent.map((x) => x.to))].slice(0, 5)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^@/, '')
    return DIRECTORY.filter((n) => !t || n.toLowerCase().includes(t) || usernameOf(n).includes(t))
  }, [q])
  const link = `luda://pay/@${me}`
  return (
    <div>
      <Header back title="Send money" sub="Free & instant between Luda users" />
      <div className="flex flex-col gap-3 px-5">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'send', label: '💸 Send' }, { value: 'receive', label: '📥 Receive' }]} />
        {tab === 'send' ? <>
          <div className="relative"><Search size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input ps-11" placeholder="Name or @username" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {recent.length > 0 && !q && (
            <div><p className="label mb-2">Recent</p>
              <div className="flex gap-3 overflow-x-auto">{recent.map((n) => (
                <button key={n} onClick={() => setTo(n)} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center"><span className="grid size-14 place-items-center rounded-full bg-ink-700 text-2xl">{personOf(n).flag}</span><span className="line-clamp-1 text-[11px]">{n.split(' ')[0]}</span></button>
              ))}</div></div>
          )}
          <div className="card divide-y divide-fg/5 p-1">
            {list.map((n) => { const p = personOf(n); return (
              <button key={n} onClick={() => setTo(n)} className="flex w-full items-center gap-3 px-3 py-3 text-start">
                <span className="grid size-11 place-items-center rounded-full bg-ink-700 text-xl">{p.flag}</span>
                <span className="flex-1"><span className="block text-sm font-semibold">{n} {p.kyc && <span className="text-mint-400">✓</span>}</span><span className="text-xs text-slate-400">@{p.username} · {p.city}</span></span>
                <SendIcon size={16} className="text-slate-500" />
              </button>) })}
            {!list.length && <p className="p-4 text-center text-sm text-slate-400">No Luda user found. Check the @username.</p>}
          </div>
        </> : (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-3xl bg-white p-5"><QRCodeSVG value={link} size={200} /></div>
            <p className="flex items-center gap-1 text-xl font-extrabold"><AtSign size={18} />{me}</p>
            <p className="text-center text-sm text-slate-400">Friends scan this in Luda, or search your username, to send you money instantly.</p>
            <div className="grid w-full grid-cols-2 gap-2">
              <button className="btn-ghost text-sm" onClick={async () => { try { await navigator.clipboard.writeText(`@${me}`); toast({ title: 'Username copied', emoji: '📋' }) } catch { toast({ title: `@${me}`, emoji: '📋' }) } }}><Copy size={16} /> Copy</button>
              <a className="btn-primary text-sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Send me money on Luda: @${me} 💸`)}`}><QrCode size={16} /> Share</a>
            </div>
          </div>
        )}
      </div>
      <DemoNote />
      {to && <SendSheet to={to} onClose={() => setTo(null)} />}
    </div>
  )
}

function SendSheet({ to, onClose }: { to: string; onClose: () => void }) {
  const { s, set, addTx, reward, checkPin, gate, allow } = useStore()
  const { rates } = useRates()
  const p = personOf(to)
  const curs = Object.keys(s.balances).filter((c) => (s.balances[c] ?? 0) > 0)
  const [cur, setCur] = useState(curs[0] ?? 'TRY')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [stage, setStage] = useState<'form' | 'pin' | 'done'>('form')
  const [err, setErr] = useState('')
  const amt = +amount || 0
  const bal = s.balances[cur] ?? 0
  const next = () => {
    setErr('')
    if (!gate(2, 'Send money to friends')) return
    if (note && !checkText(note).ok) return setErr('Please keep the note respectful')
    const outToday = [...s.sent].filter((x) => new Date(x.ts).toDateString() === new Date().toDateString()).reduce((a, x) => a + convert(rates, x.amount, x.cur, 'TRY'), 0)
    if (outToday + convert(rates, amt, cur, 'TRY') > s.security.dailyWithdraw) return setErr(`Daily sending limit is ${fmt(s.security.dailyWithdraw, 'TRY')}. Change it in Security Center.`)
    if (!allow('send')) return
    setStage('pin')
  }
  const sendNow = async (pin: string) => {
    if (!(await checkPin(pin))) return setErr('Wrong PIN')
    set((st) => ({ ...st, balances: { ...st.balances, [cur]: (st.balances[cur] ?? 0) - amt }, sent: [{ id: uid(), to, amount: amt, cur, note, ts: Date.now() }, ...st.sent].slice(0, 100) }))
    addTx({ type: 'p2p', amount: -amt, currency: cur, label: `Sent to ${to}`, meta: note || 'Luda transfer' })
    reward(s.sent.length ? 5 : 30, { badge: 'generous', title: `${fmt(amt, cur)} sent to ${to.split(' ')[0]}` })
    setStage('done')
  }
  return (
    <Sheet open onClose={onClose} title={`Send to ${to}`}>
      {stage === 'done' ? <Success title="Sent instantly 💸" sub={`${fmt(amt, cur)} is already in ${to}'s wallet. Free.`} onClose={onClose} /> : stage === 'pin' ? (
        <div className="flex flex-col items-center gap-3"><p className="text-sm text-slate-300">Send {fmt(amt, cur)} to @{p.username}</p><PinPad error={err} onDone={sendNow} /></div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-full bg-ink-700 text-2xl">{p.flag}</span><div><p className="font-semibold">{to} {p.kyc && <span className="text-mint-400">✓</span>}</p><p className="text-xs text-slate-400">@{p.username} · {p.kyc ? 'KYC verified' : 'Not KYC verified, send carefully'}</p></div></div>
          <div className="flex gap-2 overflow-x-auto">{(curs.length ? curs : ['TRY']).map((c) => <button key={c} onClick={() => setCur(c)} className={`chip shrink-0 py-2 ${cur === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{CURRENCIES[c]?.flag} {c}</button>)}</div>
          <motion.input initial={{ scale: 0.98 }} animate={{ scale: 1 }} className="input py-4 text-3xl font-bold" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          <p className="text-xs text-slate-400">Balance {fmt(bal, cur)} · fee ₺0</p>
          <input className="input" placeholder="Note (e.g. rent share 🏠)" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" disabled={!amt || amt > bal} onClick={next}>{amt > bal ? 'Not enough balance' : `Send ${amt ? fmt(amt, cur) : ''}`}</button>
          <p className="text-center text-[11px] text-slate-500">Transfers are instant and can't be reversed. Only send to people you know.</p>
        </div>
      )}
    </Sheet>
  )
}
