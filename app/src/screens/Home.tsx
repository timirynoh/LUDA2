import { motion } from 'framer-motion'
import { HomeBanners } from '../components/Banners'
import { OpportunityNudge } from '../components/OpportunityNudge'
import { TodoCard } from '../components/LiveTodo'
import { useUniDates } from '../components/LiveUni'
import { BoardStrip } from '../components/LiveBoardKit'
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Flame, GraduationCap, Handshake, Minus, Moon, Pencil, Plus, Sun } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ring, Sheet } from '../components/ui'
import { FlashBubbles, FlashPop } from '../components/FlashBubbles'
import { SaverCard, SaverSheet } from '../components/RideSaver'
import { UnlockCard } from '../components/Verify'
import { Avatar } from '../components/Avatar'
import { CheckinCard, NewsPreview } from './Engage'
import { PromoStrip } from './Promos'
import { WELCOME_STEPS } from '../lib/growth'
import { ACTION_TIER, tierOf } from '../lib/access'
import { Bell, Lock, Search as SearchIcon } from 'lucide-react'
import { ACTIONS, MAX_SHORTCUTS } from '../lib/actions'
import { calendarFor, daysUntil, nextClass, UNIVERSITIES } from '../lib/uni'
import { CITIES, COUNTRIES, CURRENCIES, QUESTS } from '../lib/data'
import { convert, fmt, useRates } from '../lib/fx'
import { LIVE } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'

