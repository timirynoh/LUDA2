import { motion } from 'framer-motion'
import { Check, ChevronRight, Copy, Gift, MapPin, Share2, Trophy, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ring, DemoNote, Header, PinPad, Sheet, Success } from '../components/ui'
import { CITIES } from '../lib/data'
import { fmt } from '../lib/fx'
import { AMBASSADOR_TIERS, dealsFor, REF_STAGES, REFERRAL, WELCOME_STEPS, type Deal, type RefStage } from '../lib/growth'
import { AREAS } from '../lib/housing'
import { uid, useStore, type State } from '../lib/store'
import { UNIVERSITIES } from '../lib/uni'

export const refCode = (s: State) => {
  const base = (s.account?.username ?? s.name ?? 'friend').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'FRIEND'
  return s.referral || `LUDA-${base}${(base.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 90) + 10}`
}
const paidCount = (s: State) => s.referrals.filter((r) => r.stage === 'paid').length

/* ------------------------------ Invite & earn ------------------------------ */

const FRIENDS: [string, string][] = [['Blessing', '🇳🇬'], ['Kwame', '🇬🇭'], ['Nyasha', '🇿🇼'], ['Aïcha', '🇨🇲'], ['Baraka', '🇰🇪'], ['Chinedu', '🇳🇬']]

