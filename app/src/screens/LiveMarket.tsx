// Live: marketplace with escrow. The buyer's money is held by Luda until they confirm they got the item;
// then the seller is paid (minus a small fee). Sellers must be ID-verified. Disputes go to the Luda team.
import { InfoTip } from '../components/LiveGuides'
import { BadgeCheck, Camera, ImageOff, LifeBuoy, MapPin, Plus, ShieldCheck, Tag } from 'lucide-react'
import { useState } from 'react'
import { Empty, Pill, Tabs, ago, lira, toMinor, useApi } from '../components/LiveKit'
import { LiveKyc, ReviewAndPin, errMsg } from '../components/LiveMoney'
import { Attachments, CasesHub, type Upload } from '../components/LiveSupport'
import { Header, Sheet, Success } from '../components/ui'
import { CITIES } from '../lib/data'
import { api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'

interface Item { id: string; title: string; description: string; category: string; city: string; price_minor: number; status: 'active' | 'reserved' | 'sold' | 'removed'; created_at: string; updated_at: string; reserved_at: string | null; seller_name?: string; buyer_name?: string; mine: boolean; photoUrls: (string | null)[] }
interface Market { items: Item[]; mine: Item[]; bought: Item[]; feePct: number }
const CATS: [string, string][] = [['electronics', '📱 Electronics'], ['furniture', '🛋️ Furniture'], ['books', '📚 Books'], ['fashion', '👗 Fashion'], ['kitchen', '🍳 Kitchen'], ['tickets', '🎟️ Tickets'], ['other', '📦 Other']]
const catLabel = (c: string) => CATS.find(([k]) => k === c)?.[1] ?? '📦 Other'
const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? ''

function Photo({ url, className = '' }: { url?: string | null; className?: string }) {
  return url ? <img src={url} alt="" className={`object-cover ${className}`} loading="lazy" /> : <div className={`grid place-items-center bg-fg/[0.05] text-slate-500 ${className}`}><ImageOff size={22} /></div>
}

export default function LiveMarket() {
  const { s } = useStore()
  const { refresh } = useLive()
  const [tab, setTab] = useState<'browse' | 'selling' | 'bought'>('browse')
  const [here, setHere] = useState(false)
  const { data, reload } = useApi<Market>(`market${here ? `?city=${s.city}` : ''}`)
  const [cat, setCat] = useState('')
  const [view, setView] = useState<Item | null>(null)
  const [sell, setSell] = useState(false)
  const done = () => { reload(); void refresh() }
  const toConfirm = (data?.bought ?? []).filter((x) => x.status === 'reserved').length
  const items = (data?.items ?? []).filter((x) => !cat || x.category === cat)

  return (
    <div className="pb-8">
      <Header back title="Marketplace" sub="Buy & sell safely · money held until you get it" right={<div className="flex items-center gap-2"><InfoTip slug="tip-market" /><button className="btn-primary px-4 py-2.5 text-sm" onClick={() => setSell(true)}><Plus size={16} /> Sell</button></div>} />
      <div className="flex flex-col gap-4 px-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'browse', label: 'Browse' }, { value: 'selling', label: 'Selling' }, { value: 'bought', label: 'Bought', badge: toConfirm }]} />
        {tab === 'browse' && <>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            <button onClick={() => setHere(!here)} className={`chip shrink-0 py-2 ${here ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}><MapPin size={12} /> {here ? cityName(s.city) : 'All cities'}</button>
            {CATS.map(([k, l]) => <button key={k} onClick={() => setCat(cat === k ? '' : k)} className={`chip shrink-0 py-2 ${cat === k ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>{l}</button>)}
          </div>
          {!data ? <p className="text-sm text-slate-500">Loading…</p> : items.length === 0
            ? <Empty emoji="🛍️" title="Nothing here yet" sub="Be the first to sell something to students nearby." action={<button className="btn-primary mt-2 px-5 py-3" onClick={() => setSell(true)}><Plus size={16} /> Sell an item</button>} />
            : <div className="grid grid-cols-2 gap-3 tab:grid-cols-3">{items.map((x) => (
              <button key={x.id} className="glass overflow-hidden rounded-3xl text-start" onClick={() => setView(x)}>
                <Photo url={x.photoUrls[0]} className="aspect-square w-full" />
                <div className="p-3"><p className="text-lg font-extrabold text-mint-300">{lira(x.price_minor)}</p><p className="truncate text-sm font-semibold">{x.title}</p>
                  <p className="truncate text-[11px] text-slate-400">@{x.seller_name}{x.city ? ` · ${cityName(x.city)}` : ''}</p></div>
              </button>))}</div>}
        </>}
        {tab === 'selling' && (data?.mine.length ? data.mine.map((x) => <MyListing key={x.id} x={x} onChange={done} />) : <Empty emoji="🏷️" title="You're not selling anything" sub="List an item in a minute. You get paid when the buyer confirms." />)}
        {tab === 'bought' && (data?.bought.length ? data.bought.map((x) => <Purchase key={x.id} x={x} onChange={done} />) : <Empty emoji="🛒" title="No purchases yet" sub="When you buy, your money is held safely until you confirm you got the item." />)}
      </div>
      {view && <ItemSheet item={view} feePct={data?.feePct ?? 0.02} onClose={() => setView(null)} onDone={done} />}
      {sell && <SellSheet onClose={() => setSell(false)} onDone={() => { done(); setTab('selling') }} feePct={data?.feePct ?? 0.02} />}
    </div>
  )
}

function ItemSheet({ item, feePct, onClose, onDone }: { item: Item; feePct: number; onClose: () => void; onDone: () => void }) {
  const { me } = useLive()
  const { data } = useApi<{ item: Item }>(`market-item?id=${item.id}`)
  const x = data?.item ?? item
  const [buy, setBuy] = useState(false)
  const bal = me?.balances.TRY ?? 0
  return (
    <Sheet open onClose={onClose} title={x.title}>
      {buy ? (
        <ReviewAndPin holdLabel={`Hold to pay ${lira(x.price_minor)}`} onClose={() => setBuy(false)}
          rows={[['Item', x.title], ['Seller', `@${x.seller_name}`], ['You pay (Lira wallet)', <b key="p">{lira(x.price_minor)}</b>]]}
          warning={<>Luda holds your money. Meet the seller, check the item, then tap <b>I received it</b>. If there's a problem, open a case and we'll decide. Never pay outside Luda.</>}
          run={async (auth) => { await api('POST', 'market-buy', { id: x.id, ...auth }); onDone() }}
          done={<Success title="Paid safely 🔒" sub={`Your ${lira(x.price_minor)} is held until you confirm you got it. Find it under Bought.`} onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <div className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5">{(x.photoUrls.length ? x.photoUrls : [null]).map((u, i) => <Photo key={i} url={u} className="aspect-square w-[85%] shrink-0 snap-center rounded-3xl" />)}</div>
          <div className="flex items-end justify-between"><p className="text-3xl font-extrabold text-mint-300">{lira(x.price_minor)}</p><span className="chip bg-fg/[0.06] text-slate-300">{catLabel(x.category)}</span></div>
          {x.description && <p className="whitespace-pre-line text-sm text-slate-300">{x.description}</p>}
          <p className="flex items-center gap-2 text-sm text-slate-400"><BadgeCheck size={16} className="text-mint-300" /> @{x.seller_name} · ID-verified seller{x.city ? ` · ${cityName(x.city)}` : ''} · {ago(x.created_at)}</p>
          <div className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3 text-xs text-mint-100"><ShieldCheck size={18} className="shrink-0" /> Buyer protection: the seller is only paid after you confirm you received the item.</div>
          {x.mine ? <p className="text-center text-sm text-slate-400">This is your listing.</p>
            : x.status !== 'active' ? <p className="text-center text-sm text-slate-400">This item is no longer available.</p>
              : <button className="btn-primary py-4" disabled={bal < x.price_minor} onClick={() => setBuy(true)}>{bal < x.price_minor ? `Need ${lira(x.price_minor)} in your Lira wallet` : `Buy for ${lira(x.price_minor)}`}</button>}
          <p className="text-center text-[11px] text-slate-500">Luda keeps {Math.round(feePct * 100)}% from the seller. Buyers pay no fee.</p>
        </div>
      )}
    </Sheet>
  )
}

function MyListing({ x, onChange }: { x: Item; onChange: () => void }) {
  const [err, setErr] = useState('')
  const act = async (route: string, q: string) => { if (!confirm(q)) return; try { await api('POST', route, { id: x.id }); onChange() } catch (e) { setErr(errMsg(e)) } }
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center gap-3"><Photo url={x.photoUrls[0]} className="size-16 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{x.title}</p><p className="font-extrabold text-mint-300">{lira(x.price_minor)}</p></div>
        {x.status === 'active' && <Pill tone="ok">On sale</Pill>}{x.status === 'reserved' && <Pill tone="wait">Paid · awaiting pickup</Pill>}{x.status === 'sold' && <Pill tone="ok">Sold · paid to you</Pill>}
      </div>
      {x.status === 'reserved' && <p className="text-xs text-slate-300">@{x.buyer_name} paid. Hand it over; you're paid when they confirm (or automatically after 7 days).</p>}
      <div className="flex gap-2">
        {x.status === 'active' && <button className="btn-ghost flex-1 py-2.5 text-sm" onClick={() => act('market-remove', 'Remove this listing?')}>Remove</button>}
        {x.status === 'reserved' && <button className="btn-ghost flex-1 py-2.5 text-sm" onClick={() => act('market-cancel', "Cancel this sale? The buyer gets their money back and the item goes back on sale.")}>Can't sell · refund buyer</button>}
      </div>
      {err && <p className="text-xs text-rose-300">{err}</p>}
    </div>
  )
}

function Purchase({ x, onChange }: { x: Item; onChange: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [help, setHelp] = useState(false)
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center gap-3"><Photo url={x.photoUrls[0]} className="size-16 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{x.title}</p><p className="text-xs text-slate-400">from @{x.seller_name} · {lira(x.price_minor)}</p></div>
        {x.status === 'reserved' ? <Pill tone="wait">Money held</Pill> : x.status === 'sold' ? <Pill tone="ok">Completed</Pill> : <Pill tone="back">Refunded</Pill>}
      </div>
      {x.status === 'reserved' && <div className="flex gap-2">
        <button className="btn-primary flex-1 py-3 text-sm" onClick={() => setConfirm(true)}>I received it</button>
        <button className="btn-ghost px-4 py-3 text-sm" onClick={() => setHelp(true)}><LifeBuoy size={15} /> Problem</button>
      </div>}
      {confirm && <Sheet open onClose={() => setConfirm(false)} title="Confirm you got it">
        <ReviewAndPin holdLabel="Hold to release payment" onClose={() => setConfirm(false)} rows={[['Item', x.title], ['Pay seller', `@${x.seller_name}`], ['Amount', lira(x.price_minor)]]}
          warning="Only confirm once you have the item and it's as described. This can't be undone."
          run={async (auth) => { await api('POST', 'market-received', { id: x.id, ...auth }); onChange() }}
          done={<Success title="Done! Seller paid 🎉" onClose={() => setConfirm(false)} />} />
      </Sheet>}
      {help && <CasesHub start="new" category="payment" reference={x.id} subject={`Problem with "${x.title}"`} onClose={() => setHelp(false)} />}
    </div>
  )
}

function SellSheet({ onClose, onDone, feePct }: { onClose: () => void; onDone: () => void; feePct: number }) {
  const { s } = useStore()
  const { me } = useLive()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('other')
  const [price, setPrice] = useState('')
  const [photos, setPhotos] = useState<Upload[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const p = toMinor(price)
  if (me?.profile.kyc !== 'verified') return <Sheet open onClose={onClose} title="Verify to sell"><p className="mb-3 text-sm text-slate-300">To keep buyers safe, sellers verify their ID once.</p><LiveKyc onDone={onClose} /></Sheet>
  const post = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'market-list', { title, description: desc, category: cat, city: s.city, priceMinor: p, photos: photos.map(({ name, type, data }) => ({ name, type, data })) }); setOk(true); onDone() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title="Sell an item">
      {ok ? <Success title="Listed! 🏷️" sub="Buyers can now pay you safely through Luda." onClose={onClose} /> : (
        <div className="flex flex-col gap-3 pb-4">
          <div><p className="mb-1 flex items-center gap-1 text-xs text-slate-400"><Camera size={13} /> Up to 3 photos</p><Attachments files={photos} setFiles={(f) => setPhotos(f.filter((x) => x.type !== 'application/pdf').slice(0, 3))} /></div>
          <input className="input" placeholder="What are you selling?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} />
          <textarea className="input min-h-24" placeholder="Condition, size, pickup place…" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={600} />
          <div className="flex flex-wrap gap-2">{CATS.map(([k, l]) => <button key={k} onClick={() => setCat(k)} className={`chip py-2 ${cat === k ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>{l}</button>)}</div>
          <label className="text-xs text-slate-400"><Tag size={12} className="inline" /> Price (₺)<input className="input mt-1 text-lg font-bold" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="e.g. 600" /></label>
          {p > 0 && <p className="text-xs text-slate-400">You'll receive <b className="text-mint-300">{lira(p - Math.round(p * feePct))}</b> after Luda's {Math.round(feePct * 100)}% fee.</p>}
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" disabled={busy || title.trim().length < 3 || p < 10_00} onClick={post}>{busy ? 'Posting…' : 'Post listing'}</button>
        </div>
      )}
    </Sheet>
  )
}