export default function Home() {
  const { s, set, t, level } = useStore()
  const [editing, setEditing] = useState(false)
  const [saverOpen, setSaverOpen] = useState(false)
  const nc = useMemo(() => nextClass(s.classes), [s.classes])
  const uni = UNIVERSITIES.find((u) => u.id === s.university)
  const { dates: liveDates } = useUniDates(LIVE ? s.university || undefined : undefined)
  // Live: only dates the Luda team entered from the official calendar (never sample dates).
  const deadline = useMemo(() => (s.university ? (LIVE ? (liveDates ?? []).map((i) => ({ ...i, end: i.end ?? undefined })) : calendarFor(s.university)).find((i) => i.kind !== 'term' && i.kind !== 'holiday' && daysUntil(i.end ?? i.start) >= 0) : undefined), [s.university, liveDates])
  const isLight = s.theme === 'light' || (s.theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: light)').matches)
  const { rates, live } = useRates()
  const [hide, setHide] = useState(s.security.hideBalances)
  const home = COUNTRIES.find((c) => c.code === s.country)!
  const city = CITIES.find((c) => c.id === s.city)!
  const { me, rewards } = useLive()
  const bellCount = s.inbox.filter((n) => !n.read).length + (LIVE ? me?.profile.inboxUnread ?? 0 : 0)
  // Live: only quests the server really tracks (it marks them done from what you did).
  const quests = LIVE ? QUESTS.filter((q) => rewards?.questXp && q.id in rewards.questXp) : QUESTS
  // Live mode shows the real wallet (server); the demo shows its local balances.
  const balances: Record<string, number> = LIVE ? { NGN: (me?.balances.NGN ?? 0) / 100, TRY: (me?.balances.TRY ?? 0) / 100 } : s.balances
  const total = Object.entries(balances).reduce((a, [c, v]) => a + convert(rates, v, c, 'TRY'), 0)
  const activeTrade = LIVE ? undefined : s.trades.find((x) => x.status === 'escrow' || x.status === 'meeting') // demo swaps only; live P2P orders show in To do

  const actions = s.shortcuts.map((id) => ACTIONS.find((a) => a.id === id)).filter((a) => a && (!a.admin || s.isAdmin)) as typeof ACTIONS

  return (
    <div className="pt-safe flex flex-col gap-5 px-5">
      {/* top bar */}
      <div className="flex items-center gap-2 min-[380px]:gap-3">
        <Link to="/profile" className="shrink-0">
          <Ring value={level.progress} size={48} stroke={4}>
            <Avatar size={38} />
          </Ring>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-slate-400 min-[380px]:text-sm">{t('home.hello')} {home.flag} · {city.name}</p>
          <p className="truncate text-base font-bold min-[380px]:text-lg">{s.name} <span className="text-xs font-medium text-orange-300 min-[380px]:text-sm"><Flame size={12} className="inline" />{s.streak}</span> <span className="text-xs font-medium text-slate-400 max-[379px]:hidden min-[380px]:text-sm">· {level.emoji} {level.name}</span></p>
        </div>
        <Link to="/search" data-tour="search" className="glass grid size-9 shrink-0 place-items-center rounded-2xl min-[380px]:size-10" aria-label="Search"><SearchIcon size={18} /></Link>
        <Link to="/inbox" data-tour="inbox" className="glass relative grid size-9 shrink-0 place-items-center rounded-2xl min-[380px]:size-10" aria-label="Notifications"><Bell size={18} />
          {bellCount > 0 && <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{bellCount > 99 ? '99+' : bellCount}</span>}</Link>
        <button onClick={() => set((p) => ({ ...p, theme: isLight ? 'dark' : 'light' }))} className="glass grid size-10 shrink-0 place-items-center rounded-2xl max-[379px]:hidden" aria-label="Toggle day / night">
          {isLight ? <Moon size={18} className="text-indigo-500" /> : <Sun size={18} className="text-gold-300" />}
        </button>

      </div>

      {s.sections.flash && <FlashBubbles />}

      {/* balance card */}
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} data-tour="balance"
        className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500 via-emerald-700 to-emerald-950 p-6 text-white shadow-2xl shadow-emerald-900/40">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-gold-300/25 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 size-48 rounded-full bg-mint-300/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-emerald-100/80">{t('home.balance')}</p>
            <button onClick={() => setHide(!hide)} className="text-emerald-100/80" aria-label="Toggle balance">{hide ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{hide ? '₺ ••••••' : fmt(total, 'TRY')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(balances).map(([c, v]) => (
              <span key={c} className="chip bg-black/20 text-emerald-50 backdrop-blur">{CURRENCIES[c]?.flag} {hide ? '•••' : fmt(v, c, { compact: true })}</span>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between text-xs text-emerald-100/80">
            <span>{t('home.level')} {level.idx} · {s.xp} / {level.next} XP</span>
            <span className="font-semibold text-gold-200">🪙 {s.points} pts</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/25">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-amber-400" initial={{ width: 0 }} animate={{ width: `${level.progress * 100}%` }} transition={{ duration: 1 }} />
          </div>
        </div>
      </motion.div>

      <TodoCard />
      <HomeBanners />
      <OpportunityNudge />
      {s.sections.checkin && <CheckinCard />}
      <UnlockCard />
      {s.sections.welcome && Date.now() - s.createdAt < 30 * 86_400_000 && s.welcomeDone.length < WELCOME_STEPS.length && (
        <Link to="/welcome" className="card flex items-center gap-3">
          <span className="text-2xl">🧳</span>
          <div className="flex-1"><p className="text-sm font-semibold">New in North Cyprus? Your welcome pack</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-gradient-to-r from-teal-300 to-mint-400" style={{ width: `${(s.welcomeDone.length / WELCOME_STEPS.length) * 100}%` }} /></div></div>
          <span className="text-xs text-slate-400">{s.welcomeDone.length}/{WELCOME_STEPS.length}</span>
        </Link>
      )}

      {s.saver.status === 'none' && tierOf(s) >= 2 && <SaverCard dismissible onOpen={() => setSaverOpen(true)} />}
      {saverOpen && <SaverSheet onClose={() => setSaverOpen(false)} />}

      {activeTrade && (
        <Link to="/exchange?tab=p2p" className="card flex items-center gap-3 border-fuchsia-400/30 bg-fuchsia-500/10">
          <div className="grid size-11 place-items-center rounded-2xl bg-fuchsia-500/20"><Handshake className="text-fuchsia-300" /></div>
          <div className="flex-1">
            <p className="font-semibold">Trade with {activeTrade.trader}</p>
            <p className="text-xs text-slate-400">🔒 {fmt(activeTrade.give, activeTrade.giveCur)} in escrow · {activeTrade.spot}</p>
          </div>
          <ChevronRight className="text-slate-500 rtl:rotate-180" />
        </Link>
      )}

      {s.sections.nextClass && nc && (
        <Link to="/uni" className="card flex items-center gap-3 border-indigo-400/30 bg-indigo-500/10">
          <div className="grid size-11 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-300"><GraduationCap /></div>
          <div className="flex-1"><p className="text-xs text-slate-400">Next class · {nc.at.toLocaleDateString(undefined, { weekday: 'short' })} {nc.c.start}</p><p className="font-semibold">{nc.c.course}{nc.c.room ? ` · ${nc.c.room}` : ''}</p></div>
          {s.remind.on && <span className="chip bg-mint-400/15 text-mint-300">🔔 {s.remind.minutes}m</span>}
        </Link>
      )}
      {s.sections.deadline && deadline && uni && (
        <Link to="/uni" className="card flex items-center gap-3 py-3">
          <span className="text-xl">{deadline.kind === 'exam' ? '📝' : deadline.kind === 'fee' ? '💳' : '⏰'}</span>
          <div className="min-w-0 flex-1"><p className="text-xs text-slate-400">{uni.short} · next deadline</p><p className="truncate text-sm font-semibold">{deadline.title}</p></div>
          <span className={`text-sm font-extrabold ${daysUntil(deadline.start) <= 7 ? 'text-rose-300' : 'text-gold-300'}`}>{Math.max(0, daysUntil(deadline.start))}d</span>
        </Link>
      )}

      {/* quick actions: user-chosen */}
      <section data-tour="actions">
        <div className="mb-3 flex items-center justify-between">
          <p className="label">{t('home.quick')}</p>
          <button onClick={() => setEditing(true)} className="chip bg-fg/5 py-1.5 text-slate-300"><Pencil size={12} /> Edit</button>
        </div>
        <div className="grid grid-cols-4 gap-3 tab:grid-cols-8">
          {actions.map(({ id, to, icon: Icon, key, c }, i) => (
            <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Link to={to} className="flex flex-col items-center gap-2 text-center">
                <div className={`relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br ${c} text-white shadow-lg transition active:scale-90`}>
                  <Icon size={22} strokeWidth={2.2} />
                  {(ACTION_TIER[id] ?? 0) > tierOf(s) && <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-ink-900 text-slate-300 ring-2 ring-ink-950"><Lock size={10} /></span>}
                </div>
                <span className="text-[11px] leading-tight font-medium text-slate-300">{t(key)}</span>
              </Link>
            </motion.div>
          ))}
          {actions.length < MAX_SHORTCUTS && (
            <button onClick={() => setEditing(true)} className="flex flex-col items-center gap-2 text-center">
              <div className="grid size-14 place-items-center rounded-2xl border-2 border-dashed border-fg/15 text-slate-500"><Plus size={22} /></div>
              <span className="text-[11px] font-medium text-slate-500">Add</span>
            </button>
          )}
        </div>
      </section>

      {s.sections.promos && (LIVE ? <BoardStrip kind="promo" title="🔥 Deals near you" to="/promos" /> : <PromoStrip />)}
      {s.sections.news && (LIVE ? <BoardStrip kind="news" title="📰 News" to="/news" /> : <NewsPreview />)}

      {/* rates */}
      {s.sections.rates && <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <p className="label">{t('home.rates')}</p>
          <span className={`chip ${live ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/5 text-slate-400'}`}>
            <span className={`size-1.5 rounded-full ${live ? 'animate-pulse bg-mint-400' : 'bg-slate-500'}`} /> {live ? t('fx.live') : t('fx.indicative')}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[home.currency === 'USD' ? 'NGN' : home.currency, 'USD', 'EUR'].map((c) => (
            <div key={c} className="rounded-2xl bg-fg/[0.03] p-3">
              <p className="text-xs text-slate-400">{CURRENCIES[c]?.flag} 1 {c === 'NGN' || c === 'XAF' || c === 'CDF' ? '000 ' : ''}{c}</p>
              <p className="mt-1 font-bold">{fmt(convert(rates, ['NGN', 'XAF', 'CDF'].includes(c) ? 1000 : 1, c, 'TRY'), 'TRY')}</p>
            </div>
          ))}
        </div>
      </section>}

      {/* quests */}
      {s.sections.quests && <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="label">{t('home.quests')}</p>
          <span className="text-xs text-slate-400">{quests.filter((q) => s.quests.includes(q.id)).length}/{quests.length}</span>
        </div>
        <div className="flex flex-col gap-2">
          {quests.filter((q) => !s.quests.includes(q.id)).slice(0, 4).map((q) => (
            <Link key={q.id} to={q.to} className="card flex items-center gap-3 py-3.5">
              <div className="grid size-9 place-items-center rounded-xl bg-gold-400/15 text-gold-300">★</div>
              <span className="flex-1 text-sm font-semibold">{q.title}</span>
              <span className="chip bg-gold-400/10 text-gold-300">+{q.xp} XP</span>
            </Link>
          ))}
          {quests.every((q) => s.quests.includes(q.id)) && <div className="card text-center text-sm text-slate-300">🏆 All quests done. You're a legend.</div>}
        </div>
      </section>}
      {editing && <Customize open onClose={() => setEditing(false)} />}
      {s.sections.flash && <FlashPop />}
    </div>
  )
}

const SECTIONS: { key: keyof import('../lib/store').State['sections']; label: string }[] = [
  { key: 'promos', label: '🔥 Promos near you' }, { key: 'checkin', label: '🎡 Daily spin' }, { key: 'welcome', label: '🧳 Welcome pack' }, { key: 'news', label: '📰 News' },
  { key: 'flash', label: '⚡ Flash help bubbles' }, { key: 'nextClass', label: '🎓 Next class' }, { key: 'deadline', label: '⏳ Next uni deadline' },
  { key: 'rates', label: '💱 Live rates' }, { key: 'quests', label: '★ Daily quests' },
]

function Customize({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, set, t, reward } = useStore()
  const [list, setList] = useState(s.shortcuts)
  const [sections, setSections] = useState(s.sections)
  const available = ACTIONS.filter((a) => !list.includes(a.id) && (!a.admin || s.isAdmin))
  const move = (i: number, d: -1 | 1) => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; setList(l) }
  const save = () => {
    set((p) => ({ ...p, shortcuts: list, sections }))
    if (!s.badges.includes('stylist')) reward(20, { badge: 'stylist', title: 'Home screen customised' })
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Customise your home">
      <div className="flex flex-col gap-5">
        <section>
          <p className="label mb-2">Your shortcuts · {list.length}/{MAX_SHORTCUTS}</p>
          <div className="flex flex-col gap-1.5">
            {list.map((id, i) => {
              const a = ACTIONS.find((x) => x.id === id)!
              return (
                <div key={id} className="glass flex items-center gap-3 rounded-2xl p-2">
                  <div className={`grid size-9 place-items-center rounded-xl bg-gradient-to-br ${a.c} text-white`}><a.icon size={16} /></div>
                  <span className="flex-1 text-sm font-semibold">{t(a.key)}</span>
                  <button disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-slate-400 disabled:opacity-20" aria-label="Move up"><ChevronUp size={18} /></button>
                  <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-400 disabled:opacity-20" aria-label="Move down"><ChevronDown size={18} /></button>
                  <button onClick={() => setList(list.filter((x) => x !== id))} className="grid size-7 place-items-center rounded-full bg-rose-500/15 text-rose-300" aria-label="Remove"><Minus size={14} /></button>
                </div>
              )
            })}
            {!list.length && <p className="text-center text-xs text-slate-500">No shortcuts: a clean home screen ✨</p>}
          </div>
        </section>
        <section>
          <p className="label mb-2">Add</p>
          <div className="grid grid-cols-4 gap-3">
            {available.map((a) => (
              <button key={a.id} disabled={list.length >= MAX_SHORTCUTS} onClick={() => setList([...list, a.id])} className="flex flex-col items-center gap-1 text-center disabled:opacity-30">
                <div className={`relative grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${a.c} text-white`}><a.icon size={18} />
                  <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-mint-400 text-ink-950"><Plus size={12} /></span></div>
                <span className="text-[10px] leading-tight text-slate-400">{t(a.key)}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <p className="label mb-2">Home sections</p>
          <div className="grid grid-cols-2 gap-2">
            {SECTIONS.map((x) => (
              <button key={x.key} onClick={() => setSections({ ...sections, [x.key]: !sections[x.key] })}
                className={`rounded-2xl p-3 text-start text-sm font-semibold ${sections[x.key] ? 'bg-mint-400/15 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/5 text-slate-400'}`}>{x.label}</button>
            ))}
          </div>
        </section>
        <button className="btn-primary py-4" onClick={save}>Save my home</button>
      </div>
    </Sheet>
  )
}
