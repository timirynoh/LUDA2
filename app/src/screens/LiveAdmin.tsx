// Owner's admin page (live mode). Only accounts the server marks as admin can load any of this.
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BadgeCheck, Banknote, Check, ChevronRight, Copy, ExternalLink, BookOpen, Gavel, GraduationCap, Home as HomeIcon, ScanLine,
  Inbox, LifeBuoy, Megaphone, Scale, Newspaper, UserCog, Receipt, RefreshCw, Search, ShieldCheck, Snowflake, Ticket, Undo2, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BILL_ICON, BILL_TINT } from '../components/LiveBillCard'
import { ReviewAndPin, errMsg, type Approval } from '../components/LiveMoney'
import { Attachments, CATEGORY_LABEL, STATUS_LABEL, Thread, type CaseCategory, type Upload } from '../components/LiveSupport'
import { Header, Sheet, Success } from '../components/ui'
import { KIND_LABEL, api, money, staffCan, type Cur, type StaffArea } from '../lib/live'
import { BannersTab, ContentTab, TeamTab } from '../components/AdminCommunity'
import { UniAdminTab } from '../components/LiveUni'
import { GuidesTab } from '../components/LiveGuides'
import { TicketCheck } from '../components/TicketCheck'
import { useLive } from '../lib/liveStore'

type Tab = 'overview' | 'bills' | 'cases' | 'disputes' | 'p2p' | 'users' | 'topups' | 'withdrawals' | 'content' | 'uni' | 'guides' | 'banners' | 'tickets' | 'team'
const TAB_AREA: Record<Tab, StaffArea> = { overview: 'overview', bills: 'bills', cases: 'cases', disputes: 'disputes', p2p: 'disputes', users: 'users', topups: 'money', withdrawals: 'money', content: 'content', uni: 'content', guides: 'content', banners: 'banners', tickets: 'tickets', team: 'team' }
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–')
const waited = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d` }
const short = (ref: string) => '…' + ref.slice(-8)
const lira = (minor: number) => money(Number(minor), 'TRY')
const BADGE: Record<string, string> = {
  paid: 'bg-mint-400/15 text-mint-300', verified: 'bg-mint-400/15 text-mint-300', valid: 'bg-mint-400/15 text-mint-300', released: 'bg-mint-400/15 text-mint-300',
  pending: 'bg-gold-400/15 text-gold-300', processing: 'bg-gold-400/15 text-gold-300', mismatch: 'bg-gold-400/15 text-gold-300', held: 'bg-gold-400/15 text-gold-300',
  failed: 'bg-rose-500/15 text-rose-300', appeal: 'bg-rose-500/15 text-rose-300', reversed: 'bg-rose-500/15 text-rose-300', refunded: 'bg-sky-400/15 text-sky-300', none: 'bg-fg/10 text-slate-400',
}
const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${BADGE[s] ?? 'bg-fg/10 text-slate-300'}`}>{s}</span>
const Avatar = ({ name }: { name?: string }) => <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-mint-400/30 to-emerald-700/40 text-sm font-bold text-mint-100">{(name ?? '?').replace('@', '').slice(0, 2).toUpperCase()}</span>

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try { setData(await api<T>('GET', path)) } catch (e) { setErr(errMsg(e)) } finally { setLoading(false) }
  }, [path])
  useEffect(() => { void load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect
  return { data, err, loading, load }
}

/** Copies text and briefly shows "Copied". */
function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${ok ? 'bg-mint-400/25 text-mint-100' : 'bg-fg/[0.07] text-slate-200'}`}
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }) }}>
      {ok ? <Check size={14} /> : <Copy size={14} />} {ok ? 'Copied' : label ?? 'Copy'}
    </button>
  )
}

export default function LiveAdmin() {
  const { me } = useLive()
  const [tab, setTab] = useState<Tab>('overview')
  const [userId, setUserId] = useState<string | null>(null)
  const { data: o, load } = useLoad<Record<string, any>>('admin-overview')
  if (me && !me.profile.isAdmin) return <div><Header back title="Admin" /><p className="px-6 pt-10 text-center text-sm text-slate-400">This page is only for the Luda team.</p></div>
  const st = me?.profile.staff ?? null
  const allow = (t: Tab) => staffCan(st, TAB_AREA[t])
  const tabs = ([
    { v: 'overview', l: 'Home', i: HomeIcon }, { v: 'bills', l: 'Bills', i: Receipt, n: o?.billsPending }, { v: 'cases', l: 'Cases', i: Inbox, n: o?.openCases },
    { v: 'p2p', l: 'P2P disputes', i: Scale }, { v: 'disputes', l: 'Held money', i: Gavel }, { v: 'users', l: 'Users', i: Users }, { v: 'topups', l: 'Top-ups', i: ArrowDownToLine }, { v: 'withdrawals', l: 'Payouts', i: ArrowUpFromLine },
    { v: 'content', l: 'Content', i: Newspaper }, { v: 'uni', l: 'Uni calendars', i: GraduationCap }, { v: 'guides', l: 'Guides & terms', i: BookOpen }, { v: 'tickets', l: 'Ticket check', i: ScanLine }, { v: 'banners', l: 'Banners', i: Megaphone }, { v: 'team', l: 'Team', i: UserCog },
  ] as { v: Tab; l: string; i: LucideIcon; n?: number }[]).filter((t) => allow(t.v))
  const go = (t: Tab) => { setTab(t); void load() }
  return (
    <div className="pb-10">
      <Header back title="Luda HQ" sub={`v${__VERSION__} · build ${__BUILD__}`} right={<button className="glass grid size-10 place-items-center rounded-2xl" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={17} /></button>} />
      <nav className="-mx-0 mb-4 flex gap-2 overflow-x-auto px-5 pb-1" aria-label="Admin sections">
        {tabs.map(({ v, l, i: I, n }) => (
          <button key={v} onClick={() => go(v)} className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition ${tab === v ? 'bg-mint-400 text-ink-950 shadow-lg shadow-emerald-500/20' : 'glass text-slate-300'}`}>
            <I size={15} /> {l}{n ? <span className={`rounded-full px-1.5 text-[10px] ${tab === v ? 'bg-ink-950/20' : 'bg-gold-400 text-ink-950'}`}>{n}</span> : null}
          </button>
        ))}
      </nav>
      <div className="px-5">
        {st && !st.owner && <p className="mb-3 rounded-2xl bg-sky-400/10 p-3 text-xs text-sky-200">You're signed in as Luda staff. You only see the areas the owner gave you{Object.entries(st.perms).filter(([a]) => a !== 'overview').map(([a, l]) => ` · ${a}: ${l === 'view' ? 'view only' : l === 'edit' ? 'can act' : 'full'}`).join('')}.</p>}
        {tab === 'overview' && <Overview o={o} go={(t) => allow(t) && go(t)} />}
        {tab === 'content' && <ContentTab staff={st} />}
        {tab === 'p2p' && <P2PDisputes canDecide={staffCan(st, 'disputes', 'full')} me={me?.profile.username ?? ''} />}
        {tab === 'banners' && <BannersTab staff={st} />}
        {tab === 'uni' && <UniAdminTab staff={st} />}
        {tab === 'guides' && <GuidesTab staff={st} />}
        {tab === 'tickets' && <TicketCheck />}
        {tab === 'team' && <TeamTab />}
        {tab === 'bills' && <BillsTab onChange={load} />}
        {tab === 'cases' && <CasesTab />}
        {tab === 'disputes' && <DisputesTab onChange={load} />}
        {tab === 'users' && <UsersTab onOpen={setUserId} />}
        {tab === 'topups' && <TopUps onOpen={setUserId} />}
        {tab === 'withdrawals' && <Payouts onOpen={setUserId} />}
      </div>
      {userId && <UserSheet id={userId} onClose={() => setUserId(null)} />}
    </div>
  )
}

