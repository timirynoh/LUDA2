import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Bookmark, Heart, Pin, Plus, Share2, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Header, Sheet } from '../components/ui'
import { Link } from 'react-router-dom'
import { COUNTRIES } from '../lib/data'
import { fmt } from '../lib/fx'
import { challengesFor, newsFeed, NOTIF_CATS, SPIN, type News, type NewsCat } from '../lib/growth'
import { checkText } from '../lib/moderation'
import { uid, useStore } from '../lib/store'
import { LIVE, api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { disablePush, enablePush, needsInstall, pushPrefs, pushTest, serverPushActive } from '../lib/push'

const today = () => new Date().toISOString().slice(0, 10)

/* ------------------------------ Daily check-in & spin ------------------------------ */

export function CheckinCard() {
  const { s } = useStore()
  const { rewards } = useLive()
  const [open, setOpen] = useState(false)
  const done = LIVE ? !rewards || rewards.spunToday : s.spin.last === today()
  if (done && !open) return null
  return (
    <>
      {!done && <motion.button initial={{ scale: 0.97 }} animate={{ scale: 1 }} onClick={() => setOpen(true)} className="relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-r from-yellow-300 via-orange-400 to-pink-500 p-4 text-start text-ink-950">
        <motion.span className="text-4xl" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}>🎡</motion.span>
        <div className="flex-1"><p className="font-extrabold">Daily check-in</p><p className="text-sm font-medium text-ink-950/80">Spin to win XP, points or cash · 🔥 {s.streak}-day streak</p></div>
        <span className="chip bg-ink-950 py-2 text-white">Spin</span>
      </motion.button>}
      {open && <SpinSheet onClose={() => setOpen(false)} />}
    </>
  )
}