export function Invite() {
  const { s, set, toast, reward } = useStore()
  const code = refCode(s)
  const [enter, setEnter] = useState('')
  const msg = `Join me on Luda 🇳🇬🇬🇭🇿🇼: wallet, SafeSwap, houses, jobs & more for Africans in North Cyprus. Use my code ${code} and we both get ₺${REFERRAL.reward} 🎁`
  const earned = paidCount(s) * REFERRAL.reward
  const thisMonth = s.referrals.filter((r) => r.stage === 'paid' && new Date(r.ts).getMonth() === new Date().getMonth()).length
  const share = () => {
    set((p) => ({ ...p, referral: code }))
    // Demo: two friends accept your invite and move through sign-up, KYC and top-up.
    const fresh = FRIENDS.filter(([n]) => !s.referrals.some((r) => r.name === n)).slice(0, 2)
    if (fresh.length) set((p) => ({ ...p, referrals: [...fresh.map(([name, flag], i) => ({ id: uid(), name, flag, stage: 'invited' as RefStage, ts: Date.now() + i * 1500 })), ...p.referrals] }))
  }
  return (
    <div>
      <Header back title="Invite & earn" sub={`₺${REFERRAL.reward} for you, ₺${REFERRAL.reward} for your friend`} />
      <div className="flex flex-col gap-3 px-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-400 via-emerald-700 to-emerald-950 p-5 text-white">
          <span className="absolute -right-4 -bottom-6 text-8xl opacity-20">🎁</span>
          <p className="text-sm text-white/80">You've earned</p><p className="text-4xl font-extrabold">{fmt(earned, 'TRY')}</p>
          <p className="mt-1 text-sm text-white/80">{paidCount(s)} friend{paidCount(s) === 1 ? '' : 's'} verified · {s.referrals.length - paidCount(s)} on the way</p>
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-black/20 p-3"><span className="flex-1 font-mono text-lg font-bold tracking-widest">{code}</span>
            <button className="chip bg-white/20 py-2 text-white" onClick={async () => { try { await navigator.clipboard.writeText(code); toast({ title: 'Code copied', emoji: '📋' }) } catch { toast({ title: code, emoji: '🎁' }) } }}><Copy size={12} /> Copy</button></div>
          <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" onClick={share} className="btn mt-3 w-full bg-white py-3 text-ink-950"><Share2 size={16} /> Invite on WhatsApp</a>
        </div>
        <div className="card text-sm">
          <p className="mb-2 font-semibold">How it works</p>
          <ol className="grid gap-1.5 text-slate-300">
            <li>1. Your friend signs up with your code</li><li>2. They verify phone + KYC and top up their wallet</li><li>3. You both get <b>₺{REFERRAL.reward}</b> in your wallets 🎉</li>
          </ol>
          <p className="mt-2 text-[11px] text-slate-500">Fair use: max {REFERRAL.perMonthCap} paid invites a month ({thisMonth}/{REFERRAL.perMonthCap}). Same phone, device or ID never counts twice, and rewards for fake accounts are taken back.</p>
        </div>
        {!s.invitedBy && Date.now() - s.createdAt < 14 * 86_400_000 && (
          <div className="card">
            <p className="text-sm font-semibold">Got a friend's code?</p>
            <div className="mt-2 flex gap-2"><input className="input py-2.5 font-mono uppercase" placeholder="LUDA-XXXX00" value={enter} onChange={(e) => setEnter(e.target.value.toUpperCase())} />
              <button className="btn-primary shrink-0 px-4 py-2.5 text-sm" disabled={!/^LUDA-[A-Z0-9]{3,10}$/.test(enter) || enter === code} onClick={() => { set((p) => ({ ...p, invitedBy: enter })); reward(20, { title: `Code applied: ₺${REFERRAL.reward} after your KYC + first top-up` }) }}>Apply</button></div>
          </div>
        )}
        {s.invitedBy && <p className="rounded-2xl bg-fg/[0.03] p-3 text-xs text-slate-400">Invited by <b>{s.invitedBy}</b> · your ₺{REFERRAL.reward} arrives after KYC + first top-up {s.kyc.status === 'verified' && s.deposits > 0 ? '✅' : '⏳'}</p>}
        <section>
          <p className="label mb-2">Your invites</p>
          {s.referrals.length ? s.referrals.map((r) => {
            const idx = REF_STAGES.findIndex((x) => x.key === r.stage)
            return (
              <div key={r.id} className="card mb-2">
                <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-ink-700 text-xl">{r.flag}</span><p className="flex-1 font-semibold">{r.name}</p>
                  <span className={`chip ${r.stage === 'paid' ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/5 text-slate-300'}`}>{REF_STAGES[idx].label}</span></div>
                <div className="mt-2 flex gap-1">{REF_STAGES.slice(1).map((st, i) => <span key={st.key} className={`h-1.5 flex-1 rounded-full ${i < idx ? 'bg-mint-400' : 'bg-fg/10'}`} />)}</div>
              </div>
            )
          }) : <p className="card text-center text-sm text-slate-400">No invites yet. Share your code to start earning.</p>}
        </section>
        <Link to="/ambassadors" className="card flex items-center gap-3"><Trophy className="text-gold-300" /><span className="flex-1 text-sm font-semibold">Bring your whole campus: become an ambassador</span><ChevronRight size={16} className="text-slate-500 rtl:rotate-180" /></Link>
      </div>
      <DemoNote />
    </div>
  )
}

/** Demo: invited friends move through the funnel; paid out at the end. */
export function useReferralProgress() {
  const { s, set, notify, reward } = useStore()
  // You were invited: get your bonus once you've done KYC + first top-up.
  useEffect(() => {
    if (!s.invitedBy || s.invitePaid || s.kyc.status !== 'verified' || s.deposits < 1) return
    set((p) => ({ ...p, invitePaid: true, balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) + REFERRAL.reward }, txs: [{ id: uid(), type: 'reward', amount: REFERRAL.reward, currency: 'TRY', label: `Welcome bonus (invited by ${p.invitedBy})`, ts: Date.now() }, ...p.txs] }))
    notify('🎁', `₺${REFERRAL.reward} welcome bonus added. Thanks for joining with a friend's code!`, '/wallet')
  }, [s.invitedBy, s.invitePaid, s.kyc.status, s.deposits, set, notify])
  useEffect(() => {
    if (!s.referrals.some((r) => r.stage !== 'paid')) return
    const t = setInterval(() => {
      const now = Date.now()
      for (const r of s.referrals) {
        if (r.stage === 'paid' || now - r.ts < 5000) continue
        const next = REF_STAGES[REF_STAGES.findIndex((x) => x.key === r.stage) + 1].key
        set((p) => ({ ...p, referrals: p.referrals.map((x) => (x.id === r.id ? { ...x, stage: next, ts: now } : x)), balances: next === 'paid' ? { ...p.balances, TRY: (p.balances.TRY ?? 0) + REFERRAL.reward } : p.balances,
          txs: next === 'paid' ? [{ id: uid(), type: 'reward', amount: REFERRAL.reward, currency: 'TRY', label: `Referral bonus · ${r.name}`, ts: now }, ...p.txs] : p.txs }))
        if (next === 'joined') notify('👋', `${r.name} joined Luda with your code`, '/invite')
        if (next === 'paid') { notify('🎁', `₺${REFERRAL.reward} referral bonus: ${r.name} is verified!`, '/invite'); reward(30, { badge: 'recruiter', title: `+₺${REFERRAL.reward}: ${r.name} verified` }) }
        break
      }
    }, 1500)
    return () => clearInterval(t)
  }, [s.referrals, set, notify, reward])
}

