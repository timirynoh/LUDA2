import { motion } from 'framer-motion'
import { Check, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmSheet } from '../components/Confirm'
import { Header, Ring } from '../components/ui'
import { BADGES, COUNTRIES, LEVELS, QUESTS } from '../lib/data'
import { api, LIVE } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'

const REDEEM = [
  { pts: 500, label: '₺5 wallet credit', tl: 5 },
  { pts: 1500, label: '₺20 off your next bill', tl: 20 },
  { pts: 3000, label: 'Zero-fee P2P swap', tl: 40 },
]

export default function Rewards() {
  const { s, set, t, level, addTx, toast } = useStore()
  const { rewards, refresh, refreshRewards } = useLive()
  const [pick, setPick] = useState<{ id: string; pts: number; cash: number; label: string } | null>(null)
  const liveRedeem = async (o: { id: string; label: string }) => {
    setPick(null)
    try { await api('POST', 'rewards-redeem', { id: o.id }); toast({ title: `${o.label} added to your Lira wallet`, emoji: '🎁' }); void refresh(); void refreshRewards() }
    catch (e) { toast({ title: e instanceof Error ? e.message : 'Try again', emoji: '⚠️' }) }
  }
  const me = COUNTRIES.find((c) => c.code === s.country)!
  const board = [
    { flag: '🇳🇬', name: 'Nigeria', xp: 182_400 }, { flag: '🇨🇩', name: 'DR Congo', xp: 96_300 }, { flag: '🇨🇲', name: 'Cameroon', xp: 88_100 },
    { flag: '🇿🇼', name: 'Zimbabwe', xp: 71_900 }, { flag: '🇬🇭', name: 'Ghana', xp: 54_200 }, { flag: '🇰🇪', name: 'Kenya', xp: 31_700 },
  ].map((r) => (r.name === me.name ? { ...r, xp: r.xp + s.xp, me: true } : r)).sort((a, b) => b.xp - a.xp)

  const redeem = (r: (typeof REDEEM)[number]) => {
    set((p) => ({ ...p, points: p.points - r.pts, balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) + r.tl } }))
    addTx({ type: 'reward', amount: r.tl, currency: 'TRY', label: `Redeemed · ${r.label}` })
    toast({ title: `Redeemed ${r.label}`, emoji: '🎁' })
  }

  return (
    <div>
      <Header back title={t('rewards.title')} />
      <div className="flex flex-col gap-5 px-5">
        <div className="card flex items-center gap-4 bg-gradient-to-br from-violet-500/20 to-transparent">
          <Ring value={level.progress} size={84} stroke={7}><span className="text-3xl">{level.emoji}</span></Ring>
          <div className="flex-1">
            <p className="text-xs text-slate-400">{t('home.level')} {level.idx}</p>
            <p className="text-2xl font-extrabold">{level.name}</p>
            <p className="text-sm text-slate-400">{s.xp} XP · {Math.max(0, level.next - s.xp)} to next</p>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {LEVELS.map((l, i) => (
            <div key={l.name} className={`flex min-w-[4.5rem] flex-1 flex-col items-center rounded-2xl p-2 text-center ${i < level.idx ? 'bg-mint-400/10' : 'bg-fg/[0.03] opacity-50'}`}>
              <span className="text-xl">{l.emoji}</span><span className="text-[10px] font-semibold">{l.name}</span>
            </div>
          ))}
        </div>

        <InviteCard />
        <div className="grid grid-cols-2 gap-2">
          <Link to="/invite" className="card flex items-center gap-2 py-3 text-sm font-semibold">🎁 Invite & earn ₺50</Link>
          <Link to="/challenges" className="card flex items-center gap-2 py-3 text-sm font-semibold">🏆 Monthly challenges</Link>
        </div>

        <section className="card">
          <div className="mb-3 flex items-center justify-between"><p className="font-bold">🪙 {t('rewards.points')}</p><p className="text-xl font-extrabold text-gold-300">{s.points}</p></div>
          <div className="flex flex-col gap-2">
            {LIVE ? (rewards?.redeem ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-fg/[0.03] p-3">
                <div className="flex-1"><p className="text-sm font-semibold">{r.label}</p><p className="text-xs text-slate-500">{r.pts} pts</p></div>
                <button className="btn-gold px-3 py-2 text-xs" disabled={s.points < r.pts} onClick={() => rewards?.verified ? setPick(r) : toast({ title: 'Verify your ID to turn points into money', emoji: '🪪' })}>Redeem</button>
              </div>
            )) : REDEEM.map((r) => (
              <div key={r.pts} className="flex items-center gap-3 rounded-2xl bg-fg/[0.03] p-3">
                <div className="flex-1"><p className="text-sm font-semibold">{r.label}</p><p className="text-xs text-slate-500">{r.pts} pts</p></div>
                <button className="btn-gold px-3 py-2 text-xs" disabled={s.points < r.pts} onClick={() => redeem(r)}>Redeem</button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">{LIVE ? 'Earn points from the daily spin, monthly challenges and invites. Verified accounts can turn them into Lira.' : 'Earn points with every bill you pay in Luda.'}</p>
        </section>

        <section>
          <p className="label mb-3">{t('rewards.badges')} · {s.badges.length}/{Object.keys(BADGES).length}</p>
          <div className="grid grid-cols-3 gap-3 tab:grid-cols-5">
            {Object.entries(BADGES).map(([id, b], i) => {
              const on = s.badges.includes(id)
              return (
                <motion.div key={id} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className={`card flex flex-col items-center gap-1 p-3 text-center ${on ? 'border-gold-400/40 bg-gold-400/5' : ''}`}>
                  <div className={`grid size-14 place-items-center rounded-full text-3xl ${on ? 'bg-gradient-to-br from-gold-300/30 to-amber-600/20 shadow-lg shadow-amber-500/20' : 'bg-fg/5 grayscale'}`}>
                    {on ? b.emoji : <Lock size={18} className="text-slate-600" />}
                  </div>
                  <p className="text-xs font-semibold">{b.name}</p>
                  <p className="text-[10px] leading-tight text-slate-500">{b.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </section>

        <section>
          <p className="label mb-3">Quests</p>
          <div className="flex flex-col gap-2">
            {QUESTS.filter((q) => !LIVE || (rewards?.questXp && q.id in rewards.questXp)).map((q) => {
              const on = s.quests.includes(q.id)
              return (
                <Link key={q.id} to={q.to} className={`card flex items-center gap-3 py-3 ${on ? 'opacity-60' : ''}`}>
                  <span className={`grid size-7 place-items-center rounded-lg ${on ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-gold-300'}`}>{on ? <Check size={14} /> : '★'}</span>
                  <span className={`flex-1 text-sm font-semibold ${on ? 'line-through' : ''}`}>{q.title}</span>
                  <span className="chip bg-gold-400/10 text-gold-300">+{q.xp}</span>
                </Link>
              )
            })}
          </div>
        </section>

        {LIVE ? (
          <Link to="/challenges" className="card flex items-center gap-3"><span className="text-2xl">🏆</span><span className="flex-1 text-sm font-semibold">Country savings cup: see who saves the most this month</span><span className="text-xs text-mint-300">›</span></Link>
        ) : <section className="card">
          <p className="mb-3 font-bold">🏆 {t('rewards.board')}</p>
          {board.map((r, i) => (
            <div key={r.name} className={`flex items-center gap-3 rounded-xl px-2 py-2.5 ${'me' in r ? 'bg-mint-400/10' : ''}`}>
              <span className={`w-6 text-center font-bold ${i < 3 ? 'text-gold-300' : 'text-slate-500'}`}>{i + 1}</span>
              <span className="text-xl">{r.flag}</span>
              <span className="flex-1 text-sm font-semibold">{r.name}{'me' in r && <span className="ms-1 text-xs text-mint-300">(your community)</span>}</span>
              <span className="text-sm text-slate-400">{r.xp.toLocaleString()} XP</span>
            </div>
          ))}
        </section>}
      </div>
      {pick && <ConfirmSheet title="Turn points into money" summary={[['You spend', `${pick.pts} points`], ['You get', pick.label]]} checks={['I understand the points are used up']} confirmLabel="Redeem" onConfirm={() => void liveRedeem(pick)} onClose={() => setPick(null)} />}
    </div>
  )
}

function InviteCard() {
  const { s, set, toast } = useStore()
  const { rewards } = useLive()
  if (LIVE) {
    const code = rewards?.referral.code ?? `LUDA-${(s.account?.username ?? '').toUpperCase()}`
    const link = `${location.origin}/?ref=${code}`
    const msg = `Join me on Luda, the app for Africans in North Cyprus. Sign up with my code ${code} and we both get ₺50 after you verify and top up: ${link}`
    return (
      <section className="card bg-gradient-to-br from-gold-400/15 to-transparent">
        <p className="font-bold">🎁 Invite friends</p>
        <p className="mt-1 text-sm text-slate-400">You both get <b>₺50</b> in your wallets when your friend verifies their ID and tops up. Only real, verified people count.</p>
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-dashed border-gold-400/40 bg-gold-400/5 p-3"><span className="selectable flex-1 font-mono text-lg font-bold tracking-widest" translate="no">{code}</span><button className="chip bg-fg/10 py-2" onClick={async () => { try { await navigator.clipboard.writeText(msg); toast({ title: 'Invite copied', emoji: '📋' }) } catch { toast({ title: code, emoji: '🎁' }) } }}>Copy</button></div>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="btn-primary mt-3 w-full py-3 text-sm">Share on WhatsApp</a>
      </section>
    )
  }
  const base = (s.account?.username ?? s.name ?? 'friend').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'FRIEND'
  const num = String((base.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 90) + 10)
  const code = s.referral || `LUDA-${base}${num}`
  const msg = `Join me on Luda, the app for Africans in North Cyprus: wallet, SafeSwap, houses, jobs & more. Use my code ${code} for 100 bonus XP 🎁`
  const copy = async () => {
    if (!s.referral) set((p) => ({ ...p, referral: code }))
    try { await navigator.clipboard.writeText(msg); toast({ title: 'Invite copied', emoji: '📋' }) } catch { toast({ title: `Your code: ${code}`, emoji: '🎁' }) }
  }
  return (
    <section className="card bg-gradient-to-br from-gold-400/15 to-transparent">
      <p className="font-bold">🎁 Invite friends</p>
      <p className="mt-1 text-sm text-slate-400">You both get <b>100 XP</b> when they verify their account. Invites only count for real, verified people.</p>
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-dashed border-gold-400/40 bg-gold-400/5 p-3"><span className="flex-1 font-mono text-lg font-bold tracking-widest">{code}</span><button className="chip bg-fg/10 py-2" onClick={copy}>Copy</button></div>
      <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" onClick={() => { if (!s.referral) set((p) => ({ ...p, referral: code })) }} className="btn-primary mt-3 w-full py-3 text-sm">Share on WhatsApp</a>
    </section>
  )
}