export function SpinSheet({ onClose }: { onClose: () => void }) {
  const { s, set, reward, addTx } = useStore()
  const { refresh, refreshRewards } = useLive()
  const [rot, setRot] = useState(0)
  const [won, setWon] = useState<number | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [note, setNote] = useState('')
  const seg = 360 / SPIN.length
  const spin = async () => {
    if (LIVE) {
      // Live: the server draws the prize (once a day) and pays it; the wheel only shows the result.
      if (spinning) return
      setSpinning(true); setNote('')
      try {
        const r = await api<{ index: number; cash: number; points: number; swapped: boolean; streak: number; verifiedOnlyCash: boolean }>('POST', 'spin')
        setRot(360 * 6 + (360 - r.index * seg - seg / 2))
        setTimeout(() => {
          setWon(r.index); setSpinning(false)
          setNote(r.cash ? `₺${r.cash / 100} added to your Lira wallet 🎉` : r.swapped ? 'This month\'s cash prizes are all given out, so you got points instead.' : r.verifiedOnlyCash ? 'Verify your ID to win cash prizes too.' : '')
          void refresh(); void refreshRewards()
        }, 3600)
      } catch (e) { setSpinning(false); setNote(e instanceof Error ? e.message : 'Try again') }
      return
    }
    if (spinning || s.spin.last === today()) return
    const total = SPIN.reduce((a, p) => a + p.weight, 0)
    let r = Math.random() * total, idx = 0
    for (; idx < SPIN.length; idx++) { r -= SPIN[idx].weight; if (r <= 0) break }
    idx = Math.min(idx, SPIN.length - 1)
    const bonus = s.streak > 0 && s.streak % 7 === 0 ? 2 : 1
    setSpinning(true)
    setRot(360 * 6 + (360 - idx * seg - seg / 2))
    setTimeout(() => {
      const p = SPIN[idx]
      setWon(idx); setSpinning(false)
      set((st) => ({ ...st, spin: { last: today(), total: st.spin.total + 1 }, points: st.points + (p.points ?? 0) * bonus, balances: p.tl ? { ...st.balances, TRY: (st.balances.TRY ?? 0) + p.tl * bonus } : st.balances }))
      if (p.tl) addTx({ type: 'reward', amount: p.tl * bonus, currency: 'TRY', label: 'Daily spin prize 🎡' })
      reward((p.xp ?? 5) * bonus, { badge: p.tl ? 'lucky' : undefined, title: `You won ${p.label}${bonus > 1 ? ' ×2 (7-day streak!)' : ''}` })
    }, 3600)
  }
  return (
    <Sheet open onClose={onClose} title="🎡 Daily spin">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-72">
          <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 text-3xl drop-shadow">🔻</div>
          <motion.svg viewBox="-100 -100 200 200" className="size-full drop-shadow-2xl" animate={{ rotate: rot }} transition={{ duration: 3.5, ease: [0.15, 0.85, 0.2, 1] }}>
            {SPIN.map((p, i) => {
              const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180
              const mid = ((i + 0.5) * seg - 90) * Math.PI / 180
              return (
                <g key={i}>
                  <path d={`M0 0 L${95 * Math.cos(a0)} ${95 * Math.sin(a0)} A95 95 0 0 1 ${95 * Math.cos(a1)} ${95 * Math.sin(a1)} Z`} fill={p.color} stroke="#0c1019" strokeWidth="2" />
                  <text x={62 * Math.cos(mid)} y={62 * Math.sin(mid)} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="800" fill="#0c1019" transform={`rotate(${(i + 0.5) * seg} ${62 * Math.cos(mid)} ${62 * Math.sin(mid)})`}>{p.label}</text>
                </g>
              )
            })}
            <circle r="18" fill="#0c1019" stroke="#fbbf24" strokeWidth="4" /><text textAnchor="middle" dominantBaseline="middle" fontSize="14">✨</text>
          </motion.svg>
        </div>
        <AnimatePresence>{won !== null && <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-2xl font-extrabold">{SPIN[won].emoji} {SPIN[won].label}!</motion.p>}</AnimatePresence>
        {note && <p className="text-center text-sm text-slate-300">{note}</p>}
        {won === null ? <button className="btn-gold w-full py-4 text-lg" disabled={spinning} onClick={() => void spin()}>{spinning ? 'Spinning…' : 'SPIN'}</button>
          : <button className="btn-primary w-full py-4" onClick={onClose}>Come back tomorrow 👋</button>}
        <p className="text-center text-xs text-slate-500">{LIVE ? 'One spin a day · cash prizes for ID-verified accounts · paid by Luda' : 'One spin a day · keep a 7-day streak to double your prize'}</p>
      </div>
    </Sheet>
  )
}

/* ------------------------------ News & alerts ------------------------------ */

const CATS: ('All' | NewsCat)[] = ['All', 'Safety', 'Residency', 'University', 'Utilities', 'Transport', 'Events', 'Luda']
const ago = (ts: number) => { const h = Math.round((Date.now() - ts) / 3_600_000); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago` }

export function useNews() {
  const { s } = useStore()
  return useMemo(() => [...s.myNews, ...newsFeed()].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.ts - a.ts), [s.myNews])
}

export function NewsScreen() {
  const { s, set } = useStore()
  const all = useNews()
  const [cat, setCat] = useState<'All' | NewsCat | 'Saved'>('All')
  const [posting, setPosting] = useState(false)
  const list = all.filter((n) => cat === 'All' || (cat === 'Saved' ? s.newsSaved.includes(n.id) : n.cat === cat))
  const toggle = (k: 'newsLiked' | 'newsSaved', id: string) => set((p) => ({ ...p, [k]: p[k].includes(id) ? p[k].filter((x) => x !== id) : [...p[k], id] }))
  return (
    <div>
      <Header back title="What's happening" sub="News, alerts & announcements" right={s.isAdmin ? <button className="btn-primary size-11 rounded-2xl p-0" aria-label="Post announcement" onClick={() => setPosting(true)}><Plus size={20} /></button> : undefined} />
      <div className="flex flex-col gap-3 px-5">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5">{[...CATS, 'Saved' as const].map((c) => <button key={c} onClick={() => setCat(c)} className={`chip shrink-0 px-4 py-2 text-sm ${cat === c ? 'bg-gradient-to-r from-mint-400 to-emerald-500 text-ink-950' : 'glass text-slate-300'}`}>{c === 'Saved' ? '🔖 Saved' : c}</button>)}</div>
        {list.map((n, i) => (
          <motion.article key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }} className={`card ${n.cat === 'Safety' ? 'border-rose-400/30 bg-rose-500/5' : ''}`}>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {n.pinned && <Pin size={12} className="text-rose-300" />}<span className="chip bg-fg/5 py-0.5 text-slate-300">{n.emoji} {n.cat}</span>
              {n.official && <span className="chip bg-mint-400/15 py-0.5 text-mint-300">✓ Luda</span>}<span className="ms-auto">{ago(n.ts)}</span>
            </div>
            <p className="mt-2 font-bold">{n.title}</p>
            <p className="mt-1 text-sm text-slate-300">{n.body}</p>
            <div className="mt-3 flex gap-2 text-xs">
              <button onClick={() => toggle('newsLiked', n.id)} className={`chip py-1.5 ${s.newsLiked.includes(n.id) ? 'bg-rose-500/15 text-rose-300' : 'bg-fg/5 text-slate-400'}`}><Heart size={12} className={s.newsLiked.includes(n.id) ? 'fill-rose-400' : ''} /> {s.newsLiked.includes(n.id) ? 'Liked' : 'Like'}</button>
              <button onClick={() => toggle('newsSaved', n.id)} className={`chip py-1.5 ${s.newsSaved.includes(n.id) ? 'bg-gold-400/15 text-gold-300' : 'bg-fg/5 text-slate-400'}`}><Bookmark size={12} /> {s.newsSaved.includes(n.id) ? 'Saved' : 'Save'}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`${n.title}: ${n.body} (via Luda)`)}`} target="_blank" rel="noreferrer" className="chip bg-fg/5 py-1.5 text-slate-400"><Share2 size={12} /> Share</a>
            </div>
          </motion.article>
        ))}
        {!list.length && <p className="card text-center text-sm text-slate-400">Nothing here yet.</p>}
        <p className="text-center text-[11px] text-slate-500">Sample stories in the demo. In the live app the Luda team and official sources post here.</p>
      </div>
      {posting && <PostNews onClose={() => setPosting(false)} />}
    </div>
  )
}