/* --------------------------------- home --------------------------------- */

const Stat = ({ icon: I, label, value, sub, tint }: { icon: LucideIcon; label: string; value: ReactNode; sub?: string; tint: string }) => (
  <div className="glass flex flex-col gap-2 rounded-3xl p-4">
    <span className={`grid size-9 place-items-center rounded-xl bg-gradient-to-br ${tint} text-white`}><I size={17} /></span>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <p className="text-xl font-extrabold leading-none">{value}</p>
    {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
  </div>
)

function Overview({ o, go }: { o: Record<string, any> | null; go: (t: Tab) => void }) {
  if (!o) return <p className="text-sm text-slate-500">Loading…</p>
  const p = o.problems ?? {}
  type Todo = { n: number; text: string; tab: Tab; icon: LucideIcon }
  const todo = ([
    { n: o.billsPending ?? 0, text: `bill${o.billsPending === 1 ? '' : 's'} to pay · ${lira(o.billsPendingMinor ?? 0)}`, tab: 'bills', icon: Receipt },
    { n: o.openCases ?? 0, text: `support case${o.openCases === 1 ? '' : 's'} waiting for a reply`, tab: 'cases', icon: Inbox },
    { n: p.withdrawalsStuck ?? 0, text: 'payout(s) processing for over 30 min', tab: 'withdrawals', icon: ArrowUpFromLine },
    { n: p.mismatch ?? 0, text: "top-up(s) under review (amount didn't match)", tab: 'topups', icon: ArrowDownToLine },
  ] as Todo[]).filter((x) => x.n > 0)
  const warn = [p.badWebhooks7d && `${p.badWebhooks7d} rejected webhook(s) this week: check secret keys/hash`, p.ledgerMismatch && `${p.ledgerMismatch} wallet(s) don't match their ledger: contact your developer`].filter(Boolean) as string[]
  const wh = o.webhooks7d ?? {}
  const hour = new Date().getHours()
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500 via-teal-700 to-ink-900 p-5">
        <div className="absolute -end-10 -top-10 size-44 rounded-full bg-gold-300/20 blur-3xl" />
        <p className="text-sm text-white/80">Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}{o.admin ? `, ${o.admin}` : ''} 👋</p>
        <p className="mt-1 text-2xl font-extrabold text-white">{todo.length ? `${todo.reduce((a, t) => a + t.n, 0)} things need you` : 'All clear ✨'}</p>
        {o.balances && <div className="mt-3 grid grid-cols-2 gap-2 text-white">
          <div className="rounded-2xl bg-black/20 p-3"><p className="text-[11px] text-white/70">Users hold (Naira)</p><p className="text-lg font-extrabold">{money(o.balances?.NGN ?? 0, 'NGN')}</p></div>
          <div className="rounded-2xl bg-black/20 p-3"><p className="text-[11px] text-white/70">Users hold (Lira)</p><p className="text-lg font-extrabold">{money(o.balances?.TRY ?? 0, 'TRY')}</p></div>
        </div>}
      </div>

      {todo.length > 0 && <div className="flex flex-col gap-2">
        <p className="label">To do</p>
        {todo.map(({ n, text, tab, icon: I }) => (
          <button key={tab + text} onClick={() => go(tab)} className="glass flex items-center gap-3 rounded-2xl p-3 text-start">
            <span className="grid size-10 place-items-center rounded-xl bg-gold-400/15 text-gold-300"><I size={18} /></span>
            <span className="flex-1 text-sm"><b className="text-base">{n}</b> {text}</span><ChevronRight size={18} className="text-slate-500" />
          </button>
        ))}
      </div>}
      {(o.escrowHeld ?? 0) > 0 && <button onClick={() => go('disputes')} className="flex items-center gap-3 rounded-2xl bg-fg/[0.04] p-3 text-start text-xs text-slate-400">
        <Gavel size={16} className="shrink-0" /><span className="flex-1"><b className="text-slate-200">{lira(o.escrowHeldMinor ?? 0)}</b> held for {o.escrowHeld} marketplace / Flash payment{o.escrowHeld === 1 ? '' : 's'}. Nothing to do unless someone opens a case.</span><ChevronRight size={16} /></button>}
      {warn.map((w) => <p key={w} className="flex items-start gap-2 rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-200"><AlertTriangle size={15} className="shrink-0" /> {w}</p>)}

      <p className="label">This week</p>
      <div className="grid grid-cols-2 gap-2.5 tab:grid-cols-3">
        <Stat icon={Users} tint="from-sky-400 to-indigo-500" label="Users" value={o.users} sub={`+${o.newUsers7d} new · ${o.verified} verified`} />
        {o.balances && <>
        <Stat icon={ArrowDownToLine} tint="from-mint-400 to-emerald-600" label="Top-ups" value={o.deposits7d?.count ?? 0} sub={`${money(o.deposits7d?.NGN ?? 0, 'NGN')} · ${money(o.deposits7d?.TRY ?? 0, 'TRY')}`} />
        <Stat icon={ArrowUpFromLine} tint="from-violet-400 to-fuchsia-600" label="Payouts" value={o.withdrawals7d?.count ?? 0} sub={money(o.withdrawals7d?.NGN ?? 0, 'NGN')} />
        <Stat icon={Ticket} tint="from-amber-400 to-orange-600" label="Bus tickets" value={o.tickets7d ?? 0} />
        <Stat icon={Banknote} tint="from-gold-300 to-amber-500" label="Fees earned" value={money(o.fees7d?.withdrawNGN ?? 0, 'NGN')} sub="withdrawal fees" />
        <Stat icon={ShieldCheck} tint={Object.keys(wh).length ? 'from-mint-400 to-teal-600' : 'from-rose-400 to-rose-600'} label="Webhooks" value={Object.values(wh).reduce((a: number, b) => a + Number(b), 0)} sub={Object.keys(wh).length ? Object.entries(wh).map(([k, v]) => `${k} ${v}`).join(' · ') : 'none received yet'} />
        </>}
      </div>
    </div>
  )
}

/* ------------------------------- bills to pay ------------------------------- */

interface AdminBill { details?: Record<string, string>; eta_at?: string | null; id: string; username: string; type: string; provider: string; account_ref: string; amount_minor: number; fee_minor: number; status: string; note: string | null; created_at: string; photoUrls: (string | null)[]; receiptUrls: (string | null)[] }

function BillsTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('pending')
  const { data, err, load } = useLoad<{ bills: AdminBill[] }>(`admin-bills?status=${status}`)
  const [open, setOpen] = useState<AdminBill | null>(null)
  const bills = data?.bills ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">{[['pending', 'To pay'], ['paid', 'Paid'], ['refunded', 'Refunded']].map(([v, l]) => <button key={v} onClick={() => setStatus(v)} className={`chip py-2 ${status === v ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>{l}</button>)}</div>
      {status === 'pending' && bills.length > 0 && <p className="text-xs text-slate-400">Oldest first. Total to pay: <b className="text-slate-200">{lira(bills.reduce((a, b) => a + Number(b.amount_minor), 0))}</b></p>}
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {data && bills.length === 0 && <p className="rounded-3xl border border-dashed border-fg/10 py-10 text-center text-sm text-slate-400">{status === 'pending' ? 'No bills waiting 🎉' : 'Nothing here.'}</p>}
      {(status === 'pending' ? bills : [...bills].reverse()).map((b) => { const I = BILL_ICON[b.type] ?? Receipt; return (
        <button key={b.id} onClick={() => setOpen(b)} className="glass flex items-center gap-3 rounded-3xl p-4 text-start">
          <span className={`grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${BILL_TINT[b.type] ?? BILL_TINT.other} text-white`}><I size={22} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{b.provider}</p>
            <p className="truncate font-mono text-sm text-slate-300">{b.account_ref}</p>
            <p className="text-[11px] text-slate-500">@{b.username} · {status === 'pending' ? `waiting ${waited(b.created_at)}` : when(b.created_at)}</p>
          </div>
          <div className="flex flex-col items-end gap-1"><p className="text-xl font-extrabold">{lira(b.amount_minor)}</p>{status !== 'pending' && <Badge s={b.status} />}</div>
        </button>
      ) })}
      {open && <BillPaySheet b={open} onClose={() => setOpen(null)} onDone={() => { void load(); onChange() }} />}
    </div>
  )
}

const DETAIL_LABEL: Record<string, string> = { name: 'Name on the bill', district: 'District', meter: 'Meter type', period: 'Month', municipality: 'Municipality', address: 'Address', size: 'Cylinder', brand: 'Brand', kind: 'What to pay', package: 'Package', isp: 'Internet provider', landlord: 'Account holder', iban: 'IBAN', reference: 'Payment description' }
const REFUSE = ['Customer number not found', 'Amount on the bill is different', 'Provider site is down, try again later', 'Bill already paid']

