// P2P exchange (live): Naira inside Luda ⇄ Turkish lira sent outside Luda (bank transfer or cash), Bybit-style.
// The Naira side is always held in escrow by the server; the person paying Naira releases it once the lira arrives.
import { Ban, BadgeCheck, Bell, Building2, Check, ChevronRight, Clock3, Copy, Landmark, Lock, MapPin, MessageCircle, Plus, SendHorizontal, ShieldCheck, ThumbsDown, ThumbsUp, Trash2, Video, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BankBadge } from '../components/BankBadge'
import { GuideLink, InfoTip } from '../components/LiveGuides'
import { Presence, presenceOf } from '../components/Presence'
import { Empty, ago, useApi } from '../components/LiveKit'
import { ReviewAndPin, errMsg } from '../components/LiveMoney'
import { Attachments, type Upload } from '../components/LiveSupport'
import { Header, Sheet, Success } from '../components/ui'
import { CITIES } from '../lib/data'
import { api, money } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'

export type Asset = 'TRY' | 'USD' | 'EUR' | 'GBP'
export const ASSETS: { v: Asset; sym: string; label: string; flag: string }[] = [
  { v: 'TRY', sym: '₺', label: 'Lira', flag: '🇹🇷' }, { v: 'USD', sym: '$', label: 'Dollar', flag: '🇺🇸' }, { v: 'EUR', sym: '€', label: 'Euro', flag: '🇪🇺' }, { v: 'GBP', sym: '£', label: 'Pound', flag: '🇬🇧' },
]
const symOf = (a?: string) => ASSETS.find((x) => x.v === a)?.sym ?? '₺'
const nameOf = (a?: string) => (ASSETS.find((x) => x.v === a)?.label ?? 'Lira').toLowerCase()
export const fa = (minor: number, a?: string) => `${symOf(a)}${(minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const APPEAL_WAIT_MIN = 15 // the server enforces the same wait
export interface Ad {
  id: string; side: 'sell' | 'buy'; asset?: Asset; price: number; min_try: number; max_try: number; available_try: number; methods: ('bank' | 'cash')[]
  city: string; area: string; terms: string; status: string; maker?: string; makerName?: string; verified?: boolean; mine?: boolean
  stats?: { trades: number; rate: number | null; since: string; good?: number; bad?: number; releaseMin?: number | null; sendMin?: number | null }; nearby?: number; lastSeen?: string | null
}
interface Market { ads: Ad[]; mine: Ad[]; asset?: Asset; market: number | null; rules: { maxAds: number; maxTry: number; minTry: number; windowMin: number; priceBand: number; feePct: number; feeMinTry?: number; feeMaxTry?: number; assetPerTry?: number | null }; canTrade: boolean; why: string | null }
interface PayMethod { id: string; bank: string; iban: string; holder: string; currency?: Asset }
export interface Order {
  id: string; status: 'waiting' | 'sent' | 'done' | 'cancelled' | 'appeal'; role: 'payer' | 'sender' | 'staff'; iAmMaker: boolean; asset?: Asset
  appeal_stage?: 'negotiation' | 'review' | 'decided' | null; appeal_reason?: string | null; appeal_at?: string | null; assigned_to?: string | null; ask_who?: 'payer' | 'sender' | 'both' | null; ask_at?: string | null; ask_due?: string | null; ask_payer_at?: string | null; ask_sender_at?: string | null; iAppealed?: boolean; appealBy?: 'payer' | 'sender' | 'auto' | null
  price: number; amount_try: number; amount_ngn: number; fee_ngn: number; fee_try?: number | null; method: 'bank' | 'cash'; try_to: { kind?: string; bank?: string; iban?: string; holder?: string; area?: string }
  pay_by: string; sent_at: string | null; done_at: string | null; note: string | null; created_at: string
  payer: { username: string; name: string; verified: boolean; lastSeen?: string | null }; sender: { username: string; name: string; verified: boolean; lastSeen?: string | null }
  receiptUrls?: (string | null)[]; messages?: { id: number; kind?: 'user' | 'system' | 'staff'; by: string | null; mine: boolean; body: string; files: (string | null)[]; at: string; private?: boolean }[]; reviewed?: boolean
}

const naira = (minor: number) => money(minor, 'NGN')
const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? ''
const AREA_KEY = 'luda.p2pArea'
const fmtIban = (i: string) => i.replace(/(.{4})/g, '$1 ').trim()
export const TR_BANKS = ['Ziraat Bankası', 'İş Bankası', 'Garanti BBVA', 'Halkbank', 'VakıfBank', 'Akbank', 'Yapı Kredi', 'Creditwest Bank', 'Near East Bank', 'Türk Bankası', 'Kıbrıs Vakıflar Bankası', 'Koop Bank']

function Copyable({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0"><p className="text-[11px] text-slate-400">{label}</p><p className={`selectable break-all font-semibold ${mono ? 'font-mono text-[15px]' : ''}`}>{value}</p></div>
      <button onClick={() => { void navigator.clipboard?.writeText(value.replace(/\s/g, label === 'IBAN' ? '' : ' ')).then(() => { setOk(true); setTimeout(() => setOk(false), 1400) }) }}
        className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${ok ? 'bg-mint-400/25 text-mint-100' : 'bg-fg/[0.07]'}`}><span className="inline-flex items-center gap-1">{ok ? <Check size={14} /> : <Copy size={14} />} {ok ? 'Copied' : 'Copy'}</span></button>
    </div>
  )
}
// side 'sell' = this trader sends the lira (show how fast they send); 'buy' = they pay Naira and release (show how fast they release).
const Trader = ({ name, user, verified, stats, side, seen }: { name?: string; user?: string; verified?: boolean; stats?: Ad['stats']; side?: 'sell' | 'buy'; seen?: string | null }) => (
  <div className="flex min-w-0 items-center gap-2.5">
    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-400/40 to-indigo-700/50 font-bold">{(name || user || '?').slice(0, 1).toUpperCase()}</span>
    <div className="min-w-0"><Link to={`/u/${user}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 truncate text-sm font-bold">{name?.split(' ')[0]} <span className="font-normal text-slate-400">@{user}</span>{verified && <BadgeCheck size={14} className="shrink-0 text-mint-300" />}</Link>
      {seen !== undefined && <Presence at={seen} />}
      {stats && <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">{stats.trades === 1 ? '1 trade' : `${stats.trades} trades`}{stats.rate !== null ? <span className={`rounded-md px-1.5 font-bold ${stats.rate >= 90 ? 'bg-mint-400/15 text-mint-300' : stats.rate >= 70 ? 'bg-gold-400/15 text-gold-300' : 'bg-rose-500/15 text-rose-300'}`}>{`${stats.rate}% completed`}</span> : <span>new trader</span>}{(stats.good || stats.bad) ? <span>{`👍 ${stats.good ?? 0} 👎 ${stats.bad ?? 0}`}</span> : null}</p>}
      {stats && side === 'sell' && stats.sendMin != null && <p className="text-[11px] text-slate-400">⏱ Usually sends in ~{Math.max(1, stats.sendMin)} min</p>}
      {stats && side === 'buy' && stats.releaseMin != null && <p className="text-[11px] text-slate-400">⏱ Usually releases in ~{Math.max(1, stats.releaseMin)} min</p>}</div>
  </div>
)

/* ------------------------------- market (in Exchange) ------------------------------- */
export function P2PMarket() {
  const { s } = useStore()
  const nav = useNavigate()
  const [want, setWant] = useState<'buy' | 'sell'>('buy')
  const [asset, setAsset] = useState<Asset>('TRY')
  const [nearOnly, setNearOnly] = useState(false)
  const [onlineOnly, setOnlineOnly] = useState(false)
  const sym = symOf(asset)
  const [area, setArea] = useState(() => { try { return localStorage.getItem(AREA_KEY) ?? '' } catch { return '' } })
  const [amt, setAmt] = useState('')
  const { data, err, reload } = useApi<Market>(`p2p?want=${want}&asset=${asset}&city=${s.city}&area=${encodeURIComponent(area)}${nearOnly ? '&near=1' : ''}`)
  const orders = useApi<{ orders: Order[] }>('p2p-orders')
  const active = (orders.data?.orders ?? []).filter((o) => o.status === 'waiting' || o.status === 'sent' || o.status === 'appeal')
  const [take, setTake] = useState<Ad | null>(null)
  const [sheet, setSheet] = useState<'ads' | 'banks' | 'orders' | 'area' | null>(null)
  const want_ = Math.round(Number(amt.replace(/[^\d.]/g, '') || 0) * 100)
  const ads = useMemo(() => (data?.ads ?? []).filter((a) => !a.mine && (!onlineOnly || presenceOf(a.lastSeen).online) && (!want_ || (want_ >= a.min_try && want_ <= Math.min(a.max_try, a.available_try)))), [data, want_, onlineOnly])
  const buying = want === 'buy'
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-fg/[0.05] p-1">
        {(['buy', 'sell'] as const).map((w) => <button key={w} onClick={() => setWant(w)} className={`rounded-xl py-3 text-sm font-bold transition ${want === w ? (w === 'buy' ? 'bg-mint-400 text-ink-950' : 'bg-rose-400 text-ink-950') : 'text-slate-400'}`}>{w === 'buy' ? `Buy ${sym} (pay ₦)` : `Sell ${sym} (get ₦)`}</button>)}
      </div>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
        {ASSETS.map((a) => <button key={a.v} onClick={() => setAsset(a.v)} className={`chip shrink-0 py-2 ${asset === a.v ? 'bg-mint-400/20 text-mint-100 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{a.flag} {a.sym} {a.label}</button>)}
        <button onClick={() => setNearOnly(!nearOnly)} className={`chip shrink-0 py-2 ${nearOnly ? 'bg-sky-400/20 text-sky-100 ring-1 ring-sky-400/40' : 'bg-fg/[0.06] text-slate-300'}`}><MapPin size={12} /> Near me only</button>
        <button onClick={() => setOnlineOnly(!onlineOnly)} className={`chip shrink-0 py-2 ${onlineOnly ? 'bg-mint-400/20 text-mint-100 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}><span className="size-2 rounded-full bg-mint-400" /> Online now</button>
      </div>
      <div className="flex gap-2">
        <label className="glass flex flex-1 items-center gap-2 rounded-2xl px-4 py-3"><span className="text-slate-400">{sym}</span><input className="w-full bg-transparent text-base font-bold outline-none" inputMode="numeric" placeholder={buying ? 'How much do you need?' : 'How much do you have?'} value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
        <button onClick={() => setSheet('area')} className="glass flex max-w-[45%] shrink-0 items-center gap-1 rounded-2xl px-3 text-xs font-semibold"><MapPin size={14} className="shrink-0 text-mint-300" /><span className="truncate">{area || cityName(s.city) || 'My area'}</span></button>
      </div>
      {data && <p className="-mt-2 flex items-start gap-2 text-[11px] text-slate-500"><InfoTip slug="tip-escrow" /><span className="flex-1">{data.market ? `Market ${sym}1 ≈ ₦${data.market.toFixed(2)} · ` : ''}Best price first · traders set their own rate · Luda fee {(data.rules.feePct * 100).toFixed(1)}% in lira (min ₺{((data.rules.feeMinTry ?? 0) / 100).toFixed(0)}, max ₺{((data.rules.feeMaxTry ?? 0) / 100).toFixed(0)}) from whoever receives the Naira</span></p>}
      {active.length > 0 && <button onClick={() => setSheet('orders')} className="flex items-center gap-3 rounded-2xl border border-gold-400/40 bg-gold-400/10 p-3 text-start"><Clock3 className="shrink-0 text-gold-300" /><span className="flex-1 text-sm"><b>{active.length} order{active.length === 1 ? '' : 's'} in progress</b><br /><span className="text-xs text-slate-400">Tap to continue</span></span><ChevronRight size={18} /></button>}
      {data && !data.canTrade && <div className="flex items-center gap-3 rounded-2xl border border-mint-400/20 bg-mint-400/[0.06] p-3"><ShieldCheck className="shrink-0 text-mint-300" /><p className="flex-1 text-xs text-slate-300">{data.why} You can still look around.</p><Link to="/wallet" className="text-xs font-bold text-mint-300">Verify</Link></div>}
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {!data && !err && [0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-3xl bg-fg/[0.04]" />)}
      {data && ads.length === 0 && <Empty emoji="🤝" title={want_ ? 'No offer for that amount yet' : buying ? `No one is selling ${nameOf(asset)} yet` : `No one is buying ${nameOf(asset)} yet`} sub="Post your own ad and let people come to you." action={data.canTrade ? <button className="btn-primary mt-2 px-5 py-3" onClick={() => setSheet('ads')}><Plus size={16} /> Post an ad</button> : undefined} />}
      {ads.map((a) => (
        <div key={a.id} className="card flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2"><Trader name={a.makerName} user={a.maker} verified={a.verified} stats={a.stats} side={a.side} seen={a.lastSeen ?? null} />
            {!!a.nearby && <span className="chip shrink-0 bg-mint-400/15 py-0.5 text-[10px] text-mint-200"><MapPin size={10} /> {a.nearby >= 2 ? 'Your area' : 'Your city'}</span>}</div>
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[11px] text-slate-400">Price</p><p className="text-2xl font-extrabold">₦{Number(a.price).toFixed(2)}<span className="text-sm font-semibold text-slate-400"> / {sym}1</span></p>
              <p className="text-[11px] text-slate-400">Limit {fa(a.min_try, asset)} – {fa(Math.min(a.max_try, a.available_try), asset)}</p></div>
            <button disabled={!data?.canTrade} onClick={() => setTake(a)} className={`shrink-0 rounded-2xl px-5 py-3 text-sm font-bold text-ink-950 disabled:opacity-40 ${buying ? 'bg-mint-400' : 'bg-rose-400'}`}>{buying ? `Buy ${sym}` : `Sell ${sym}`}</button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {a.methods.map((m) => <span key={m} className="chip bg-fg/[0.06] py-0.5">{m === 'bank' ? '🏦 Bank transfer' : '💵 Cash'}</span>)}
            {(a.area || a.city) && <span className="text-slate-400">📍 {[a.area, cityName(a.city)].filter(Boolean).join(', ')}</span>}
          </div>
          {a.terms && <p className="line-clamp-2 text-xs text-slate-400">“{a.terms}”</p>}
        </div>
      ))}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setSheet('orders')} className="glass flex flex-col items-center gap-1 rounded-2xl py-3 text-xs font-semibold"><Clock3 size={18} className="text-mint-300" />My orders</button>
        <button onClick={() => setSheet('ads')} className="glass flex flex-col items-center gap-1 rounded-2xl py-3 text-xs font-semibold"><Plus size={18} className="text-mint-300" />My ad</button>
        <button onClick={() => setSheet('banks')} className="glass flex flex-col items-center gap-1 rounded-2xl py-3 text-xs font-semibold"><Landmark size={18} className="text-mint-300" />Bank accounts</button>
      </div>
      <HowItWorks />
      {take && data && <TakeSheet ad={{ ...take, asset }} want={want} preset={want_} fee={data.rules} area={area} onClose={() => setTake(null)} onDone={(id) => { setTake(null); nav(`/p2p/${id}`) }} />}
      {sheet === 'banks' && <BankAccounts onClose={() => setSheet(null)} />}
      {sheet === 'ads' && data && <MyAdSheet market={data} asset={asset} onClose={() => setSheet(null)} onDone={reload} />}
      {sheet === 'orders' && <Sheet open onClose={() => setSheet(null)} title="My P2P orders"><OrderList orders={orders.data?.orders ?? null} /></Sheet>}
      {sheet === 'area' && <AreaSheet area={area} onClose={() => setSheet(null)} onSave={(v) => { setArea(v); try { localStorage.setItem(AREA_KEY, v) } catch { /* ignore */ } setSheet(null) }} />}
    </div>
  )
}

function HowItWorks() {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-violet-500/15 to-indigo-700/10 p-4">
      <p className="flex items-center gap-2 font-bold"><ShieldCheck size={18} className="text-mint-300" /> How Luda keeps P2P safe</p>
      <ol className="mt-2 flex flex-col gap-1.5 text-xs text-slate-300">
        <li>1. The Naira is <b>locked by Luda</b> the moment an order opens. Nobody can run with it.</li>
        <li>2. The other person sends the lira to your own TL bank account (or meets you with cash) and uploads the receipt.</li>
        <li>3. You check your bank app, then tap <b>Release</b>. Only then does the Naira move.</li>
        <li>4. Problem? Tap <b>Appeal</b>: the Naira stays locked until the Luda team decides.</li>
      </ol>
      <p className="mt-2 text-[11px] text-slate-500">Everyone is ID-verified. Never release before the lira is really in your account.</p>
    </div>
  )
}

function AreaSheet({ area, onClose, onSave }: { area: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(area)
  const PICK = ['Hamitköy', 'Gönyeli', 'Kaymaklı', 'Ortaköy', 'Dereboyu', 'Karakum', 'Alsancak', 'Lapta', 'Gazimağusa center', 'Kalecik']
  return (
    <Sheet open onClose={onClose} title="Your area">
      <div className="flex flex-col gap-3 pb-4">
        <p className="text-sm text-slate-400">Traders in your area show first, so you can meet someone close by.</p>
        <input className="input" maxLength={40} placeholder="e.g. Hamitköy" value={v} onChange={(e) => setV(e.target.value)} />
        <div className="flex flex-wrap gap-2">{PICK.map((p) => <button key={p} onClick={() => setV(p)} className={`chip py-2 ${v === p ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>{p}</button>)}</div>
        <button className="btn-primary py-3.5" onClick={() => onSave(v.trim())}>Save</button>
      </div>
    </Sheet>
  )
}

/* --------------------------------- take an ad --------------------------------- */
function TakeSheet({ ad, want, preset, fee: rules, area, onClose, onDone }: { ad: Ad; want: 'buy' | 'sell'; preset: number; fee: Market['rules']; area: string; onClose: () => void; onDone: (id: string) => void }) {
  const { me, refresh } = useLive()
  const max = Math.min(ad.max_try, ad.available_try)
  const [amt, setAmt] = useState(preset ? String(preset / 100) : '')
  const [method, setMethod] = useState<'bank' | 'cash'>(ad.methods[0])
  const A = ad.asset ?? 'TRY', sym = symOf(A), tl = (m: number) => fa(m, A)
  const banksAll = useApi<{ methods: PayMethod[] }>(want === 'buy' ? 'pay-methods' : null)
  const banks = { ...banksAll, data: banksAll.data ? { methods: banksAll.data.methods.filter((m) => (m.currency ?? 'TRY') === A) } : null }
  const [pm, setPm] = useState<string>('')
  const [review, setReview] = useState(false)
  const [addBank, setAddBank] = useState(false)
  const orderId = useRef('')
  const t = Math.round(Number(amt.replace(/[^\d]/g, '') || 0)) * 100
  // Fee priced in lira (0.5%, min ₺1, max ₺25), taken from the Naira at this trade's rate. The server works it out the same way.
  const liraMinor = rules.assetPerTry ? Math.round(t / rules.assetPerTry) : 0
  const feeTry = liraMinor ? Math.min(rules.feeMaxTry ?? Infinity, Math.max(rules.feeMinTry ?? 0, Math.round(liraMinor * rules.feePct))) : 0
  const ngn = Math.round(t * ad.price), fee = liraMinor ? Math.round(ngn * feeTry / liraMinor) : Math.round(ngn * rules.feePct)
  const myPm = pm || banks.data?.methods[0]?.id || ''
  const okAmt = t >= ad.min_try && t <= max
  const okDest = want === 'sell' || method === 'cash' || !!myPm
  const okBal = want === 'sell' || (me?.balances.NGN ?? 0) >= ngn
  const chosen = banks.data?.methods.find((m) => m.id === myPm)
  return (
    <Sheet open onClose={onClose} title={want === 'buy' ? `Buy ${nameOf(A)} from @${ad.maker}` : `Sell ${nameOf(A)} to @${ad.maker}`}>
      {review ? (
        <ReviewAndPin holdLabel={want === 'buy' ? `Hold to lock ${naira(ngn)}` : 'Hold to open the order'} onClose={() => setReview(false)}
          rows={want === 'buy'
            ? [['You get', <b key="g">{tl(t)}</b>], ['You pay (locked by Luda)', <b key="p">{naira(ngn)}</b>], ['Price', `₦${Number(ad.price).toFixed(2)} / ${sym}1`], ['Money goes to', method === 'cash' ? `Cash, ${area || ad.area || 'agree in chat'}` : `${chosen?.bank} · ${fmtIban(chosen?.iban ?? '')}`], ['Seller', `@${ad.maker}`]]
            : [['You send', <b key="s">{tl(t)}</b>], ['You get', <b key="g">{naira(ngn - fee)}</b>], ['Luda fee', `₺${(feeTry / 100).toFixed(2)} (≈ ${naira(fee)})`], ['Price', `₦${Number(ad.price).toFixed(2)} / ${sym}1`], ['Buyer', `@${ad.maker}`]]}
          warning={want === 'buy' ? `Your Naira is locked, not sent. It only goes to the seller when you tap Release after the ${nameOf(A)} is in your account.` : `The buyer's Naira is locked by Luda first. You'll see their bank details next. Send the ${nameOf(A)} within 30 minutes and upload the receipt.`}
          run={async (auth) => { const r = await api<{ order: { id: string } }>('POST', 'p2p-order', { adId: ad.id, amountTry: t, method, payMethodId: myPm, area, ...auth }); orderId.current = r.order.id; await refresh() }}
          done={<Success title="Order opened ✅" sub={want === 'buy' ? `The seller now sends the ${nameOf(A)}. Follow it step by step.` : `Now send the ${nameOf(A)} and upload the receipt.`} onClose={() => onDone(orderId.current)} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <Trader name={ad.makerName} user={ad.maker} verified={ad.verified} stats={ad.stats} side={ad.side} seen={ad.lastSeen ?? null} />
          <div className="rounded-3xl bg-fg/[0.04] p-4">
            <label className="text-xs text-slate-400">{want === 'buy' ? 'I want to buy' : 'I want to sell'}<div className="mt-1 flex items-center gap-2"><span className="text-2xl font-bold text-slate-400">{sym}</span><input autoFocus className="w-full bg-transparent text-3xl font-extrabold outline-none" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" /></div></label>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>Limit {tl(ad.min_try)} – {tl(max)}</span><button className="font-semibold text-mint-300" onClick={() => setAmt(String(max / 100))}>Max</button></div>
            {t > 0 && <p className="mt-3 border-t border-fg/10 pt-3 text-sm">{want === 'buy' ? <>You pay <b>{naira(ngn)}</b> from your Naira wallet</> : <>You get <b>{naira(ngn - fee)}</b> in your Naira wallet <span className="text-xs text-slate-400">(after the ₺{(feeTry / 100).toFixed(2)} Luda fee)</span></>}</p>}
          </div>
          {ad.methods.length > 1 && <div className="grid grid-cols-2 gap-2">{ad.methods.map((m) => <button key={m} onClick={() => setMethod(m)} className={`rounded-2xl py-3 text-sm font-semibold ${method === m ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'glass'}`}>{m === 'bank' ? '🏦 Bank transfer' : '💵 Cash meet-up'}</button>)}</div>}
          {want === 'buy' && method === 'bank' && <div className="flex flex-col gap-2">
            <p className="label">Receive the {nameOf(A)} in</p>
            {banks.data?.methods.map((m) => <button key={m.id} onClick={() => setPm(m.id)} className={`flex items-center gap-3 rounded-2xl p-3 text-start ${myPm === m.id ? 'bg-mint-400/15 ring-1 ring-mint-400/40' : 'glass'}`}><BankBadge name={m.bank} /><span className="min-w-0 flex-1"><b className="block text-sm">{m.bank}</b><span className="block truncate font-mono text-[11px] text-slate-400">{fmtIban(m.iban)}</span></span>{myPm === m.id && <Check size={16} className="text-mint-300" />}</button>)}
            <button className="btn-ghost py-3 text-sm" onClick={() => setAddBank(true)}><Plus size={15} /> Add a {A} bank account</button>
          </div>}
          {method === 'cash' && <p className="rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">💵 Meet in a public place{ad.area ? ` around ${ad.area}` : ''}. Count the cash before you release anything. Agree the spot in the order chat.</p>}
          {ad.terms && <p className="rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-300"><b>Trader's terms:</b> {ad.terms}</p>}
          {!okBal && t > 0 && <p className="rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-200">Not enough Naira in your wallet ({naira(me?.balances.NGN ?? 0)}). <Link to="/wallet?a=deposit" className="underline">Top up</Link></p>}
          <button className="btn-primary py-4" disabled={!okAmt || !okDest || !okBal} onClick={() => setReview(true)}>{!t ? 'Enter an amount' : !okAmt ? `Between ${tl(ad.min_try)} and ${tl(max)}` : !okDest ? `Add your ${A} bank account` : 'Review order'}</button>
        </div>
      )}
      {addBank && <AddBankSheet currency={A} onClose={() => setAddBank(false)} onDone={(m) => { banksAll.reload(); setPm(m.id); setAddBank(false) }} />}
    </Sheet>
  )
}

/* --------------------------------- bank accounts --------------------------------- */
function BankAccounts({ onClose }: { onClose: () => void }) {
  const { data, reload } = useApi<{ methods: PayMethod[]; holder: string | null }>('pay-methods')
  const [adding, setAdding] = useState(false)
  const remove = async (id: string) => { await api('POST', 'pay-method-remove', { id }).catch(() => {}); reload() }
  const blocks = useApi<{ mine: string[] }>('p2p-blocks')
  const unblock = async (u: string) => { await api('POST', 'p2p-block', { username: u, on: false }).catch(() => {}); blocks.reload() }
  return (
    <Sheet open onClose={onClose} title="My bank accounts">
      <div className="flex flex-col gap-3 pb-4">
        {!!blocks.data?.mine.length && <div className="rounded-2xl bg-fg/[0.04] p-3"><p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><Ban size={13} /> Blocked traders</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{blocks.data.mine.map((u) => <button key={u} className="chip bg-fg/[0.06] py-1.5 text-xs" onClick={() => void unblock(u)}>@{u} · Unblock</button>)}</div></div>}
        <p className="text-sm text-slate-400">Where people send you lira, dollars, euros or pounds. Accounts must be in your verified name{data?.holder ? <> (<b>{data.holder}</b>)</> : ''}, so lira can't be sent to someone else.</p>
        {data?.methods.length === 0 && <Empty emoji="🏦" title="No bank account yet" sub="Add the TL account you receive lira in." />}
        {data?.methods.map((m) => (
          <div key={m.id} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-700 to-slate-900 p-4 text-white shadow-lg">
            <div className="absolute -end-6 -top-6 size-24 rounded-full bg-white/10 blur-xl" />
            <div className="flex items-center gap-3"><BankBadge name={m.bank} size={40} /><p className="flex-1 font-bold">{m.bank} <span className="ms-1 rounded-lg bg-white/15 px-1.5 py-0.5 text-[11px]">{symOf(m.currency)} {m.currency ?? 'TRY'}</span></p><button aria-label="Remove account" onClick={() => void remove(m.id)} className="grid size-9 place-items-center rounded-xl bg-white/10"><Trash2 size={15} /></button></div>
            <p className="selectable mt-4 font-mono text-base tracking-wide">{fmtIban(m.iban)}</p>
            <p className="mt-1 text-xs text-white/70">{m.holder}</p>
          </div>
        ))}
        <button className="btn-primary py-3.5" onClick={() => setAdding(true)}><Plus size={16} /> Add account</button>
      </div>
      {adding && <AddBankSheet onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} />}
    </Sheet>
  )
}

function AddBankSheet({ currency: fixed, onClose, onDone }: { currency?: Asset; onClose: () => void; onDone: (m: PayMethod) => void }) {
  const [currency, setCurrency] = useState<Asset>(fixed ?? 'TRY')
  const [bank, setBank] = useState('')
  const [iban, setIban] = useState('TR')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const raw = iban.replace(/\s+/g, '').toUpperCase()
  const ok = (currency === 'TRY' ? /^TR\d{24}$/ : /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/).test(raw) && bank.trim().length >= 2
  const save = async () => { setBusy(true); setErr(''); try { const r = await api<{ method: PayMethod }>('POST', 'pay-method-add', { bank, iban: raw, currency }); onDone(r.method) } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) } }
  return (
    <Sheet open onClose={onClose} title="Add a bank account">
      <div className="flex flex-col gap-3 pb-4">
        {!fixed && <><p className="label">Account currency</p><div className="grid grid-cols-4 gap-2">{ASSETS.map((a) => <button key={a.v} onClick={() => setCurrency(a.v)} className={`rounded-2xl py-2.5 text-sm font-bold ${currency === a.v ? 'bg-mint-400/20 text-mint-100 ring-1 ring-mint-400/40' : 'glass'}`}>{a.sym} {a.v}</button>)}</div></>}
        <p className="label">Bank</p>
        <div className="flex flex-wrap gap-2">{TR_BANKS.map((b) => <button key={b} onClick={() => setBank(b)} className={`flex items-center gap-2 rounded-2xl py-1.5 pe-3 ps-1.5 text-xs font-semibold ${bank === b ? 'bg-mint-400/20 text-mint-100 ring-1 ring-mint-400/40' : 'glass'}`}><BankBadge name={b} size={26} />{b}</button>)}</div>
        <input className="input" placeholder="Or type the bank name" value={bank} onChange={(e) => setBank(e.target.value)} />
        <label className="text-xs text-slate-400">IBAN<input className="input mt-1 font-mono tracking-wide" inputMode="text" maxLength={32} value={fmtIban(raw)} onChange={(e) => setIban(e.target.value)} placeholder="TR00 0000 0000 0000 0000 0000 00" /></label>
        {raw.length > 2 && !ok && currency === 'TRY' && <p className="text-xs text-slate-400">{raw.length}/26 characters · TR + 24 digits</p>}
        <p className="flex items-start gap-2 rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-400"><Building2 size={14} className="mt-0.5 shrink-0" /> The account holder is your verified name. Lira sent to someone else's account can't be protected.</p>
        {err && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">{err}</p>}
        <button className="btn-primary py-4" disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save account'}</button>
      </div>
    </Sheet>
  )
}

/* --------------------------------- my ad --------------------------------- */
function MyAdSheet({ market, asset: listAsset, onClose, onDone }: { market: Market; asset: Asset; onClose: () => void; onDone: () => void }) {
  const { s } = useStore()
  const cur = market.mine[0]
  const [asset, setAsset] = useState<Asset>(cur?.asset ?? listAsset)
  const sym = symOf(asset), tl = (m: number) => fa(m, asset)
  const rate = (asset === (market.asset ?? 'TRY') ? market.market : null) ?? (cur ? Number(cur.price) : 0)
  const banks = useApi<{ methods: PayMethod[] }>('pay-methods')
  const [side, setSide] = useState<'sell' | 'buy'>(cur?.side ?? 'sell')
  const [price, setPrice] = useState(cur ? String(cur.price) : rate.toFixed(2))
  const [min, setMin] = useState(cur ? String(cur.min_try / 100) : '100')
  const [max, setMax] = useState(cur ? String(cur.max_try / 100) : '2000')
  const [methods, setMethods] = useState<('bank' | 'cash')[]>(cur?.methods ?? ['bank'])
  const [recv, setRecv] = useState('')
  const [area, setArea] = useState(cur?.area ?? (() => { try { return localStorage.getItem(AREA_KEY) ?? '' } catch { return '' } })())
  const [terms, setTerms] = useState(cur?.terms ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const p = Number(price), diff = rate ? ((p - rate) / rate) * 100 : 0
  const band = market.rules.priceBand * 100
  const myBanks = (banks.data?.methods ?? []).filter((m) => (m.currency ?? 'TRY') === asset)
  const recvId = recv || myBanks[0]?.id || ''
  const save = async (status?: string) => {
    setBusy(true); setErr('')
    try {
      await api('POST', 'p2p-ad-save', { id: cur?.id, side, asset, price: p, minTry: Math.round(Number(min) || 0) * 100, maxTry: Math.round(Number(max) || 0) * 100, methods, receiveMethod: recvId || undefined, city: s.city, area, terms, status })
      onDone(); setSaved(status === 'removed' ? 'Ad removed' : status === 'paused' ? 'Ad paused' : 'Your ad is live ✨')
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  if (saved) return <Sheet open onClose={onClose} title="My ad"><Success title={saved} sub={saved.startsWith('Your') ? 'People nearby will see it first. You get a notification in the order screen when someone trades.' : undefined} onClose={onClose} /></Sheet>
  return (
    <Sheet open onClose={onClose} title={cur ? 'Edit my ad' : 'Post an ad'}>
      <div className="flex flex-col gap-3 pb-4">
        {!cur && <div className="grid grid-cols-4 gap-2">{ASSETS.map((a) => <button key={a.v} onClick={() => setAsset(a.v)} className={`rounded-2xl py-2.5 text-sm font-bold ${asset === a.v ? 'bg-mint-400/20 text-mint-100 ring-1 ring-mint-400/40' : 'glass'}`}>{a.sym} {a.v}</button>)}</div>}
        {!cur && <div className="grid grid-cols-2 gap-1 rounded-2xl bg-fg/[0.05] p-1">{(['sell', 'buy'] as const).map((x) => <button key={x} onClick={() => setSide(x)} className={`rounded-xl py-2.5 text-sm font-bold ${side === x ? 'bg-fg/10 text-slate-100' : 'text-slate-400'}`}>{x === 'sell' ? `I sell ${sym} (get ₦)` : `I buy ${sym} (pay ₦)`}</button>)}</div>}
        {cur && <p className="rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-300">{cur.side === 'sell' ? `You sell ${nameOf(asset)} for Naira.` : `You buy ${nameOf(asset)} with Naira.`} Status: <b>{cur.status}</b> · {tl(cur.available_try)} left</p>}
        <label className="text-xs text-slate-400">Your price (₦ per {sym}1) · you set it
          <div className="mt-1 flex items-center gap-2"><button className="glass size-11 rounded-xl text-lg" onClick={() => setPrice((Number(price) - 0.1).toFixed(2))}>−</button><input className="input text-center text-lg font-bold" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /><button className="glass size-11 rounded-xl text-lg" onClick={() => setPrice((Number(price) + 0.1).toFixed(2))}>+</button></div>
          {rate > 0 && <span className={`mt-1 block ${Math.abs(diff) > band ? 'text-rose-300' : 'text-slate-500'}`}>Market about ₦{rate.toFixed(2)} · yours {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%{Math.abs(diff) > band ? ' (looks like a typo)' : ''}</span>}</label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-400">Min per order ({sym})<input className="input mt-1" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} /></label>
          <label className="text-xs text-slate-400">Total available ({sym})<input className="input mt-1" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} /></label>
        </div>
        <p className="-mt-1 text-[11px] text-slate-500">Up to {tl(market.rules.maxTry)} per ad for now.</p>
        <p className="label">{sym} paid by</p>
        <div className="grid grid-cols-2 gap-2">{(['bank', 'cash'] as const).map((m) => <button key={m} onClick={() => setMethods((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]))} className={`rounded-2xl py-3 text-sm font-semibold ${methods.includes(m) ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'glass'}`}>{m === 'bank' ? '🏦 Bank transfer' : '💵 Cash'}</button>)}</div>
        {side === 'buy' && methods.includes('bank') && <div className="flex flex-col gap-2"><p className="label">You receive {nameOf(asset)} in</p>
          {myBanks.length ? myBanks.map((m) => <button key={m.id} onClick={() => setRecv(m.id)} className={`flex items-center gap-3 rounded-2xl p-3 text-start ${recvId === m.id ? 'bg-mint-400/15 ring-1 ring-mint-400/40' : 'glass'}`}><BankBadge name={m.bank} /><span className="min-w-0 flex-1 text-sm"><b>{m.bank}</b><span className="block truncate font-mono text-[11px] text-slate-400">{fmtIban(m.iban)}</span></span></button>)
            : <p className="text-xs text-gold-200">Add your {asset} bank account first (P2P → Bank accounts).</p>}</div>}
        <label className="text-xs text-slate-400">Your area {methods.includes('cash') ? '' : '(optional)'}<input className="input mt-1" maxLength={40} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Hamitköy" /></label>
        <label className="text-xs text-slate-400">Terms (optional)<textarea className="input mt-1 min-h-16" maxLength={300} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Ziraat or Garanti only. I reply fast 9am–10pm." /></label>
        {err && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">{err}</p>}
        <button className="btn-primary py-4" disabled={busy || !methods.length || !(p > 0) || (rate > 0 && Math.abs(diff) > band)} onClick={() => void save('active')}>{cur ? 'Save & publish' : 'Publish ad'}</button>
        {cur && <div className="grid grid-cols-2 gap-2"><button className="btn-ghost py-3 text-sm" disabled={busy} onClick={() => void save(cur.status === 'paused' ? 'active' : 'paused')}>{cur.status === 'paused' ? 'Resume' : 'Pause'}</button><button className="btn-ghost py-3 text-sm text-rose-300" disabled={busy} onClick={() => void save('removed')}><Trash2 size={15} /> Remove</button></div>}
      </div>
    </Sheet>
  )
}

/* --------------------------------- orders --------------------------------- */
const STATUS: Record<Order['status'], [string, string]> = {
  waiting: ['Waiting for the lira', 'bg-gold-400/15 text-gold-200'], sent: ['Lira sent · check & release', 'bg-sky-400/15 text-sky-200'],
  done: ['Completed', 'bg-mint-400/15 text-mint-200'], cancelled: ['Cancelled · refunded', 'bg-fg/10 text-slate-300'], appeal: ['Appeal · Luda is checking', 'bg-rose-500/15 text-rose-200'],
}
function OrderList({ orders }: { orders: Order[] | null }) {
  if (!orders) return <p className="pb-4 text-sm text-slate-500">Loading…</p>
  if (!orders.length) return <Empty emoji="🤝" title="No orders yet" sub="Buy or sell lira from the list." />
  return (
    <div className="flex flex-col gap-2 pb-4">{orders.map((o) => (
      <Link key={o.id} to={`/p2p/${o.id}`} className="glass flex items-center gap-3 rounded-2xl p-3">
        <span className={`grid size-10 place-items-center rounded-xl text-lg ${o.role === 'payer' ? 'bg-mint-400/15' : 'bg-rose-400/15'}`}>{o.role === 'payer' ? '⬇️' : '⬆️'}</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-bold">{o.role === 'payer' ? 'Buy' : 'Sell'} {fa(o.amount_try, o.asset)} · {naira(o.amount_ngn)}</p>
          <p className="truncate text-[11px] text-slate-400">with @{o.role === 'payer' ? o.sender.username : o.payer.username} · {ago(o.created_at)}</p></div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS[o.status][1]}`}>{STATUS[o.status][0].split(' ·')[0]}</span>
      </Link>
    ))}</div>
  )
}

/** The Luda team asked for a reply with a deadline: who still has to answer, and how long is left (Bybit-style). */
/** Message text; '[guide:p2p-proof]' from the Luda team becomes a button that opens that guide. */
function MsgBody({ text, className = '' }: { text: string; className?: string }) {
  const parts = text.split(/(\[guide:[a-z0-9-]{2,40}\])/g)
  return <p className={`selectable whitespace-pre-wrap ${className}`}>{parts.map((x, i) => {
    const g = /^\[guide:([a-z0-9-]+)\]$/.exec(x)
    return g ? <GuideLink key={i} slug={g[1]} className="my-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-fg/10 px-3 py-2 text-xs font-semibold"><Video size={13} /> Open the guide</GuideLink> : x
  })}</p>
}

function AskBanner({ o, payer, other }: { o: Order; payer: boolean; other: string }) {
  const meAsked = o.ask_who === 'both' || o.ask_who === (payer ? 'payer' : 'sender')
  const themAsked = o.ask_who === 'both' || o.ask_who === (payer ? 'sender' : 'payer')
  const meDone = payer ? o.ask_payer_at : o.ask_sender_at, themDone = payer ? o.ask_sender_at : o.ask_payer_at
  const over = Date.parse(o.ask_due!) < Date.now()
  return (
    <div className={`mt-2 rounded-2xl border p-3 text-xs ${meAsked && !meDone ? (over ? 'border-rose-400/50 bg-rose-500/15' : 'border-gold-400/50 bg-gold-400/15') : 'border-fg/10 bg-fg/[0.05]'}`}>
      {meAsked && !meDone && <p className="font-bold text-slate-100">{over ? '⚠️ Your reply is late: answer now in the chat' : <>🛡️ The Luda team needs your reply · <Countdown to={o.ask_due!} /></>}</p>}
      {meAsked && meDone && <p className="font-semibold text-mint-300">✓ You replied</p>}
      {themAsked && <p className={`mt-1 ${themDone ? 'text-mint-300' : over ? 'font-semibold text-rose-300' : 'text-slate-300'}`}>{themDone ? `✓ @${other} replied` : over ? `⚠️ @${other} didn't reply in time` : `⏳ Waiting for @${other} to reply`}</p>}
      {meAsked && !meDone && <p className="mt-1 text-[11px] text-slate-400">Send a message or a photo (statement, receipt) below. No reply in time and the team may decide without your side.</p>}
    </div>
  )
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const left = Math.max(0, Date.parse(to) - now), h = Math.floor(left / 3600_000), m = Math.floor((left % 3600_000) / 60000), s = Math.floor((left % 60000) / 1000)
  return <span className={`font-mono font-bold ${left < 5 * 60000 ? 'text-rose-300' : 'text-gold-200'}`}>{left ? `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}` : 'time up'}</span>
}

export default function LiveP2POrder() {
  const { id = '' } = useParams()
  const { refresh } = useLive()
  const [o, setO] = useState<Order | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => { api<{ order: Order }>('GET', `p2p-order?id=${id}`).then((r) => { setO(r.order); setErr('') }).catch((e) => setErr(errMsg(e))) }, [id])
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 5000); return () => clearInterval(t) }, [load])
  const [files, setFiles] = useState<Upload[]>([])
  const [act, setAct] = useState<'sent' | 'release' | 'cancel' | 'appeal' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [chat, setChat] = useState('')
  const [priv, setPriv] = useState(false) // appeal: 'Luda team only'
  const [up, setUp] = useState<number | null>(null) // video upload progress 0-100
  const [rev, setRev] = useState<{ good: boolean; body: string } | null>(null)
  const [blockAsk, setBlockAsk] = useState(false)
  const vidRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [o?.messages?.length])
  if (!o) return <div><Header back title="P2P order" /><p className="px-6 pt-10 text-center text-sm text-slate-400">{err || 'Loading…'}</p></div>
  const payer = o.role === 'payer', other = payer ? o.sender : o.payer
  const tl = (m: number) => fa(m, o.asset), money_ = nameOf(o.asset)
  const appealAt = o.sent_at ? Date.parse(o.sent_at) + APPEAL_WAIT_MIN * 60_000 : 0
  const canAppeal = o.status === 'sent' && Date.now() >= appealAt
  const doit = async (route: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setMsg('')
    try { await api('POST', route, { id: o.id, ...body }); setAct(null); setFiles([]); load(); void refresh() } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }
  const sendChat = async () => { if (!chat.trim()) return; await doit('p2p-msg', { body: chat, private: priv && o.status === 'appeal' }); setChat('') }
  // Proof video: the server gives a one-time private upload link; the video goes straight to Luda's private storage.
  const sendVideo = async (f: File) => {
    setMsg('')
    try {
      const r = await api<{ path: string; uploadUrl: string }>('POST', 'p2p-video-start', { id: o.id, type: f.type || 'video/mp4', size: f.size })
      setUp(0)
      await new Promise<void>((ok, bad) => {
        const x = new XMLHttpRequest(); x.open('PUT', r.uploadUrl); x.setRequestHeader('content-type', f.type || 'video/mp4')
        x.upload.onprogress = (e) => e.lengthComputable && setUp(Math.round((e.loaded / e.total) * 100))
        x.onload = () => (x.status < 300 ? ok() : bad(new Error('Upload failed, try again'))); x.onerror = () => bad(new Error('Upload failed, check your connection'))
        x.send(f)
      })
      await doit('p2p-msg', { video: r.path, body: chat.trim() || undefined, private: priv && o.status === 'appeal' }); setChat('')
    } catch (e) { setMsg(errMsg(e)) } finally { setUp(null); if (vidRef.current) vidRef.current.value = '' }
  }
  const theirTurn = (o.status === 'waiting' && payer) || (o.status === 'sent' && !payer) || o.status === 'appeal'
  const expired = Date.parse(o.pay_by) < Date.now()
  const steps = ['Order opened', 'Money sent', payer ? 'You release' : 'Naira released']
  const at = o.status === 'waiting' ? 0 : o.status === 'sent' || o.status === 'appeal' ? 1 : o.status === 'done' ? 3 : -1
  return (
    <div className="pb-10">
      <Header back title={payer ? `Buy ${tl(o.amount_try)}` : `Sell ${tl(o.amount_try)}`} sub={`with @${other.username}${other.verified ? ' ✓' : ''}`} />
      {!['done', 'cancelled'].includes(o.status) && <div className="-mt-3 mb-3 px-5"><Presence at={other.lastSeen ?? null} /></div>}
      <div className="flex flex-col gap-3 px-5">
        <div className={`rounded-3xl p-4 ${o.status === 'done' ? 'bg-gradient-to-br from-emerald-500/30 to-teal-700/20' : o.status === 'cancelled' ? 'bg-fg/[0.05]' : 'bg-gradient-to-br from-violet-500/20 to-indigo-700/15'}`}>
          <div className="flex items-center justify-between"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[o.status][1]}`}>{STATUS[o.status][0]}</span>{o.status === 'waiting' && <span className="text-xs text-slate-300"><Clock3 size={12} className="inline" /> <Countdown to={o.pay_by} /></span>}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div><p className="text-[11px] text-slate-400">{payer ? 'You get' : 'You send'}</p><p className="text-2xl font-extrabold">{tl(o.amount_try)}</p></div>
            <div className="text-end"><p className="text-[11px] text-slate-400">{payer ? 'You pay (locked)' : 'You get'}</p><p className="text-2xl font-extrabold">{naira(payer ? o.amount_ngn : o.amount_ngn - o.fee_ngn)}</p></div>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">₦{Number(o.price).toFixed(2)} per {symOf(o.asset)}1{!payer ? ` · Luda fee ${o.fee_try ? `₺${(o.fee_try / 100).toFixed(2)} (≈ ${naira(o.fee_ngn)})` : naira(o.fee_ngn)}` : ''}</p>
          {at >= 0 && <div className="mt-3 flex gap-1.5">{steps.map((st, i) => <div key={st} className="flex flex-1 flex-col gap-1"><div className={`h-1.5 rounded-full ${i < at ? 'bg-mint-400' : i === at ? 'animate-pulse bg-mint-400/60' : 'bg-fg/10'}`} /><span className={`text-[10px] ${i <= at ? 'text-mint-200' : 'text-slate-500'}`}>{st}</span></div>)}</div>}
        </div>

        {/* what to do now */}
        {o.status === 'waiting' && !payer && <>
          <p className="label">Send exactly {tl(o.amount_try)} {o.method === 'cash' ? 'in cash' : 'to'}</p>
          {o.method === 'bank' ? <div className="divide-y divide-fg/5 rounded-3xl bg-fg/[0.04]">
            <div className="flex items-center gap-3 px-4 py-3"><BankBadge name={o.try_to.bank ?? ''} /><b>{o.try_to.bank}</b></div>
            <Copyable label="IBAN" value={fmtIban(o.try_to.iban ?? '')} mono /><Copyable label="Account holder" value={o.try_to.holder ?? ''} /><Copyable label="Amount" value={String(o.amount_try / 100)} />
          </div> : <p className="rounded-2xl bg-gold-400/10 p-3 text-sm text-gold-100">💵 Meet @{other.username}{o.try_to.area ? ` around ${o.try_to.area}` : ''}. Agree the place in the chat below.</p>}
          <p className="text-xs text-slate-400">Then upload your transfer receipt and tap “I've sent it”. Use only your name as the bank reference.</p>
          <Attachments files={files} setFiles={(f) => setFiles(f.slice(0, 3))} />
          <button className="btn-primary py-4" disabled={!files.length || busy} onClick={() => setAct('sent')}><SendHorizontal size={16} /> I've sent {tl(o.amount_try)}</button>
          <button className="btn-ghost py-3 text-sm" disabled={busy} onClick={() => setAct('cancel')}>Cancel order</button>
        </>}
        {o.status === 'waiting' && payer && <div className="rounded-3xl bg-fg/[0.04] p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold"><Wallet size={16} className="text-mint-300" /> Your {naira(o.amount_ngn)} is locked by Luda.</p>
          <p className="mt-1 text-xs text-slate-400">@{other.username} is sending {tl(o.amount_try)} {o.method === 'bank' ? `to your ${o.try_to.bank} account ${fmtIban(o.try_to.iban ?? '').slice(-9)}` : 'in cash'}. You'll be asked to release once they upload the receipt.</p>
          {expired && <button className="btn-ghost mt-3 w-full py-3 text-sm" disabled={busy} onClick={() => setAct('cancel')}>Time is up · cancel and get my Naira back</button>}
        </div>}
        {(o.status === 'sent' || o.status === 'appeal') && payer && <div className="flex flex-col gap-3">
          <div className="rounded-3xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm"><p className="flex items-center gap-2 font-bold">Check your bank app now <InfoTip slug="tip-p2p-release" /></p><p className="mt-1 text-xs text-slate-300">Did {tl(o.amount_try)} arrive from <b>{other.name}</b>? Only release when you see it in your account, not just a screenshot.</p></div>
          {o.receiptUrls?.filter(Boolean).length ? <div className="flex gap-2">{o.receiptUrls.filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer"><img src={u!} alt="Receipt" className="size-24 rounded-2xl object-cover ring-1 ring-fg/10" /></a>)}</div> : null}
          {o.status === 'sent' && o.sent_at && <p className="flex items-center justify-center gap-1 text-xs text-slate-400"><Clock3 size={12} /> Release or appeal within <Countdown to={new Date(Date.parse(o.sent_at) + 60 * 60_000).toISOString()} />, or the Luda team steps in.</p>}
          <button className="btn-primary py-4" onClick={() => setAct('release')}><Check size={17} /> I received it · release {naira(o.amount_ngn)}</button>
          {o.status === 'sent' && (canAppeal ? <button className="btn-ghost py-3 text-sm text-rose-300" onClick={() => setAct('appeal')}>It didn't arrive · appeal</button>
            : <p className="text-center text-xs text-slate-400">Not arrived yet? Banks can take a few minutes. You can appeal in <Countdown to={new Date(appealAt).toISOString()} />.</p>)}
        </div>}
        {o.status === 'sent' && !payer && <div className="rounded-3xl bg-fg/[0.04] p-4 text-sm"><p className="font-semibold">Waiting for @{other.username} to confirm</p><p className="mt-1 text-xs text-slate-400">They check their bank and release. Not answering? You can appeal and the Luda team will check your receipt.</p>
          {canAppeal ? <button className="btn-ghost mt-3 w-full py-3 text-sm" onClick={() => setAct('appeal')}>Appeal</button> : <p className="mt-2 text-xs text-slate-500">Appeal available in <Countdown to={new Date(appealAt).toISOString()} /></p>}
          <p className="mt-2 text-[11px] text-slate-500">Not released in <Countdown to={new Date(Date.parse(o.sent_at ?? o.created_at) + 60 * 60_000).toISOString()} />? It goes to the Luda team automatically.</p></div>}
        {(o.status === 'appeal' || o.appeal_stage) && <div className="rounded-3xl border border-rose-400/30 bg-rose-500/[0.07] p-4">
          <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 font-bold">⚖️ Dispute <InfoTip slug="tip-p2p-appeal" /></p>
            <GuideLink slug="p2p-proof" className="chip bg-fg/10 py-1.5 text-xs text-slate-200"><Video size={13} /> How to record proof</GuideLink></div>
          <div className="mt-2 flex gap-1.5">{[['negotiation', '1 · Talk it out'], ['review', '2 · Luda review'], ['decided', '3 · Decision']].map(([k, l], i) => {
            const at = ['negotiation', 'review', 'decided'].indexOf(o.appeal_stage ?? 'negotiation')
            return <div key={k} className="flex flex-1 flex-col gap-1"><div className={`h-1.5 rounded-full ${i < at ? 'bg-rose-300' : i === at ? 'animate-pulse bg-rose-300/70' : 'bg-fg/10'}`} /><span className={`text-[10px] ${i <= at ? 'text-rose-100' : 'text-slate-500'}`}>{l}</span></div>
          })}</div>
          <p className="mt-2 text-xs text-slate-300">{o.appeal_stage === 'negotiation' ? 'You have 30 minutes to sort it out here: release if the money arrived, or the sender cancels if it was not sent. Then the Luda team reviews it.' : o.appeal_stage === 'review' ? `The Luda team is reviewing${o.assigned_to ? ` (handled by ${o.assigned_to})` : ''}. Add receipts or bank statements in the chat.` : 'The Luda team has decided. See the chat for the reason.'}</p>
          {o.status === 'appeal' && o.appeal_stage === 'negotiation' && o.appeal_at && <p className="mt-2 flex items-center gap-1 rounded-xl bg-fg/[0.05] px-3 py-2 text-xs"><Clock3 size={12} /> The Luda team steps in in <Countdown to={new Date(Date.parse(o.appeal_at) + 30 * 60_000).toISOString()} /></p>}
          {o.status === 'appeal' && o.ask_due && <AskBanner o={o} payer={payer} other={other.username} />}
          {o.appeal_reason && <p className="mt-1 text-[11px] text-slate-400">Reason: {o.appeal_reason}{o.appealBy === 'auto' ? '' : ` (by ${o.appealBy === (payer ? 'payer' : 'sender') ? 'you' : '@' + other.username})`}</p>}
          <p className="mt-1 text-[11px] text-slate-400">The Naira stays locked until it's settled.</p>
          {o.status === 'appeal' && o.iAppealed && o.appeal_stage === 'negotiation' && <button className="btn-ghost mt-3 w-full py-2.5 text-xs" disabled={busy} onClick={() => void doit('p2p-appeal-cancel')}>Withdraw my appeal</button>}
          {o.status === 'appeal' && !payer && <button className="btn-ghost mt-2 w-full py-2.5 text-xs" disabled={busy} onClick={() => setAct('cancel')}>I didn't send it · cancel and refund</button>}
        </div>}
        {(o.status === 'done' || o.status === 'cancelled') && o.note && <p className="rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-300">{o.note}</p>}
        {theirTurn && <button className="btn-ghost py-2.5 text-sm" disabled={busy} onClick={() => void doit('p2p-remind')}><Bell size={15} /> Remind @{other.username}</button>}
        {o.status === 'done' && !o.reviewed && (
          <div className="rounded-3xl bg-fg/[0.04] p-4">
            <p className="font-semibold">How was trading with @{other.username}?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className={`btn py-3 text-sm ${rev?.good === true ? 'bg-mint-400 text-ink-950' : 'bg-fg/[0.06]'}`} onClick={() => setRev({ good: true, body: rev?.body ?? '' })}><ThumbsUp size={16} /> Good</button>
              <button className={`btn py-3 text-sm ${rev?.good === false ? 'bg-rose-500 text-white' : 'bg-fg/[0.06]'}`} onClick={() => setRev({ good: false, body: rev?.body ?? '' })}><ThumbsDown size={16} /> Bad</button>
            </div>
            {rev && <><input className="input mt-2 text-sm" maxLength={200} placeholder="A few words (optional)" value={rev.body} onChange={(e) => setRev({ ...rev, body: e.target.value })} />
              <button className="btn-primary mt-2 w-full py-3 text-sm" disabled={busy} onClick={() => void doit('p2p-review', { good: rev.good, body: rev.body })}>Send review</button></>}
            <p className="mt-2 text-[11px] text-slate-500">One review per trade. Others see 👍/👎 on this trader's ads.</p>
          </div>
        )}
        {msg && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">{msg}</p>}

        {/* chat */}
        <p className="label mt-2 flex items-center gap-1"><MessageCircle size={13} /> Order chat</p>
        <div ref={listRef} className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-3xl bg-fg/[0.03] p-3">
          {(o.messages ?? []).map((m) => m.kind === 'staff'
            ? <div key={m.id} className="self-center w-full rounded-2xl border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-sm"><p className="flex items-center justify-between gap-2 text-[11px] font-bold text-violet-200"><span>🛡️ {m.by}</span><span className="font-normal text-slate-400">{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></p><MsgBody text={m.body} className="text-slate-100" /></div>
            : m.by === null
            ? <p key={m.id} className="text-center text-[11px] text-slate-400">🛡️ {m.body}</p>
            : <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'self-end rounded-br-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white' : 'self-start rounded-bl-md bg-fg/[0.07]'}`}>
              {m.private && <p className={`flex items-center gap-1 text-[10px] font-semibold ${m.mine ? 'text-white/80' : 'text-slate-400'}`}><Lock size={10} /> Only you and the Luda team</p>}
              {!m.mine && <p className="text-[11px] font-bold text-mint-300">@{m.by}</p>}{m.body && <MsgBody text={m.body} />}
              {m.files?.filter(Boolean).map((u, i) => /\.(mp4|webm|mov|3gp)(\?|$)/i.test(u!) ? <video key={i} src={u!} controls playsInline className="mt-1 max-h-60 w-full rounded-xl bg-black" /> : <a key={i} href={u!} target="_blank" rel="noreferrer"><img src={u!} alt="" className="mt-1 max-h-40 rounded-xl" /></a>)}
              <p className={`text-end text-[10px] ${m.mine ? 'text-white/70' : 'text-slate-500'}`}>{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>)}
        </div>
        {o.status === 'appeal' && <div className="flex items-center gap-2 text-xs"><span className="text-slate-400">Who can see your next message?</span>
          <div className="flex gap-1">{([[false, 'Everyone'], [true, 'Luda team only']] as const).map(([v, l]) => <button key={l} onClick={() => setPriv(v)} className={`chip py-1.5 ${priv === v ? 'bg-mint-400 text-ink-950' : 'bg-fg/[0.06] text-slate-300'}`}>{v && <Lock size={11} />} {l}</button>)}</div></div>}
        {(o.status === 'sent' || o.status === 'appeal' || o.status === 'waiting') && <>
          <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendVideo(f) }} />
          <button className="btn-ghost py-2.5 text-sm" disabled={up !== null || busy} onClick={() => vidRef.current?.click()}><Video size={15} /> {up !== null ? `Uploading video… ${up}%` : 'Add a proof video'}</button></>}
        {(o.status !== 'done' && o.status !== 'cancelled') && <div className="flex gap-2"><input className="input flex-1" maxLength={500} placeholder="Message" value={chat} onChange={(e) => setChat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void sendChat()} /><button aria-label="Send" disabled={!chat.trim() || busy} onClick={() => void sendChat()} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-mint-400 text-ink-950 disabled:opacity-40"><SendHorizontal size={18} /></button></div>}
        <p className="text-center text-[11px] text-slate-500">Never share your PIN or codes. Luda will never ask you to pay outside an order.</p>
        {blockAsk ? <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm"><p>Block @{other.username}? You won't see their ads and they can't trade with you. This order still continues.</p>
          <div className="mt-2 flex gap-2"><button className="btn bg-rose-500 px-4 py-2 text-sm text-white" disabled={busy} onClick={() => void api('POST', 'p2p-block', { username: other.username }).then(() => { setBlockAsk(false); setMsg(`@${other.username} is blocked. Unblock any time in P2P → Bank accounts.`) }).catch((e) => setMsg(errMsg(e)))}>Block</button><button className="btn-ghost px-4 py-2 text-sm" onClick={() => setBlockAsk(false)}>Cancel</button></div></div>
          : <button className="mx-auto flex items-center gap-1 text-xs text-slate-500" onClick={() => setBlockAsk(true)}><Ban size={12} /> Block @{other.username}</button>}
      </div>

      {act === 'release' && <ReleaseSheet o={o} other={other} tl={tl} money_={money_} onClose={() => setAct(null)} onDone={() => { load(); void refresh() }} />}
      {act === 'sent' && <Sheet open onClose={() => setAct(null)} title="Confirm you've sent it">
        <div className="flex flex-col gap-3 pb-4"><p className="text-sm text-slate-300">You sent <b>{tl(o.amount_try)}</b> {o.method === 'bank' ? <>to <b>{o.try_to.holder}</b> ({o.try_to.bank})</> : <>in cash to @{other.username}</>}?</p>
          <p className="text-xs text-slate-400">Marking it sent without paying is fraud and gets your account blocked.</p>
          <button className="btn-primary py-4" disabled={busy} onClick={() => void doit('p2p-sent', { files: files.map(({ name, type, data }) => ({ name, type, data })) })}>Yes, I've sent it</button></div>
      </Sheet>}
      {act === 'cancel' && <Sheet open onClose={() => setAct(null)} title="Cancel this order?">
        <div className="flex flex-col gap-3 pb-4"><p className="text-sm text-slate-300">{payer ? 'Your Naira comes back to your wallet.' : `Only cancel if you have NOT sent the ${money_}. @${other.username}'s Naira goes back to them.`}</p>
          <button className="btn-primary py-4" disabled={busy} onClick={() => void doit('p2p-cancel')}>Cancel order</button></div>
      </Sheet>}
      {act === 'appeal' && <Sheet open onClose={() => setAct(null)} title="Appeal to Luda">
        <div className="flex flex-col gap-3 pb-4"><p className="text-sm text-slate-300">The Naira stays locked while the Luda team checks the receipts and chat.</p>
          <textarea className="input min-h-24" maxLength={300} placeholder="What went wrong?" value={reason} onChange={(e) => setReason(e.target.value)} />
          {msg && <p className="text-sm text-rose-300">{msg}</p>}
          <button className="btn-primary py-4" disabled={busy || reason.trim().length < 5} onClick={() => void doit('p2p-appeal', { reason })}>Send appeal</button></div>
      </Sheet>}
    </div>
  )
}