function PostNews({ onClose }: { onClose: () => void }) {
  const { set, notify, toast } = useStore()
  const [f, setF] = useState({ cat: 'Luda' as NewsCat, title: '', body: '', pinned: false })
  const post = () => {
    if (!checkText(`${f.title} ${f.body}`).ok) return toast({ title: 'Please keep it respectful', emoji: '⚠️' })
    const n: News = { id: uid(), cat: f.cat, title: f.title.trim(), body: f.body.trim(), ts: Date.now(), official: true, emoji: { Residency: '🪪', University: '🎓', Utilities: '⚡', Safety: '🚨', Events: '🎉', Transport: '🚌', Luda: '✨' }[f.cat], pinned: f.pinned, mine: true }
    set((p) => ({ ...p, myNews: [n, ...p.myNews] })); notify(n.emoji, n.title, '/news'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Post announcement">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">{CATS.slice(1).map((c) => <button key={c} onClick={() => setF({ ...f, cat: c as NewsCat })} className={`chip py-1.5 ${f.cat === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{c}</button>)}</div>
        <input className="input" placeholder="Headline" maxLength={90} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea className="input min-h-28" placeholder="Details" maxLength={600} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-emerald-500" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin to top</label>
        <button className="btn-primary py-4" disabled={f.title.trim().length < 5 || f.body.trim().length < 10} onClick={post}>Publish to everyone</button>
      </div>
    </Sheet>
  )
}

export function NewsPreview() {
  const all = useNews()
  return (
    <section>
      <div className="mb-2 flex items-center justify-between"><p className="label">📰 What's happening</p><Link to="/news" className="text-xs text-mint-300">See all</Link></div>
      <div className="card divide-y divide-fg/5 p-1">
        {all.slice(0, 3).map((n) => (
          <Link key={n.id} to="/news" className="flex items-start gap-3 px-3 py-3">
            <span className="text-xl">{n.emoji}</span><span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-semibold">{n.title}</span><span className="block text-[11px] text-slate-500">{n.cat} · {ago(n.ts)}</span></span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------ Monthly challenges ------------------------------ */

export function Challenges() { return LIVE ? <LiveChallenges /> : <DemoChallenges /> }

function DemoChallenges() {
  const { s, set, reward, addTx } = useStore()
  const now = new Date()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  const daysLeft = Math.ceil((Date.parse(monthEnd + 'T23:59:59') - Date.now()) / 86_400_000)
  const inMonth = (ts: number) => new Date(ts).getMonth() === now.getMonth() && new Date(ts).getFullYear() === now.getFullYear()
  const progress: Record<string, number> = {
    'c-bills': s.txs.filter((t) => t.type === 'bill' && t.amount < 0 && inMonth(t.ts)).length,
    'c-save': s.txs.filter((t) => t.label.startsWith('Saved to') && inMonth(t.ts)).reduce((a, t) => a + Math.abs(t.amount), 0),
    'c-swap': s.trades.filter((t) => t.status === 'completed' && inMonth(t.createdAt)).length,
  }
  const list = challengesFor(monthEnd)
  const me = COUNTRIES.find((c) => c.code === s.country)!
  const cup = [{ flag: '🇳🇬', name: 'Nigeria', v: 284000 }, { flag: '🇿🇼', name: 'Zimbabwe', v: 142000 }, { flag: '🇨🇲', name: 'Cameroon', v: 131000 }, { flag: '🇬🇭', name: 'Ghana', v: 118000 }, { flag: '🇨🇩', name: 'DR Congo', v: 97000 }, { flag: '🇰🇪', name: 'Kenya', v: 64000 }]
    .map((r) => (r.name === me.name ? { ...r, v: r.v + progress['c-save'], me: true } : r)).sort((a, b) => b.v - a.v)
  const claim = (id: string, prize: string) => {
    set((p) => ({ ...p, challenges: [...p.challenges, `claimed:${id}`], points: p.points + (id === 'c-bills' ? 300 : 0), balances: id === 'c-save' ? { ...p.balances, TRY: (p.balances.TRY ?? 0) + 20 } : p.balances }))
    if (id === 'c-save') addTx({ type: 'reward', amount: 20, currency: 'TRY', label: 'Challenge prize: Save ₺1,000' })
    reward(100, { badge: 'challenger', title: `Challenge complete: ${prize}` })
  }
  return (
    <div>
      <Header back title="Monthly challenges" sub={`${daysLeft} days left this month`} />
      <div className="flex flex-col gap-3 px-5">
        {list.filter((c) => c.kind === 'personal').map((c) => {
          const joined = s.challenges.includes(c.id), claimed = s.challenges.includes(`claimed:${c.id}`)
          const pct = Math.min(1, (progress[c.id] ?? 0) / c.goal)
          return (
            <div key={c.id} className="card">
              <div className="flex items-center gap-3"><span className="text-3xl">{c.emoji}</span>
                <div className="flex-1"><p className="font-bold">{c.title}</p><p className="text-xs text-slate-400">{c.desc}</p></div></div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-fg/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-mint-400" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} /></div>
              <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-400">{c.unit === '₺' ? fmt(progress[c.id] ?? 0, 'TRY') : progress[c.id] ?? 0} / {c.unit === '₺' ? fmt(c.goal, 'TRY') : `${c.goal} ${c.unit}`} · 🎁 {c.prize}</span>
                {claimed ? <span className="chip bg-mint-400/15 text-mint-300">✓ Claimed</span> : !joined ? <button className="chip bg-mint-400 py-1.5 text-ink-950" onClick={() => set((p) => ({ ...p, challenges: [...p.challenges, c.id] }))}>Join</button>
                  : pct >= 1 ? <button className="chip bg-gold-400 py-1.5 text-ink-950" onClick={() => claim(c.id, c.prize)}>Claim prize</button> : <span className="chip bg-fg/5 text-slate-300">Joined</span>}</div>
            </div>
          )
        })}
        <section className="card">
          <p className="flex items-center gap-2 font-bold"><Trophy size={18} className="text-gold-300" /> Country savings cup</p>
          <p className="mb-2 text-xs text-slate-400">Every lira you save in pots this month counts for {me.flag} {me.name}. Winner: ₺5,000 community party.</p>
          {cup.map((r, i) => (
            <div key={r.name} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${'me' in r ? 'bg-mint-400/10' : ''}`}>
              <span className={`w-5 text-center font-bold ${i < 3 ? 'text-gold-300' : 'text-slate-500'}`}>{i + 1}</span><span className="text-xl">{r.flag}</span><span className="flex-1 text-sm font-semibold">{r.name}</span><span className="text-sm text-slate-400">{fmt(r.v, 'TRY')}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

/** Live: challenges, progress and prizes all come from the server (progress = what really happened this month). */
const LIVE_CH: Record<string, { title: string; emoji: string; desc: string; unit: string }> = {
  'c-bills': { title: 'Bill boss', emoji: '⚡', desc: 'Pay 3 bills with Luda this month', unit: 'bills' },
  'c-save': { title: 'Save ₺1,000', emoji: '🐷', desc: 'Put ₺1,000 into savings pots this month', unit: '₺' },
  'c-p2p': { title: 'Safe swapper', emoji: '🔒', desc: 'Complete 2 P2P trades this month', unit: 'trades' },
}
function LiveChallenges() {
  const { s } = useStore()
  const { rewards, refresh, refreshRewards } = useLive()
  const [cup, setCup] = useState<{ country: string; saved: number; savers: number }[] | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { api<{ cup: { country: string; saved: number; savers: number }[] }>('GET', 'country-cup').then((r) => setCup(r.cup)).catch(() => setCup([])) }, [])
  const now = new Date(), monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const daysLeft = Math.max(1, Math.ceil((monthEnd.getTime() + 86_400_000 - now.getTime()) / 86_400_000))
  const me = COUNTRIES.find((c) => c.code === s.country)
  const claim = async (id: string) => {
    setMsg('')
    try { const r = await api<{ cash: number; points: number }>('POST', 'challenge-claim', { id }); setMsg(r.cash ? `₺${r.cash / 100} added to your Lira wallet 🎉` : `+${r.points} points 🎉`); void refresh(); void refreshRewards() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Try again') }
  }
  return (
    <div>
      <Header back title="Monthly challenges" sub={`${daysLeft} days left this month`} />
      <div className="flex flex-col gap-3 px-5">
        {msg && <p className="rounded-2xl bg-mint-400/10 p-3 text-center text-sm text-mint-100">{msg}</p>}
        {!rewards && <p className="text-sm text-slate-500">Loading…</p>}
        {rewards?.challenges.map((c) => {
          const meta = LIVE_CH[c.id] ?? { title: c.id, emoji: '🏆', desc: '', unit: '' }
          const pct = Math.min(1, c.progress / c.goal)
          return (
            <div key={c.id} className="card">
              <div className="flex items-center gap-3"><span className="text-3xl">{meta.emoji}</span>
                <div className="flex-1"><p className="font-bold">{meta.title}</p><p className="text-xs text-slate-400">{meta.desc}</p></div></div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-fg/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-mint-400" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} /></div>
              <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-400">{meta.unit === '₺' ? `₺${(c.progress / 100).toLocaleString('en-US')} / ₺${(c.goal / 100).toLocaleString('en-US')}` : `${c.progress} / ${c.goal} ${meta.unit}`} · 🎁 {c.prize}</span>
                {c.claimed ? <span className="chip bg-mint-400/15 text-mint-300">✓ Claimed</span> : pct >= 1 ? <button className="chip bg-gold-400 py-1.5 text-ink-950" onClick={() => void claim(c.id)}>Claim prize</button> : <span className="chip bg-fg/5 text-slate-300">In progress</span>}</div>
            </div>
          )
        })}
        <p className="text-[11px] text-slate-500">Progress is counted by Luda from what you really did this month. Cash prizes need a verified ID.</p>
        <section className="card">
          <p className="flex items-center gap-2 font-bold"><Trophy size={18} className="text-gold-300" /> Country savings cup</p>
          <p className="mb-2 text-xs text-slate-400">Lira saved into pots this month, by country. Every lira you save counts for {me?.flag} {me?.name}.</p>
          {!cup ? <p className="text-xs text-slate-500">Loading…</p> : cup.length === 0 ? <p className="text-xs text-slate-500">No savings yet this month. Be the first for your country!</p>
            : cup.map((r, i) => { const c = COUNTRIES.find((x) => x.code === r.country); return (
              <div key={r.country} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${r.country === s.country ? 'bg-mint-400/10' : ''}`}>
                <span className={`w-5 text-center font-bold ${i < 3 ? 'text-gold-300' : 'text-slate-500'}`}>{i + 1}</span><span className="text-xl">{c?.flag ?? '🌍'}</span><span className="flex-1 text-sm font-semibold">{c?.name ?? r.country}</span><span className="text-sm text-slate-400">₺{(r.saved / 100).toLocaleString('en-US')}</span>
              </div>) })}
        </section>
      </div>
    </div>
  )
}

/* ------------------------------ Notification settings ------------------------------ */

export function NotificationSettings() {
  const { s, set, toast } = useStore()
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [busy, setBusy] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)
  const on = LIVE ? s.pushOn && serverPushActive() : s.pushOn
  const enable = async () => {
    if (LIVE) {
      setBusy(true)
      const r = await enablePush(s.notifPrefs)
      setBusy(false)
      if (r === 'on') {
        set((p) => ({ ...p, pushOn: true }))
        const t = await pushTest().catch(() => ({ sent: 0 }))
        toast({ title: t.sent ? 'Notifications are on. Check your phone' : 'Notifications are on', emoji: '🔔' })
      } else if (r === 'install') setIosHelp(true)
      else if (r === 'denied') toast({ title: 'Notifications blocked. Allow them in your phone/browser settings', emoji: '🔕' })
      else if (r === 'unsupported') toast({ title: 'This browser doesn’t support notifications here', emoji: 'ℹ️' })
      else toast({ title: 'Couldn’t turn on notifications. Please try again', emoji: '⚠️' })
      return
    }
    if (!supported) return toast({ title: 'This browser doesn’t support notifications here', emoji: 'ℹ️' })
    const r = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
    if (r === 'granted') { set((p) => ({ ...p, pushOn: true })); new Notification('🔔 Luda', { body: 'Notifications are on. We’ll only send what you choose.' }) }
    else toast({ title: 'Notifications blocked. Allow them in your phone/browser settings', emoji: '🔕' })
  }
  const disable = async () => {
    if (LIVE) { setBusy(true); await disablePush(); setBusy(false) }
    set((p) => ({ ...p, pushOn: false }))
  }
  const toggle = (key: string) => {
    const next = { ...s.notifPrefs, [key]: !s.notifPrefs[key as keyof typeof s.notifPrefs] }
    set((p) => ({ ...p, notifPrefs: next }))
    if (LIVE) void pushPrefs(next)
  }
  return (
    <section className="card">
      <div className="flex items-center gap-3">
        <Bell className={on ? 'text-mint-300' : 'text-slate-500'} />
        <div className="flex-1"><p className="font-semibold">Phone notifications</p><p className="text-xs text-slate-400">{on ? 'On: choose what you want below' : 'Get alerts for money, classes, chats & more'}</p></div>
        {on ? <button className="chip bg-fg/5 py-2 text-slate-300" disabled={busy} onClick={() => void disable()}>Turn off</button> : <button className="btn-primary px-3 py-2 text-sm" disabled={busy} onClick={() => void enable()}>{busy ? '…' : 'Turn on'}</button>}
      </div>
      {LIVE && !on && (iosHelp || needsInstall()) && (
        <div className="mt-3 rounded-2xl bg-sky-400/10 p-3 text-xs text-sky-100">
          <p className="font-semibold">📱 On iPhone or iPad</p>
          <p className="mt-1">Apple only allows notifications in apps on the Home Screen. In Safari tap Share, then “Add to Home Screen”. Open Luda from the new icon and turn notifications on there.</p>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {NOTIF_CATS.map((c) => (
          <button key={c.key} onClick={() => toggle(c.key)}
            className={`rounded-2xl p-2.5 text-start text-xs font-semibold ${s.notifPrefs[c.key] ? 'bg-mint-400/15 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/5 text-slate-400'}`}>{c.emoji} {c.label}</button>
        ))}
      </div>
      {LIVE && on && <button className="mt-3 w-full rounded-2xl bg-fg/5 py-2.5 text-xs font-semibold text-slate-300" disabled={busy}
        onClick={async () => { const t = await pushTest().catch(() => ({ sent: 0 })); toast({ title: t.sent ? 'Test sent. Check your phone' : 'Couldn’t reach this phone. Turn notifications off and on again', emoji: t.sent ? '🔔' : '⚠️' }) }}>Send a test notification</button>}
      <p className="mt-2 text-[11px] text-slate-500">{LIVE ? 'Luda sends these from its server, so they arrive even when the app is closed. Everything also appears in your 🔔 inbox.' : 'Everything also appears in your 🔔 inbox.'}</p>
    </section>
  )
}
