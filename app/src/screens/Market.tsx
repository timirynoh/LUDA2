import { motion } from 'framer-motion'
import { Camera, MapPin, MessageCircle, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReviewSheet, Stars } from '../components/Review'
import { TradeChat } from '../components/TradeChat'
import { DemoNote, Header, PinPad, Segmented, Sheet, Success } from '../components/ui'
import { CITIES, SAFE_SPOTS } from '../lib/data'
import { fmt } from '../lib/fx'
import { AREAS } from '../lib/housing'
import { itemsFor, type Condition, type Item, type ItemCat, type Order } from '../lib/market'
import { checkText } from '../lib/moderation'
import { personOf } from '../lib/social'
import { uid, useStore } from '../lib/store'
import { thumb } from '../lib/threads'
import { OpenDispute } from './Disputes'

const CATS: ('All' | ItemCat)[] = ['All', 'Furniture', 'Electronics', 'Books', 'Clothes', 'Kitchen', 'Other']

export default function Market() {
  const { s, gate } = useStore()
  const [tab, setTab] = useState<'browse' | 'mine'>('browse')
  const [cat, setCat] = useState<'All' | ItemCat>('All')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Item | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [posting, setPosting] = useState(false)
  const city = CITIES.find((c) => c.id === s.city)!
  const items = useMemo(() => [...s.myItems.filter((i) => i.city === s.city && !i.sold), ...itemsFor(s.city, AREAS[s.city] ?? AREAS.lefkosa)]
    .filter((i) => !s.orders.some((o) => o.itemId === i.id && o.status !== 'cancelled') || i.mine).filter((i) => !s.reports.includes(i.id)), [s.myItems, s.city, s.orders, s.reports])
  const list = items.filter((i) => (cat === 'All' || i.cat === cat) && (!q || `${i.title} ${i.desc}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <div>
      <Header back title="Marketplace" sub={`📍 ${city.name} · buy & sell safely`} />
      <div className="flex flex-col gap-3 px-5">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'browse', label: '🛒 Browse' }, { value: 'mine', label: `📦 Mine${s.orders.length + s.myItems.length ? ` · ${s.orders.length + s.myItems.length}` : ''}` }]} />
        {tab === 'browse' ? <>
          <div className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3 text-xs text-slate-300"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-mint-300" /><span><b>Buy safely:</b> pay into escrow, meet at a Safe Spot, check the item, then release. Never pay before seeing it.</span></div>
          <div className="relative"><Search size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" /><input className="input ps-11" placeholder="Search sofa, phone, books…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5">{CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={`chip shrink-0 px-4 py-2 text-sm ${cat === c ? 'bg-gradient-to-r from-amber-300 to-rose-500 text-ink-950' : 'glass text-slate-300'}`}>{c}</button>)}</div>
          <div className="grid grid-cols-2 gap-3">
            {list.map((i, k) => (
              <motion.button key={i.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(k, 8) * 0.03 }} onClick={() => setOpen(i)} className="card overflow-hidden p-0 text-start">
                <div className="grid aspect-square place-items-center bg-gradient-to-br from-ink-600 to-ink-800 text-6xl">{i.photos[0] ? <img src={i.photos[0]} alt="" className="size-full object-cover" /> : i.emoji}</div>
                <div className="p-3"><p className="font-extrabold">{fmt(i.price, 'TRY')}</p><p className="line-clamp-1 text-sm">{i.title}</p><p className="text-[11px] text-slate-500">{i.condition} · {i.area}</p></div>
              </motion.button>
            ))}
          </div>
          {!list.length && <p className="card text-center text-sm text-slate-400">Nothing here yet. Be the first to sell!</p>}
        </> : <>
          <p className="label">My purchases</p>
          {s.orders.length ? s.orders.map((o) => (
            <button key={o.id} onClick={() => setOrder(o)} className="card flex items-center gap-3 text-start">
              <span className="text-3xl">{o.emoji}</span><div className="flex-1"><p className="text-sm font-semibold">{o.title}</p><p className="text-xs text-slate-400">{fmt(o.price, 'TRY')} · {o.seller}</p></div>
              <span className={`chip ${o.status === 'done' ? 'bg-mint-400/15 text-mint-300' : o.status === 'escrow' ? 'bg-fuchsia-500/15 text-fuchsia-300' : 'bg-rose-500/15 text-rose-300'}`}>{o.status === 'escrow' ? '🔒 In escrow' : o.status === 'done' ? '✓ Done' : o.status}</span>
            </button>
          )) : <p className="card text-center text-sm text-slate-400">No purchases yet.</p>}
          <p className="label mt-2">My listings</p>
          {s.myItems.length ? s.myItems.map((i) => <MyItemRow key={i.id} i={i} />) : <p className="card text-center text-sm text-slate-400">Selling something? Tap "Sell".</p>}
        </>}
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 mx-auto flex max-w-md justify-end px-5">
          <button onClick={() => gate(1, 'Sell on the marketplace') && setPosting(true)} className="btn-gold pointer-events-auto rounded-full px-5 shadow-2xl"><Plus size={18} /> Sell</button>
        </div>
      </div>
      <DemoNote />
      {open && <ItemSheet i={open} onClose={() => setOpen(null)} onBought={(o) => { setOpen(null); setOrder(o) }} />}
      {order && <OrderSheet id={order.id} onClose={() => setOrder(null)} />}
      {posting && <SellSheet onClose={() => setPosting(false)} />}
    </div>
  )
}

function MyItemRow({ i }: { i: Item }) {
  const { set } = useStore()
  return (
    <div className="card flex items-center gap-3">
      <span className="text-3xl">{i.photos[0] ? <img src={i.photos[0]} alt="" className="size-10 rounded-lg object-cover" /> : i.emoji}</span>
      <div className="flex-1"><p className="text-sm font-semibold">{i.title}</p><p className="text-xs text-slate-400">{fmt(i.price, 'TRY')} · {i.sold ? 'Sold' : 'Live'}</p></div>
      <button aria-label="Remove" className="text-slate-500" onClick={() => set((p) => ({ ...p, myItems: p.myItems.filter((x) => x.id !== i.id) }))}><Trash2 size={16} /></button>
    </div>
  )
}

function ItemSheet({ i, onClose, onBought }: { i: Item; onClose: () => void; onBought: (o: Order) => void }) {
  const { s, set, addTx, gate, checkPin, reward, toast, allow } = useStore()
  const seller = personOf(i.seller)
  const spots = SAFE_SPOTS[s.city] ?? SAFE_SPOTS.lefkosa
  const [stage, setStage] = useState<'view' | 'chat' | 'pin'>('view')
  const [spot, setSpot] = useState(spots[0])
  const [err, setErr] = useState('')
  const bal = s.balances.TRY ?? 0
  const buy = async (pin: string) => {
    if (!(await checkPin(pin))) return setErr('Wrong PIN')
    const o: Order = { id: uid(), itemId: i.id, title: i.title, price: i.price, seller: i.seller, emoji: i.emoji, status: 'escrow', ts: Date.now(), spot }
    set((p) => ({ ...p, orders: [o, ...p.orders], balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) - i.price } }))
    addTx({ type: 'p2p', amount: -i.price, currency: 'TRY', label: `Escrow · ${i.title}`, meta: i.seller })
    reward(20, { badge: 'trader', title: 'Payment safe in escrow 🔒' }); onBought(o)
  }
  return (
    <Sheet open onClose={onClose} title={i.title}>
      {stage === 'pin' ? <div className="flex flex-col items-center gap-3"><p className="text-sm text-slate-300">Lock {fmt(i.price, 'TRY')} in escrow</p><PinPad error={err} onDone={buy} /></div> : stage === 'chat' ? (
        <TradeChat threadKey={`item-${i.id}`} name={i.seller} flag={seller.flag} intro="Ask about the item. Pay only through Luda escrow." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid h-52 place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-ink-600 to-ink-800 text-8xl">{i.photos[0] ? <img src={i.photos[0]} alt="" className="size-full object-cover" /> : i.emoji}</div>
          <div className="flex items-end justify-between"><p className="text-3xl font-extrabold">{fmt(i.price, 'TRY')}</p><span className="chip bg-fg/5 text-slate-300">{i.condition}</span></div>
          <p className="text-sm text-slate-300">{i.desc}</p>
          <Link to={`/u/${encodeURIComponent(i.seller)}`} className="card flex items-center gap-3 py-3">
            <span className="grid size-10 place-items-center rounded-full bg-ink-700 text-xl">{seller.flag}</span>
            <div className="flex-1"><p className="text-sm font-semibold">{i.mine ? 'You' : i.seller} {seller.kyc && <span className="text-mint-400">✓</span>}</p><p className="flex items-center gap-1 text-xs text-slate-400"><Stars value={seller.rating} size={10} /> {seller.rating} · {seller.trades} sales</p></div>
            <span className="text-xs text-mint-300">Profile ›</span>
          </Link>
          {!i.mine && <>
            <select className="input" value={spot} onChange={(e) => setSpot(e.target.value)} aria-label="Safe Spot">{spots.map((x) => <option key={x}>{x}</option>)}</select>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button className="btn-ghost" onClick={() => setStage('chat')} aria-label="Message seller"><MessageCircle size={18} /></button>
              <button className="btn-primary py-4" onClick={() => { if (!gate(2, 'Buy with escrow')) return; if (bal < i.price) return toast({ title: 'Top up your Lira wallet first', emoji: '⚠️' }); setErr(''); setStage('pin') }}><ShieldCheck size={18} /> Buy safely · {fmt(i.price, 'TRY')}</button>
            </div>
            <button className="text-xs text-slate-500 underline" onClick={() => { if (!allow('report')) return; set((p) => ({ ...p, reports: [...p.reports, i.id] })); toast({ title: 'Listing reported', emoji: '🛡️' }); onClose() }}>Report listing</button>
          </>}
        </div>
      )}
    </Sheet>
  )
}

function OrderSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { s, set, checkPin, reward } = useStore()
  const o = s.orders.find((x) => x.id === id)
  const [pin, setPin] = useState(false)
  const [err, setErr] = useState('')
  const [appeal, setAppeal] = useState(false)
  const [review, setReview] = useState(false)
  if (!o) return null
  const release = async (p: string) => {
    if (!(await checkPin(p))) return setErr('Wrong PIN')
    set((st) => ({ ...st, orders: st.orders.map((x) => (x.id === id ? { ...x, status: 'done' } : x)) })); reward(15, { title: `Paid ${o.seller}` }); setPin(false)
  }
  return (
    <Sheet open onClose={onClose} title={o.title}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3"><span className="text-4xl">{o.emoji}</span><div><p className="font-bold">{fmt(o.price, 'TRY')}</p><p className="flex items-center gap-1 text-xs text-slate-400"><MapPin size={11} /> {o.spot}</p></div></div>
        {o.status === 'escrow' && <p className="rounded-2xl bg-fuchsia-500/10 p-3 text-sm">🔒 Your money is in escrow. Meet {o.seller}, check the item, then release.</p>}
        {o.status !== 'cancelled' && <TradeChat threadKey={`order-${o.id}`} name={o.seller} flag={personOf(o.seller).flag} onAppeal={o.status === 'escrow' ? () => setAppeal(true) : undefined} />}
        {o.status === 'escrow' && (pin ? <div className="flex flex-col items-center gap-2"><PinPad error={err} onDone={release} /></div> : <button className="btn-primary py-4" onClick={() => setPin(true)}>✅ I got the item: release {fmt(o.price, 'TRY')}</button>)}
        {o.status === 'done' && <button className="btn-gold py-3.5" onClick={() => setReview(true)}>⭐ Rate {o.seller}</button>}
        {o.status === 'disputed' && <Link to="/disputes" className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">Appeal open: escrow frozen · View case</Link>}
        {o.status === 'cancelled' && <p className="rounded-2xl bg-fg/5 p-3 text-sm text-slate-400">Cancelled & refunded.</p>}
      </div>
      {appeal && <OpenDispute kind="market" refId={o.id} title={`Marketplace: ${o.title}`} counterparty={o.seller} amount={o.price} cur="TRY" onClose={() => setAppeal(false)} onOpened={() => set((st) => ({ ...st, orders: st.orders.map((x) => (x.id === id ? { ...x, status: 'disputed' } : x)) }))} />}
      {review && <ReviewSheet about={o.seller} context="Marketplace purchase" refId={`rev-${o.id}`} onClose={() => setReview(false)} />}
    </Sheet>
  )
}

function SellSheet({ onClose }: { onClose: () => void }) {
  const { s, set, toast, allow } = useStore()
  const areas = AREAS[s.city] ?? AREAS.lefkosa
  const [f, setF] = useState({ title: '', price: '', cat: 'Furniture' as ItemCat, condition: 'Good' as Condition, desc: '', area: areas[0], photos: [] as string[] })
  const [done, setDone] = useState(false)
  const post = () => {
    const c = checkText(`${f.title} ${f.desc}`)
    if (!c.ok) return toast({ title: c.scam ? `Blocked: ${c.scam}` : 'Please remove inappropriate words', emoji: '⚠️' })
    if (!allow('item', f.title)) return
    const emoji = { Furniture: '🛋️', Electronics: '📱', Books: '📘', Clothes: '👕', Kitchen: '🍳', Other: '📦' }[f.cat]
    set((p) => ({ ...p, myItems: [{ id: uid(), title: f.title.trim(), price: +f.price, cat: f.cat, condition: f.condition, seller: p.name, city: p.city, area: f.area, emoji, photos: f.photos, desc: f.desc.trim(), posted: 0, mine: true }, ...p.myItems] }))
    setDone(true)
  }
  return (
    <Sheet open onClose={onClose} title="Sell an item">
      {done ? <Success title="Listed! 🛒" sub="Buyers pay into escrow, so you're paid as soon as they confirm." onClose={onClose} /> : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {f.photos.map((p, i) => <img key={i} src={p} alt="" className="size-20 rounded-xl object-cover" />)}
            {f.photos.length < 4 && <label className="grid size-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-fg/15 text-slate-500"><Camera size={22} />
              <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { const fs = [...(e.target.files ?? [])].slice(0, 4 - f.photos.length); const t = await Promise.all(fs.map((x) => thumb(x, 480))); setF({ ...f, photos: [...f.photos, ...t] }) }} /></label>}
          </div>
          <input className="input" placeholder="What are you selling?" maxLength={50} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="Price (₺)" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} />
          <div className="flex flex-wrap gap-2">{CATS.slice(1).map((c) => <button key={c} onClick={() => setF({ ...f, cat: c as ItemCat })} className={`chip py-1.5 ${f.cat === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{c}</button>)}</div>
          <div className="flex flex-wrap gap-2">{(['New', 'Like new', 'Good', 'Fair'] as Condition[]).map((c) => <button key={c} onClick={() => setF({ ...f, condition: c })} className={`chip py-1.5 ${f.condition === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{c}</button>)}</div>
          <select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>{areas.map((a) => <option key={a}>{a}</option>)}</select>
          <textarea className="input min-h-20" placeholder="Describe it" maxLength={300} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
          <button className="btn-primary py-4" disabled={!f.title.trim() || !+f.price} onClick={post}>Post listing</button>
        </div>
      )}
    </Sheet>
  )
}