/** Release: a checklist first (no mistakes, no pressure), then hold + PIN/fingerprint. */
function ReleaseSheet({ o, other, tl, money_, onClose, onDone }: { o: Order; other: Order['payer']; tl: (m: number) => string; money_: string; onClose: () => void; onDone: () => void }) {
  const [ticks, setTicks] = useState([false, false, false])
  const [go, setGo] = useState(false)
  const items = [
    `I opened my bank app myself and I can see ${tl(o.amount_try)} in my account (not just a screenshot or an SMS).`,
    `The sender's name in my bank matches ${other.name}.`,
    'Nobody is rushing or pressuring me. If something feels wrong, I will appeal instead.',
  ]
  return (
    <Sheet open onClose={onClose} title="Release the Naira">
      {go ? <ReviewAndPin holdLabel={`Hold to release ${naira(o.amount_ngn)}`} onClose={() => setGo(false)}
        rows={[['I received', <b key="r">{tl(o.amount_try)}</b>], ['From', other.name], ['Release to', `@${other.username}`], ['Amount', naira(o.amount_ngn)]]}
        warning="This can't be undone. Luda can't get the Naira back once you release."
        run={async (auth) => { await api('POST', 'p2p-release', { id: o.id, ...auth }); onDone() }}
        done={<Success title="Done ✅" sub="The trade is complete. Thanks for trading safely." onClose={onClose} />} />
        : <div className="flex flex-col gap-3 pb-4">
          <p className="rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-100">⚠️ Releasing sends {naira(o.amount_ngn)} to @{other.username} for good. Scammers send fake receipts and rush you. Check your own bank first.</p>
          {items.map((t, i) => <label key={i} className="flex items-start gap-3 rounded-2xl bg-fg/[0.04] p-3 text-sm"><input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-emerald-400" checked={ticks[i]} onChange={(e) => setTicks((x) => x.map((v, k) => (k === i ? e.target.checked : v)))} /><span>{t}</span></label>)}
          <button className="btn-primary py-4" disabled={!ticks.every(Boolean)} onClick={() => setGo(true)}>Continue to release</button>
          <button className="btn-ghost py-3 text-sm" onClick={onClose}>The {money_} is not there · go back</button>
        </div>}
    </Sheet>
  )
}