/** Everything the team needs to pay one bill, already filled in: copy the number and amount, pay, attach the receipt. */
function BillPaySheet({ b, onClose, onDone }: { b: AdminBill; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<Upload[]>([])
  const [mode, setMode] = useState<'pay' | 'refuse'>('pay')
  const [note, setNote] = useState('')
  const [review, setReview] = useState(false)
  const amount = (Number(b.amount_minor) / 100).toFixed(2).replace(/\.00$/, '')
  const search = `https://www.google.com/search?q=${encodeURIComponent(`${b.provider} online ödeme`)}`
  const run = async (auth: Approval) => { await api('POST', 'admin-bill', { billId: b.id, paid: mode === 'pay', note, files: files.map(({ name, type, data }) => ({ name, type, data })), ...auth }); onDone() }
  if (b.status !== 'pending') return (
    <Sheet open onClose={onClose} title={b.provider}>
      <div className="flex flex-col gap-3 pb-4 text-sm"><p>{lira(b.amount_minor)} for @{b.username} · <Badge s={b.status} /></p>{b.note && <p className="text-slate-400">{b.note}</p>}
        {b.receiptUrls.filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer" className="btn-ghost py-3 text-sm"><Receipt size={15} /> Open receipt {i + 1}</a>)}</div>
    </Sheet>
  )
  return (
    <Sheet open onClose={onClose} title={`Pay ${b.provider}`}>
      {review ? (
        <ReviewAndPin holdLabel={mode === 'pay' ? 'Hold to mark as paid' : 'Hold to refund'} onClose={() => setReview(false)} run={run}
          rows={mode === 'pay' ? [['Bill', b.provider], ['Number', b.account_ref], ['Amount paid', <b key="a">{lira(b.amount_minor)}</b>], ['Receipt', `${files.length} file(s)`], ['For', `@${b.username}`]]
            : [['Refund to', `@${b.username}`], ['Amount + fee', lira(Number(b.amount_minor) + Number(b.fee_minor))], ['Reason (sent to user)', note]]}
          done={<Success title={mode === 'pay' ? 'Marked as paid ✅' : 'Refunded'} sub={mode === 'pay' ? `@${b.username} can now see the receipt.` : 'The full amount and fee are back in their wallet.'} onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-4 pb-4">
          <div className="rounded-3xl bg-gradient-to-br from-fg/[0.07] to-fg/[0.02] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pay exactly</p>
            <div className="mt-1 flex items-center justify-between gap-3"><p className="text-3xl font-extrabold">{lira(b.amount_minor)}</p><CopyBtn text={amount} label="Amount" /></div>
            <div className="my-3 h-px bg-fg/10" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Customer / subscriber number</p>
            <div className="mt-1 flex items-center justify-between gap-3"><p className="selectable break-all font-mono text-xl font-bold">{b.account_ref}</p><CopyBtn text={b.account_ref} label="Number" /></div>
            {Object.entries(b.details ?? {}).map(([k, v]) => <div key={k}><div className="my-3 h-px bg-fg/10" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{DETAIL_LABEL[k] ?? k}</p>
              <div className="mt-1 flex items-center justify-between gap-3"><p className="selectable break-all font-semibold">{v}</p><CopyBtn text={v} label={DETAIL_LABEL[k] ?? k} /></div></div>)}
            <p className="mt-3 text-xs text-slate-400">For @{b.username} · sent {when(b.created_at)} · fee earned {lira(b.fee_minor)}{b.eta_at ? <> · <b className={Date.parse(b.eta_at) < Date.now() ? 'text-rose-300' : 'text-gold-200'}>promised by {new Date(b.eta_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></> : null}</p>
            <p className="mt-1 text-[11px] text-mint-300">✓ The user confirmed these details are correct.</p>
          </div>
          {b.photoUrls.filter(Boolean).length > 0 && <div className="flex gap-2">{b.photoUrls.filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer"><img src={u!} alt="Bill" className="size-20 rounded-2xl object-cover ring-1 ring-fg/10" /></a>)}<p className="self-center text-xs text-slate-400">The user's photo of the bill. Tap to zoom.</p></div>}

          <div className="flex rounded-2xl bg-fg/[0.05] p-1">{(['pay', 'refuse'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${mode === m ? 'bg-fg/10 text-slate-100' : 'text-slate-400'}`}>{m === 'pay' ? '✅ I paid it' : "↩️ Can't pay"}</button>)}</div>
          {mode === 'pay' ? <>
            <ol className="flex flex-col gap-2 text-sm">
              <li className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint-400/20 text-xs font-bold text-mint-200">1</span><span className="flex-1">Pay on the official site or your bank app</span><a href={search} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-fg/[0.07] px-3 py-2 text-xs font-semibold"><ExternalLink size={13} /> Find site</a></li>
              <li className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint-400/20 text-xs font-bold text-mint-200">2</span><span className="flex-1">Screenshot or save the receipt, then attach it</span></li>
            </ol>
            <Attachments files={files} setFiles={setFiles} />
            <button className="btn-primary py-4" disabled={!files.length} onClick={() => setReview(true)}>Mark as paid</button>
          </> : <>
            <div className="flex flex-wrap gap-2">{REFUSE.map((r) => <button key={r} onClick={() => setNote(r)} className={`chip py-2 ${note === r ? 'bg-sky-400/20 text-sky-200' : 'bg-fg/[0.06] text-slate-300'}`}>{r}</button>)}</div>
            <input className="input text-sm" maxLength={200} placeholder="Or write the reason (sent to the user)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-ghost py-4" disabled={!note.trim()} onClick={() => setReview(true)}><Undo2 size={16} /> Refund {lira(Number(b.amount_minor) + Number(b.fee_minor))}</button>
          </>}
        </div>
      )}
    </Sheet>
  )
}

/* ------------------------- money held (marketplace / Flash) ------------------------- */

function DisputesTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('held')
  const { data, err, load } = useLoad<{ escrows: any[] }>(`admin-escrows?status=${status}`)
  const [open, setOpen] = useState<any | null>(null)
  const list = (data?.escrows ?? []).filter((e) => e.kind !== 'bill')
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-400">Money waiting for confirmation: Market buyers, Flash posters and P2P Naira payers. Market/Flash release automatically (7 / 3 days) unless there's an open case; P2P orders in 'appeal' need your decision. Decide here when someone reports a problem.</p>
      <div className="flex gap-2">{[['held', 'Held now'], ['released', 'Released'], ['refunded', 'Refunded']].map(([v, l]) => <button key={v} onClick={() => setStatus(v)} className={`chip py-2 ${status === v ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>{l}</button>)}</div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {data && list.length === 0 && <p className="rounded-3xl border border-dashed border-fg/10 py-10 text-center text-sm text-slate-400">Nothing here.</p>}
      {list.map((e) => (
        <button key={e.id} onClick={() => status === 'held' && setOpen(e)} className="glass flex items-center gap-3 rounded-3xl p-4 text-start">
          <span className="text-2xl">{e.kind === 'market' ? '🛍️' : e.kind === 'p2p' ? '🤝' : '⚡'}</span>
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{e.item?.title ?? e.kind}</p>
            <p className="truncate text-xs text-slate-400">@{e.payer_name} → {e.payee_name ? `@${e.payee_name}` : 'no helper yet'} · {waited(e.created_at)} ago</p></div>
          <div className="flex flex-col items-end gap-1"><p className="font-extrabold">{money(Number(e.amount_minor), e.currency)}</p><Badge s={e.item?.status === 'appeal' ? 'appeal' : e.status} /></div>
        </button>
      ))}
      {open && <DecideSheet e={open} onClose={() => setOpen(null)} onDone={() => { void load(); onChange() }} />}
    </div>
  )
}

function DecideSheet({ e, onClose, onDone }: { e: any; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState<'payee' | 'payer' | null>(null)
  const [note, setNote] = useState('')
  const who = e.kind === 'market' ? ['seller', 'buyer'] : e.kind === 'p2p' ? ['lira sender', 'Naira payer'] : ['helper', 'poster']
  const amt = (m: number) => money(m, e.currency)
  return (
    <Sheet open onClose={onClose} title={e.item?.title ?? 'Held payment'}>
      {to ? (
        <ReviewAndPin holdLabel="Hold to decide" onClose={() => setTo(null)}
          rows={[[to === 'payee' ? `Pay ${who[0]}` : `Refund ${who[1]}`, `@${to === 'payee' ? e.payee_name : e.payer_name}`], ['Amount', amt(to === 'payee' ? Number(e.amount_minor) - Number(e.fee_minor) : Number(e.amount_minor))], ['Reason', note]]}
          run={async (auth) => { await api('POST', 'admin-escrow', { escrowId: e.id, to, note, ...auth }); onDone() }}
          done={<Success title="Decided ✅" sub="Money moved and written to the audit log." onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-2xl bg-fg/[0.05] p-3"><p className="text-[11px] text-slate-400">Paid by ({who[1]})</p><p className="font-bold">@{e.payer_name}</p></div>
            <div className="rounded-2xl bg-fg/[0.05] p-3"><p className="text-[11px] text-slate-400">{who[0]}</p><p className="font-bold">{e.payee_name ? `@${e.payee_name}` : '–'}</p></div>
          </div>
          <p className="text-center text-3xl font-extrabold">{amt(Number(e.amount_minor))}</p>
          {e.item?.type === 'p2p' ? <P2PEvidence id={e.item.id} /> : <p className="flex items-start gap-2 text-xs text-slate-400"><LifeBuoy size={14} className="shrink-0" /> Check the user's case in the Cases tab (photos, messages) before deciding.</p>}
          <input className="input text-sm" maxLength={200} placeholder="Reason (saved, and sent if you link a case)" value={note} onChange={(ev) => setNote(ev.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary py-3 text-sm" disabled={!note.trim() || !e.payee} onClick={() => setTo('payee')}><BadgeCheck size={15} /> Pay {who[0]}</button>
            <button className="btn-ghost py-3 text-sm" disabled={!note.trim()} onClick={() => setTo('payer')}><Undo2 size={15} /> Refund {who[1]}</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** P2P disputes (Bybit-style): appeals queue, take a case, message both sides, decide. Everything is on the server. */
function P2PDisputes({ canDecide, me }: { canDecide: boolean; me: string }) {
  const [status, setStatus] = useState('appeal')
  const { data, err, load } = useLoad<{ orders: any[] }>(`admin-p2p?status=${status}`)
  const [open, setOpen] = useState<string | null>(null)
  const stageL: Record<string, string> = { negotiation: '1 · Talking it out', review: '2 · Needs Luda', decided: '3 · Decided' }
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-400">Appeals start with 30 minutes for the two people to sort it out, then come to you. Orders not released within 1 hour come here automatically. Take a case so others know you're on it.</p>
      <div className="flex gap-2">{[['appeal', 'Appeals'], ['sent', 'Waiting release'], ['all', 'All']].map(([v, l]) => <button key={v} onClick={() => setStatus(v)} className={`chip py-2 ${status === v ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>{l}</button>)}</div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {data && data.orders.length === 0 && <p className="rounded-3xl border border-dashed border-fg/10 py-10 text-center text-sm text-slate-400">Nothing here. 🎉</p>}
      {data?.orders.map((o) => (
        <button key={o.id} onClick={() => setOpen(o.id)} className="glass flex items-center gap-3 rounded-3xl p-4 text-start">
          <span className="text-2xl">⚖️</span>
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{o.asset ?? 'TRY'} {(o.amount_try / 100).toLocaleString('en-US')} for {money(o.amount_ngn, 'NGN')}</p>
            <p className="truncate text-xs text-slate-400">@{o.payer?.username} pays ₦ · @{o.sender?.username} sends · {o.appeal_stage ? stageL[o.appeal_stage] : o.status}{o.assigned_to ? ` · 👤 ${o.assigned_to}` : ''}</p></div>
          <ChevronRight size={18} className="text-slate-500" />
        </button>
      ))}
      {open && <P2PCaseSheet id={open} canDecide={canDecide} me={me} onClose={() => { setOpen(null); void load() }} />}
    </div>
  )
}

function P2PCaseSheet({ id, canDecide, me, onClose }: { id: string; canDecide: boolean; me: string; onClose: () => void }) {
  const { data, load } = useLoad<{ order: any }>(`admin-p2p?id=${id}`)
  const [msg, setMsg] = useState('')
  const [to, setTo] = useState<'sender' | 'payer' | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [who, setWho] = useState<'' | 'both' | 'payer' | 'sender'>('both')
  const [mins, setMins] = useState<number>(60)
  const o = data?.order
  const act = async (route: string, body: Record<string, unknown>) => { setErr(''); try { await api('POST', route, { id, ...body }); setMsg(''); void load() } catch (e) { setErr(errMsg(e)) } }
  return (
    <Sheet open onClose={onClose} title="P2P dispute">
      {!o ? <p className="pb-4 text-sm text-slate-500">Loading…</p> : to ? (
        <ReviewAndPin holdLabel="Hold to decide" onClose={() => setTo(null)}
          rows={[[to === 'sender' ? 'Release Naira to sender' : 'Refund the payer', `@${to === 'sender' ? o.sender?.username : o.payer?.username}`], ['Amount', money(to === 'sender' ? o.amount_ngn - o.fee_ngn : o.amount_ngn, 'NGN')], ['Reason (both see it)', note]]}
          run={async (auth) => { await api('POST', 'admin-p2p-decide', { id, to, note, ...auth }) }}
          done={<Success title="Decided ✅" sub="Money moved, both people see your reason, and it's in the audit log." onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <P2PEvidence id={id} />
          <p className="text-xs text-slate-400">Stage: <b className="text-slate-200">{o.appeal_stage ?? o.status}</b>{o.assigned_to ? ` · handled by ${o.assigned_to}` : ' · nobody has taken it yet'}{o.appeal_reason ? ` · reason: ${o.appeal_reason}` : ''}</p>
          {o.assigned_to !== me && !['done', 'cancelled'].includes(o.status) && <button className="btn-ghost py-3 text-sm" onClick={() => void act('admin-p2p-claim', {})}>👤 Take this case</button>}
          {o.ask_due && !['done', 'cancelled'].includes(o.status) && <AskStatus o={o} />}
          {!['done', 'cancelled'].includes(o.status) && <div className="flex flex-col gap-2 rounded-2xl bg-fg/[0.04] p-3">
            <textarea className="input min-h-20 text-sm" maxLength={800} placeholder="Message both people (e.g. please upload today's bank statement)" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <button className="chip self-start bg-sky-400/15 py-1.5 text-xs text-sky-200" onClick={() => { setMsg('Please record a proof video of your bank app (not a screenshot), following these steps, and add it here. You can choose "Luda team only" if you don\'t want the other person to see your statement. [guide:p2p-proof]'); setWho('both') }}>📹 Fill in: ask for a proof video (with the guide)</button>
            <p className="text-[11px] text-slate-400">Needs a reply from</p>
            <div className="flex flex-wrap gap-1.5">{([['', 'No reply needed'], ['both', 'Both'], ['payer', `@${o.payer?.username} (Naira)`], ['sender', `@${o.sender?.username} (lira)`]] as const).map(([v, l]) => <button key={v} onClick={() => setWho(v)} className={`chip py-1.5 ${who === v ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{l}</button>)}</div>
            {who && <><p className="text-[11px] text-slate-400">Within</p><div className="flex flex-wrap gap-1.5">{([[15, '15 min'], [30, '30 min'], [60, '1 hour'], [180, '3 hours'], [1440, '24 hours']] as const).map(([v, l]) => <button key={v} onClick={() => setMins(v)} className={`chip py-1.5 ${mins === v ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{l}</button>)}</div></>}
            <button className="btn-primary py-2.5 text-sm" disabled={!msg.trim()} onClick={() => void act('admin-p2p-msg', { body: msg, ...(who ? { ask: { who, minutes: mins } } : {}) })}>{who ? 'Send with a reply deadline' : 'Send'}</button>
          </div>}
          {err && <p className="text-sm text-rose-300">{err}</p>}
          {canDecide && !['done', 'cancelled'].includes(o.status) && <>
            <input className="input text-sm" maxLength={300} placeholder="Decision reason (both people see it)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-primary py-3 text-sm" disabled={!note.trim()} onClick={() => setTo('sender')}><BadgeCheck size={15} /> Money was sent: release</button>
              <button className="btn-ghost py-3 text-sm" disabled={!note.trim()} onClick={() => setTo('payer')}><Undo2 size={15} /> Not sent: refund</button>
            </div></>}
          {!canDecide && <p className="text-[11px] text-slate-500">Your role can take cases and message. Decisions need 'full' on Held money (ask the owner).</p>}
        </div>
      )}
    </Sheet>
  )
}

/** Who the team is waiting on, and the time left (the order chat gets a warning automatically when it runs out). */
function AskStatus({ o }: { o: any }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const left = Date.parse(o.ask_due) - now, mm = Math.floor(Math.abs(left) / 60000), ss = Math.floor((Math.abs(left) % 60000) / 1000)
  const row = (who: string, asked: boolean, at: string | null) => asked && <p key={who} className={at ? 'text-mint-300' : left < 0 ? 'font-semibold text-rose-300' : 'text-slate-300'}>{at ? `✓ @${who} replied ${when(at)}` : left < 0 ? `⚠️ @${who} didn't reply in time` : `⏳ waiting for @${who}`}</p>
  return (
    <div className={`rounded-2xl border p-3 text-xs ${left < 0 ? 'border-rose-400/40 bg-rose-500/10' : 'border-gold-400/40 bg-gold-400/10'}`}>
      <p className="font-bold">{left < 0 ? `Reply time ran out ${mm} min ago` : `Reply deadline: ${mm}:${String(ss).padStart(2, '0')} left`}</p>
      {row(o.payer?.username, o.ask_who === 'payer' || o.ask_who === 'both', o.ask_payer_at)}
      {row(o.sender?.username, o.ask_who === 'sender' || o.ask_who === 'both', o.ask_sender_at)}
    </div>
  )
}

/** P2P appeal evidence: where the money had to go, receipts and the order chat. */
function P2PEvidence({ id }: { id: string }) {
  const { data } = useLoad<{ order: any }>(`admin-p2p?id=${id}`)
  const o = data?.order
  if (!o) return <p className="text-xs text-slate-500">Loading the order…</p>
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-fg/[0.04] p-3 text-xs">
      <p><b>{o.asset ?? 'TRY'} {(o.amount_try / 100).toLocaleString('en-US')}</b> for <b>{money(o.amount_ngn, 'NGN')}</b> at ₦{Number(o.price).toFixed(2)} · {o.method === 'cash' ? `cash${o.try_to?.area ? ` in ${o.try_to.area}` : ''}` : `to ${o.try_to?.bank} ${o.try_to?.iban} (${o.try_to?.holder})`}</p>
      <p className="text-slate-400">Status: {o.status}{o.sent_at ? ` · marked sent ${when(o.sent_at)}` : ''}</p>
      {o.receiptUrls?.filter(Boolean).length > 0 && <div className="flex gap-2">{o.receiptUrls.filter(Boolean).map((u: string, i: number) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Receipt" className="size-16 rounded-xl object-cover ring-1 ring-fg/10" /></a>)}</div>}
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">{(o.messages ?? []).map((m: any) => <p key={m.id} className="selectable"><b className={m.kind === 'staff' ? 'text-violet-300' : 'text-slate-300'}>{m.kind === 'staff' ? m.by : m.by ? `@${m.by}` : 'Luda'}:</b>{m.private ? ' 🔒(team only)' : ''} {m.body}{m.files?.filter(Boolean).map((u: string, i: number) => <a key={i} href={u} target="_blank" rel="noreferrer" className="ms-1 text-mint-300 underline">{/\.(mp4|webm|mov|3gp)(\?|$)/i.test(u) ? '▶ video' : 'photo'}</a>)}</p>)}</div>
    </div>
  )
}

/* --------------------------------- lists --------------------------------- */

function UsersTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => { const t = setTimeout(() => setTerm(q), 350); return () => clearTimeout(t) }, [q])
  const { data, err } = useLoad<{ users: any[] }>(`admin-users?q=${encodeURIComponent(term)}`)
  return (
    <div className="flex flex-col gap-2">
      <div className="relative"><Search size={16} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" /><input className="input ps-11" placeholder="Name, username, email or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {data?.users.length === 0 && <p className="text-sm text-slate-500">No users found.</p>}
      {data?.users.map((u) => (
        <button key={u.userId} onClick={() => onOpen(u.userId)} className="glass flex items-center gap-3 rounded-2xl p-3 text-start">
          <Avatar name={u.fullName} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{u.fullName} <span className="text-xs text-slate-500">@{u.username}</span></p><p className="truncate text-xs text-slate-500">{u.email} · joined {when(u.createdAt)}</p></div>
          <div className="flex flex-col items-end gap-1"><Badge s={u.kyc} />{u.frozen && <span className="text-[10px] text-sky-300">🧊 frozen</span>}</div>
        </button>
      ))}
    </div>
  )
}

const Filter = ({ value, set, options }: { value: string; set: (v: string) => void; options: [string, string][] }) => (
  <div className="-mx-5 flex gap-2 overflow-x-auto px-5">{options.map(([v, l]) => <button key={v} onClick={() => set(v)} className={`chip shrink-0 py-2 ${value === v ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>{l}</button>)}</div>
)

function TopUps({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const { data, err, load } = useLoad<{ deposits: any[] }>(`admin-deposits?status=${status}&q=${encodeURIComponent(q)}`)
  const [msg, setMsg] = useState('')
  const recheck = async (ref: string) => { setMsg(''); try { const r = await api('POST', 'admin-recheck', { reference: ref }); setMsg(`${short(ref)} → ${r.status}`); void load() } catch (e) { setMsg(errMsg(e)) } }
  return (
    <div className="flex flex-col gap-2">
      <Filter value={status} set={setStatus} options={[['', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['mismatch', 'Review'], ['failed', 'Failed']]} />
      <input className="input py-2.5 text-sm" placeholder="Search reference or email" value={q} onChange={(e) => setQ(e.target.value.trim())} />
      {msg && <p className="text-xs text-slate-300">{msg}</p>}{err && <p className="text-sm text-rose-300">{err}</p>}
      {data?.deposits.map((d) => (
        <div key={d.reference} className="glass rounded-2xl p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><p className="font-bold">{money(Number(d.credit_minor), d.credit_currency ?? 'NGN')}</p><Badge s={d.status} /></div>
          <p className="mt-0.5 text-xs text-slate-400">{d.provider} · charged {money(Number(d.amount_minor), d.currency)} · {when(d.created_at)}</p>
          <p className="selectable font-mono text-[11px] text-slate-500">{d.reference}</p>
          <div className="mt-2 flex gap-2">
            {d.status !== 'paid' && <button className="chip bg-fg/5 py-1.5 text-xs" onClick={() => recheck(d.reference)}><RefreshCw size={12} /> Re-check with {d.provider}</button>}
            {d.user_id && <button className="chip bg-fg/5 py-1.5 text-xs" onClick={() => onOpen(d.user_id)}>Open user</button>}
          </div>
        </div>
      ))}
      {data?.deposits.length === 0 && <p className="text-sm text-slate-500">Nothing here.</p>}
    </div>
  )
}

function Payouts({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState('')
  const { data, err, load } = useLoad<{ withdrawals: any[] }>(`admin-withdrawals?status=${status}`)
  const [msg, setMsg] = useState('')
  const recheck = async (ref: string) => { setMsg(''); try { const r = await api('POST', 'admin-recheck', { reference: ref }); setMsg(`${short(ref)} → ${r.status}`); void load() } catch (e) { setMsg(errMsg(e)) } }
  return (
    <div className="flex flex-col gap-2">
      <Filter value={status} set={setStatus} options={[['', 'All'], ['processing', 'Processing'], ['paid', 'Paid'], ['failed', 'Failed'], ['reversed', 'Reversed']]} />
      {msg && <p className="text-xs text-slate-300">{msg}</p>}{err && <p className="text-sm text-rose-300">{err}</p>}
      {data?.withdrawals.map((w) => (
        <div key={w.reference} className="glass rounded-2xl p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><p className="font-bold">{money(Number(w.amount_minor), 'NGN')} <span className="text-xs font-normal text-slate-500">+ {money(Number(w.fee_minor), 'NGN')} fee</span></p><Badge s={w.status} /></div>
          <p className="mt-0.5 text-xs text-slate-400">{w.account_name} · {w.bank_name} ••{String(w.account_number).slice(-4)} · {when(w.created_at)}{w.provider ? ` · via ${w.provider === 'flutterwave' ? 'Flutterwave' : 'Paystack'}` : ''}</p>
          {w.note && <p className="text-xs text-slate-500">{w.note}</p>}
          <div className="mt-2 flex gap-2">
            {w.status === 'processing' && <button className="chip bg-fg/5 py-1.5 text-xs" onClick={() => recheck(w.reference)}><RefreshCw size={12} /> Re-check</button>}
            <button className="chip bg-fg/5 py-1.5 text-xs" onClick={() => onOpen(w.user_id)}>Open user</button>
          </div>
        </div>
      ))}
      {data?.withdrawals.length === 0 && <p className="text-sm text-slate-500">Nothing here.</p>}
    </div>
  )
}

/* --------------------------------- one user --------------------------------- */

type Act = { action: string; title: string; rows: [string, ReactNode][]; extra?: Record<string, unknown>; danger?: string }

function UserSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, err, load } = useLoad<any>(`admin-user?id=${id}`)
  const [act, setAct] = useState<Act | null>(null)
  const [reason, setReason] = useState('')
  const [adj, setAdj] = useState({ cur: 'NGN' as Cur, amount: '', sign: 1 })
  const [legal, setLegal] = useState('')
  const u = data?.user
  const run = async (auth: Approval) => { await api('POST', 'admin-action', { action: act!.action, userId: id, reason, ...act!.extra, ...auth }); await load() }
  return (
    <Sheet open onClose={onClose} title={u ? u.fullName : 'User'}>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {!u ? <p className="text-sm text-slate-500">Loading…</p> : act ? (
        <ReviewAndPin rows={act.rows} warning={act.danger} holdLabel="Hold to confirm" onClose={() => setAct(null)} run={run}
          done={<Success title="Done ✅" sub="Saved and written to the audit log." onClose={() => { setAct(null); setReason('') }} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <div className="flex items-center gap-3"><Avatar name={u.fullName} /><div className="min-w-0"><p className="font-bold">@{u.username}</p><p className="truncate text-xs text-slate-400">{u.email}</p></div><div className="ms-auto"><Badge s={u.kyc} /></div></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-fg/[0.05] p-3"><p className="text-[11px] text-slate-400"><Wallet size={11} className="inline" /> Naira</p><p className="text-lg font-extrabold">{money(data.balances.NGN ?? 0, 'NGN')}</p></div>
            <div className="rounded-2xl bg-fg/[0.05] p-3"><p className="text-[11px] text-slate-400"><Wallet size={11} className="inline" /> Lira</p><p className="text-lg font-extrabold">{money(data.balances.TRY ?? 0, 'TRY')}</p></div>
          </div>
          <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
            {([['Phone', u.phone ? `${u.phone}${u.phoneVerified ? ' ✓' : ''}` : '–'], ['ID check', `${u.kyc}${u.kycName ? ` · ${u.kycName}` : ''}${u.kycType ? ` (${u.kycType}${u.kycCountry ? `, ${u.kycCountry}` : ''}${u.kycLast4 ? ` ••${u.kycLast4}` : ''})` : ''}`],
              ['Status', u.frozen ? `🧊 Frozen by ${u.frozenBy}` : 'Active'], ['Joined', when(u.createdAt)]] as [string, string][])
              .map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-4 py-2"><span className="shrink-0 text-slate-400">{k}</span><span className="selectable break-all text-end">{v}</span></div>)}
          </div>
          <input className="input text-sm" maxLength={140} placeholder="Reason (saved in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            {u.frozen
              ? <button className="btn-ghost text-sm" onClick={() => setAct({ action: 'unfreeze', title: 'Unfreeze', rows: [['Unfreeze', u.fullName], ['Reason', reason || '–']] })}>Unfreeze</button>
              : <button className="btn-ghost text-sm text-sky-300" onClick={() => setAct({ action: 'freeze', title: 'Freeze', rows: [['Freeze', u.fullName], ['Reason', reason || '–']], danger: 'No money can leave this account until you unfreeze it.' })}><Snowflake size={14} /> Freeze</button>}
            <button className="btn-ghost text-sm" onClick={() => setAct({ action: 'kyc-reset', title: 'Reset ID check', rows: [['Reset ID check for', u.fullName]], danger: 'They will need to verify again before withdrawing or sending.' })}>Reset ID check</button>
          </div>
          {u.kyc !== 'verified' && (
            <div className="flex gap-2"><input className="input py-2 text-sm" placeholder="Legal name as on ID" value={legal} onChange={(e) => setLegal(e.target.value)} />
              <button className="btn-ghost shrink-0 text-sm" disabled={!legal || !reason} onClick={() => setAct({ action: 'kyc-approve', title: 'Approve ID', extra: { legalName: legal }, rows: [['Approve ID of', u.fullName], ['Legal name', legal.toUpperCase()], ['Reason', reason]], danger: 'Only approve after you have checked a real ID yourself (e.g. video call).' })}>Approve</button></div>
          )}
          <div className="rounded-2xl bg-fg/[0.04] p-3">
            <p className="label">Correct balance</p>
            <div className="mt-2 flex gap-2">
              <select className="input w-auto py-2 text-sm" value={adj.sign} onChange={(e) => setAdj({ ...adj, sign: +e.target.value })} aria-label="Direction"><option value={1}>Add</option><option value={-1}>Remove</option></select>
              <select className="input w-auto py-2 text-sm" value={adj.cur} onChange={(e) => setAdj({ ...adj, cur: e.target.value as Cur })} aria-label="Wallet"><option>NGN</option><option>TRY</option></select>
              <input className="input py-2 text-sm" inputMode="decimal" placeholder="Amount" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value.replace(/[^\d.]/g, '') })} />
            </div>
            <button className="btn-ghost mt-2 w-full text-sm" disabled={!Number(adj.amount) || !reason} onClick={() => {
              const minor = Math.round(Number(adj.amount) * 100) * adj.sign
              setAct({ action: 'adjust', title: 'Correct balance', extra: { currency: adj.cur, amountMinor: minor }, rows: [['User', u.fullName], ['Change', money(minor, adj.cur, { sign: true })], ['Reason', reason]], danger: 'This changes real money in their wallet. Use it only to fix a confirmed error (e.g. a refund done outside Luda).' })
            }}>Review correction</button>
            {!reason && <p className="mt-1 text-[11px] text-slate-500">A reason is required.</p>}
          </div>
          <p className="label">Tickets</p>
          {data.tickets.length === 0 && <p className="text-xs text-slate-500">None</p>}
          {data.tickets.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-fg/[0.04] p-2 text-xs">
              <span>{t.item?.label ?? 'Ticket'} · {t.code} · {money(Number(t.paid_minor), t.paid_currency)}</span>
              {t.status === 'valid' ? <button className="chip bg-fg/5 py-1 text-[11px]" onClick={() => setAct({ action: 'ticket-refund', title: 'Refund ticket', extra: { ticketId: t.id }, rows: [['Ticket', `${t.item?.label ?? ''} · ${t.code}`], ['Refund to wallet', money(Number(t.paid_minor), t.paid_currency)]] })}>Refund</button> : <Badge s={t.status} />}
            </div>
          ))}
          <p className="label">Recent activity</p>
          {data.history.slice(0, 20).map((h: any) => (
            <div key={h.id} className="flex justify-between gap-2 text-xs"><span className="text-slate-400">{KIND_LABEL[h.kind] ?? h.kind} · {when(h.at)}</span><span className={h.amount_minor > 0 ? 'text-mint-300' : ''}>{money(Number(h.amount_minor), h.currency, { sign: true })}</span></div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

/* ------------------------------- support cases ------------------------------- */

function CasesTab() {
  const [status, setStatus] = useState('open,waiting_user')
  const { data, err, load } = useLoad<{ cases: any[] }>(`admin-cases?status=${status}`)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <Filter value={status} set={setStatus} options={[['open,waiting_user', 'Open'], ['open', 'Needs reply'], ['waiting_user', 'Waiting for user'], ['resolved', 'Resolved'], ['rejected', 'Closed'], ['all', 'All']]} />
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {data?.cases.length === 0 && <p className="rounded-3xl border border-dashed border-fg/10 py-10 text-center text-sm text-slate-400">No cases here 🎉</p>}
      {data?.cases.map((c) => (
        <button key={c.id} onClick={() => setOpen(c.id)} className="glass flex items-start gap-3 rounded-2xl p-3 text-start">
          <Avatar name={c.user?.full_name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{c.subject}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_LABEL[c.status]?.c}`}>{c.status === 'open' ? 'Needs reply' : STATUS_LABEL[c.status]?.t}</span></div>
            <p className="text-xs text-slate-400">{CATEGORY_LABEL[c.category as CaseCategory]} · @{c.user?.username} · ID: {c.user?.kyc_status}</p>
            {c.last && <p className="truncate text-xs text-slate-500">{c.last.author === 'admin' ? 'You' : 'User'}: {c.last.body}{c.last.files ? ` · 📎${c.last.files}` : ''} · {when(c.last.at)}</p>}
          </div>
        </button>
      ))}
      {open && <AdminCaseSheet id={open} onClose={() => { setOpen(null); void load() }} />}
    </div>
  )
}

function AdminCaseSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, err, load } = useLoad<any>(`admin-case?id=${id}`)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [act, setAct] = useState<Act | null>(null)
  const [kyc, setKyc] = useState({ legal: '', docType: 'Passport', docNumber: '', country: '', dob: '', reason: '' })
  const c = data?.case, u = data?.user
  const send = async (status?: string) => {
    setBusy(true); setMsg('')
    try { await api('POST', 'admin-case-reply', { caseId: id, message: reply, status }); setReply(''); await load(); setMsg(status ? `Marked ${status.replace('_', ' ')}` : 'Reply sent') } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }
  const run = async (auth: Approval) => { await api('POST', 'admin-action', { action: act!.action, userId: u.userId, caseId: id, ...act!.extra, ...auth }); await load() }
  return (
    <Sheet open onClose={onClose} title={c?.subject ?? 'Case'}>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {!c ? <p className="text-sm text-slate-500">Loading…</p> : act ? (
        <ReviewAndPin rows={act.rows} warning={act.danger} holdLabel="Hold to confirm" onClose={() => setAct(null)} run={run}
          done={<Success title="Done ✅" sub="The user was told in this case. Saved in the audit log." onClose={() => setAct(null)} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <div className="flex items-center gap-3 rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-300">
            <Avatar name={u?.fullName} />
            <div className="min-w-0"><p className="text-sm"><b>{u?.fullName}</b> @{u?.username}</p>
              <p>ID: <b>{u?.kyc}</b>{u?.kycName ? ` · ${u.kycName}` : ''} · {u?.frozen ? '🧊 frozen' : 'active'} · {CATEGORY_LABEL[c.category as CaseCategory]}</p>
              {c.reference && <p>Reference: <span className="selectable font-mono">{c.reference}</span></p>}</div>
          </div>
          <Thread messages={data.messages} />
          <textarea className="input min-h-20" maxLength={2000} placeholder="Reply to the user…" value={reply} onChange={(e) => setReply(e.target.value)} />
          {msg && <p className="text-xs text-slate-300">{msg}</p>}
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-primary py-2.5 text-sm" disabled={busy || !reply.trim()} onClick={() => send()}>Reply</button>
            <button className="btn-ghost py-2.5 text-sm" disabled={busy} onClick={() => send('resolved')}>Resolve</button>
            <button className="btn-ghost py-2.5 text-sm" disabled={busy} onClick={() => send('rejected')}>Close</button>
          </div>
          {u && u.kyc !== 'verified' && (
            <div className="flex flex-col gap-2 rounded-2xl border border-mint-400/30 bg-mint-400/[0.06] p-3">
              <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={16} className="text-mint-300" /> Verify ID manually</p>
              <p className="text-[11px] text-slate-400">Check the photos above (document readable, not expired, selfie matches). For extra safety, do a short video call. Then copy the details from the document.</p>
              <input className="input py-2 text-sm" placeholder="Legal name exactly as on the document" value={kyc.legal} onChange={(e) => setKyc({ ...kyc, legal: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="input py-2 text-sm" value={kyc.docType} onChange={(e) => setKyc({ ...kyc, docType: e.target.value })} aria-label="Document type">{['Passport', 'National ID', 'Residence permit', "Driver's licence"].map((x) => <option key={x}>{x}</option>)}</select>
                <input className="input py-2 text-sm" placeholder="Document number" value={kyc.docNumber} onChange={(e) => setKyc({ ...kyc, docNumber: e.target.value })} />
                <input className="input py-2 text-sm" placeholder="Country (e.g. NGA)" maxLength={40} value={kyc.country} onChange={(e) => setKyc({ ...kyc, country: e.target.value })} />
                <input className="input py-2 text-sm" type="date" aria-label="Date of birth" value={kyc.dob} onChange={(e) => setKyc({ ...kyc, dob: e.target.value })} />
              </div>
              <input className="input py-2 text-sm" maxLength={140} placeholder="How you checked (saved in the audit log)" value={kyc.reason} onChange={(e) => setKyc({ ...kyc, reason: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-primary py-2.5 text-sm" disabled={!kyc.legal.trim().includes(' ') || !kyc.docNumber || !kyc.reason} onClick={() => setAct({ action: 'kyc-approve', title: 'Approve ID',
                  extra: { legalName: kyc.legal, docType: kyc.docType, docNumber: kyc.docNumber, country: kyc.country, dob: kyc.dob, reason: kyc.reason },
                  rows: [['Approve', `${u.fullName} (@${u.username})`], ['Legal name', kyc.legal.toUpperCase()], ['Document', `${kyc.docType} ••${kyc.docNumber.slice(-4)} ${kyc.country}`], ['Checked by', kyc.reason]],
                  danger: 'This unlocks withdrawals and sending for this person. Only approve a real, readable document that matches the selfie.' })}>Approve ID</button>
                <button className="btn-ghost py-2.5 text-sm text-rose-300" disabled={!kyc.reason} onClick={() => setAct({ action: 'kyc-reject', title: 'Reject ID', extra: { reason: kyc.reason },
                  rows: [['Reject ID of', u.fullName], ['Reason sent to user', kyc.reason]] })}>Reject</button>
              </div>
              {!kyc.reason && <p className="text-[11px] text-slate-500">To reject, write the reason above (it's sent to the user).</p>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