/* ------------------------------ Ambassadors ------------------------------ */

export function Ambassadors() {
  const { s, set, gate, reward } = useStore()
  const [uni, setUni] = useState(s.ambassador.uni || s.university || 'neu')
  const mine = paidCount(s)
  const u = UNIVERSITIES.find((x) => x.id === uni) ?? UNIVERSITIES[0]
  const board = useMemo(() => {
    const h = uni.length * 13
    const names: [string, string][] = [['Chiamaka', '🇳🇬'], ['Tafara', '🇿🇼'], ['Esi', '🇬🇭'], ['Junior', '🇨🇲'], ['Achieng', '🇰🇪'], ['Musa', '🇳🇬']]
    const rows = names.map(([n, f], i) => ({ name: n, flag: f, n: 42 - i * 6 - (h % 5), me: false }))
    if (s.ambassador.status === 'active' && s.ambassador.uni === uni) rows.push({ name: `${s.name} (you)`, flag: '⭐', n: mine, me: true })
    return rows.sort((a, b) => b.n - a.n)
  }, [uni, s.ambassador, s.name, mine])
  const tier = [...AMBASSADOR_TIERS].reverse().find((t) => mine >= t.min)
  const next = AMBASSADOR_TIERS.find((t) => mine < t.min)
  return (
    <div>
      <Header back title="Campus ambassadors" sub="Grow Luda at your university, earn rewards" />
      <div className="flex flex-col gap-3 px-5">
        <select className="input" value={uni} onChange={(e) => setUni(e.target.value)} aria-label="University">{UNIVERSITIES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {s.ambassador.status === 'active' && s.ambassador.uni === uni ? (
          <div className="card flex items-center gap-4 bg-gradient-to-br from-indigo-500/20 to-transparent">
            <Ring value={next ? mine / next.min : 1} size={72} stroke={6}><span className="text-2xl">{tier?.emoji ?? '🎓'}</span></Ring>
            <div className="flex-1"><p className="font-bold">{tier ? `${tier.name} ambassador` : 'Ambassador'} · {u.short}</p><p className="text-sm text-slate-400">{mine} verified friends{next ? ` · ${next.min - mine} more for ${next.name}` : ' · top tier!'}</p>
              <Link to="/invite" className="mt-2 inline-flex text-sm text-mint-300">Invite friends ›</Link></div>
          </div>
        ) : (
          <div className="card">
            <p className="font-bold">🎓 Become the Luda ambassador for {u.short}</p>
            <p className="mt-1 text-sm text-slate-400">Help new students settle in, bring friends, and earn cash, merch and CV-boosting experience.</p>
            <button className="btn-primary mt-3 w-full py-3" onClick={() => { if (!gate(2, 'Become an ambassador')) return; set((p) => ({ ...p, ambassador: { status: 'active', uni } })); reward(50, { badge: 'ambassador', title: `You're the ${u.short} ambassador!` }) }}>Join the programme</button>
          </div>
        )}
        <section className="card">
          <p className="label mb-2">Rewards</p>
          {AMBASSADOR_TIERS.map((t) => (
            <div key={t.name} className={`flex items-center gap-3 py-2 ${mine >= t.min ? '' : 'opacity-60'}`}><span className="text-2xl">{t.emoji}</span>
              <div className="flex-1"><p className="text-sm font-semibold">{t.name} · {t.min} verified friends</p><p className="text-xs text-slate-400">{t.perk}</p></div>{mine >= t.min && <Check className="text-mint-300" size={18} />}</div>
          ))}
        </section>
        <section className="card">
          <p className="mb-2 flex items-center gap-2 font-bold"><Users size={16} /> {u.short} leaderboard</p>
          {board.map((r, i) => (
            <div key={r.name} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${r.me ? 'bg-mint-400/10' : ''}`}>
              <span className={`w-6 text-center font-bold ${i < 3 ? 'text-gold-300' : 'text-slate-500'}`}>{i + 1}</span><span className="text-lg">{r.flag}</span><span className="flex-1 text-sm font-semibold">{r.name}</span><span className="text-sm text-slate-400">{r.n}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

/* ------------------------------ Luda Deals ------------------------------ */

export function Deals() {
  const { s } = useStore()
  const [cat, setCat] = useState<'All' | Deal['cat']>('All')
  const [open, setOpen] = useState<Deal | null>(null)
  const city = CITIES.find((c) => c.id === s.city)!
  const deals = dealsFor(s.city, AREAS[s.city] ?? AREAS.lefkosa).filter((d) => cat === 'All' || d.cat === cat)
  const saved = s.dealsUsed.reduce((a, d) => a + d.saved, 0)
  return (
    <div>
      <Header back title="Luda Deals" sub={`📍 ${city.name} · save when you pay with Luda`} />
      <div className="flex flex-col gap-3 px-5">
        <Link to="/promos" className="card flex items-center gap-3"><span className="text-xl">🔥</span><span className="flex-1 text-sm font-semibold">Promo Spotter: student-snapped shop promos</span><span className="text-xs text-mint-300">›</span></Link>
        <div className="card flex items-center gap-3 bg-gradient-to-br from-orange-500/20 to-transparent"><Gift className="text-orange-300" /><p className="flex-1 text-sm">You've saved <b>{fmt(saved, 'TRY')}</b> with {s.dealsUsed.length} deal{s.dealsUsed.length === 1 ? '' : 's'}</p></div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5">{(['All', 'Food', 'Beauty', 'Groceries', 'Transport', 'Phone', 'Fun'] as const).map((c) => <button key={c} onClick={() => setCat(c)} className={`chip shrink-0 px-4 py-2 text-sm ${cat === c ? 'bg-gradient-to-r from-orange-400 to-red-500 text-white' : 'glass text-slate-300'}`}>{c}</button>)}</div>
        <div className="grid grid-cols-1 gap-3 tab:grid-cols-2">
          {deals.map((d, i) => (
            <motion.button key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={() => setOpen(d)} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${d.tone} p-4 text-start text-white`}>
              <span className="absolute -right-2 -bottom-4 text-7xl opacity-30">{d.emoji}</span>
              <p className="text-xs text-white/80">{d.merchant}</p><p className="text-xl font-extrabold leading-tight">{d.offer}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-white/80"><MapPin size={11} /> {d.area} · up to ₺{d.max} off</p>
            </motion.button>
          ))}
        </div>
        <p className="text-center text-[11px] text-slate-500">Sample deals. Merchants join Luda to reach the community.</p>
      </div>
      {open && <DealSheet d={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function DealSheet({ d, onClose }: { d: Deal; onClose: () => void }) {
  const { s, set, gate, checkPin, addTx, reward } = useStore()
  const [amount, setAmount] = useState('')
  const [stage, setStage] = useState<'form' | 'pin' | 'done'>('form')
  const [err, setErr] = useState('')
  const amt = +amount || 0
  const off = Math.min(Math.round(amt * d.pct / 100), d.max)
  const pay = async (pin: string) => {
    if (!(await checkPin(pin))) return setErr('Wrong PIN')
    set((p) => ({ ...p, balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) - (amt - off) }, dealsUsed: [{ id: uid(), merchant: d.merchant, saved: off, ts: Date.now() }, ...p.dealsUsed] }))
    addTx({ type: 'bill', amount: -(amt - off), currency: 'TRY', label: `${d.merchant} (deal)`, meta: `saved ₺${off}` })
    reward(15, { badge: 'deal_hunter', title: `You saved ₺${off} at ${d.merchant}` }); setStage('done')
  }
  return (
    <Sheet open onClose={onClose} title={d.merchant}>
      {stage === 'done' ? <Success title={`Saved ₺${off} 🎉`} sub={`Paid ${fmt(amt - off, 'TRY')} at ${d.merchant}. Show this screen to the cashier.`} onClose={onClose} /> : stage === 'pin' ? (
        <div className="flex flex-col items-center gap-3"><p className="text-sm text-slate-300">Pay {fmt(amt - off, 'TRY')} to {d.merchant}</p><PinPad error={err} onDone={pay} /></div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={`rounded-3xl bg-gradient-to-br ${d.tone} p-5 text-white`}><p className="text-3xl">{d.emoji}</p><p className="mt-1 text-2xl font-extrabold">{d.offer}</p><p className="text-sm text-white/80">Pay with Luda at the counter · max ₺{d.max} off</p></div>
          <input className="input py-4 text-2xl font-bold" inputMode="decimal" placeholder="Bill amount (₺)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          {amt > 0 && <div className="rounded-2xl bg-fg/[0.03] p-3 text-sm"><div className="flex justify-between text-mint-300"><span>Luda deal</span><span>−{fmt(off, 'TRY')}</span></div><div className="flex justify-between font-bold"><span>You pay</span><span>{fmt(amt - off, 'TRY')}</span></div></div>}
          <button className="btn-primary py-4" disabled={!amt || amt - off > (s.balances.TRY ?? 0)} onClick={() => gate(2, 'Pay with Luda Deals') && setStage('pin')}>Pay with Luda</button>
        </div>
      )}
    </Sheet>
  )
}

/* ------------------------------ Welcome pack ------------------------------ */

export function Welcome() {
  const { s, set, reward } = useStore()
  const done = s.welcomeDone
  const pct = done.length / WELCOME_STEPS.length
  const toggle = (id: string) => {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id]
    set((p) => ({ ...p, welcomeDone: next }))
    if (next.length === WELCOME_STEPS.length && !s.badges.includes('newcomer_pro')) reward(150, { badge: 'newcomer_pro', title: 'Welcome pack complete. You’re settled in! 🧳' })
  }
  return (
    <div>
      <Header back title="Welcome to North Cyprus" sub="Your first-weeks checklist" />
      <div className="flex flex-col gap-3 px-5">
        <div className="card flex items-center gap-4 bg-gradient-to-br from-teal-400/15 to-transparent">
          <Ring value={pct} size={72} stroke={6}><span className="text-lg font-extrabold">{Math.round(pct * 100)}%</span></Ring>
          <div><p className="font-bold">Settle in like a pro</p><p className="text-sm text-slate-400">Finish all steps for +150 XP and the 🧳 badge</p></div>
        </div>
        {WELCOME_STEPS.map((w) => {
          const on = done.includes(w.id)
          return (
            <div key={w.id} className={`card flex items-start gap-3 ${on ? 'opacity-70' : ''}`}>
              <button onClick={() => toggle(w.id)} aria-label={`Mark ${w.title} done`} className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${on ? 'bg-mint-400 text-ink-950' : 'border border-fg/20'}`}>{on && <Check size={15} />}</button>
              <div className="flex-1"><p className={`font-semibold ${on ? 'line-through' : ''}`}>{w.emoji} {w.title}</p><p className="text-xs text-slate-400">{w.body}</p></div>
              <Link to={w.to} className="chip shrink-0 bg-fg/5 py-1.5 text-slate-300">Go</Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
