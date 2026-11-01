// Owner's admin page (live mode). Only accounts the server marks as admin can load any of this.
import { AlertTriangle, RefreshCw, Search, ShieldCheck, Snowflake, Users } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ReviewAndPin, errMsg, type Approval } from '../components/LiveMoney'
import { Header, Segmented, Sheet, Success } from '../components/ui'
import { KIND_LABEL, api, money, type Cur } from '../lib/live'
import { CATEGORY_LABEL, STATUS_LABEL, Thread, type CaseCategory } from '../components/LiveSupport'
import { useLive } from '../lib/liveStore'

type Tab = 'overview' | 'cases' | 'users' | 'topups' | 'withdrawals'
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–')
const short = (ref: string) => '…' + ref.slice(-8)
const BADGE: Record<string, string> = {
  paid: 'bg-mint-400/15 text-mint-300', verified: 'bg-mint-400/15 text-mint-300', valid: 'bg-mint-400/15 text-mint-300',
  pending: 'bg-gold-400/15 text-gold-300', processing: 'bg-gold-400/15 text-gold-300', mismatch: 'bg-gold-400/15 text-gold-300',
  failed: 'bg-rose-500/15 text-rose-300', reversed: 'bg-rose-500/15 text-rose-300', refunded: 'bg-fg/10 text-slate-400', none: 'bg-fg/10 text-slate-400',
}
const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE[s] ?? 'bg-fg/10 text-slate-300'}`}>{s}</span>

export default function LiveAdmin() {
  const { me } = useLive()
  const [tab, setTab] = useState<Tab>('overview')
  const [userId, setUserId] = useState<string | null>(null)
  if (me && !me.profile.isAdmin) return <div><Header back title="Admin" /><p className="px-6 pt-10 text-center text-sm text-slate-400">This page is only for the Luda team.</p></div>
  return (
    <div className="pb-6">
      <Header back title="Admin" sub="Owner tools · every change needs your PIN and is logged" />
      <div className="px-5 pb-3"><Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Home' }, { value: 'cases', label: 'Cases' }, { value: 'users', label: 'Users' }, { value: 'topups', label: 'Top-ups' }, { value: 'withdrawals', label: 'Payouts' }]} /></div>
      <div className="px-5">
        {tab === 'overview' && <Overview />}
        {tab === 'cases' && <CasesTab />}
        {tab === 'users' && <UsersTab onOpen={setUserId} />}
        {tab === 'topups' && <TopUps onOpen={setUserId} />}
        {tab === 'withdrawals' && <Payouts onOpen={setUserId} />}
      </div>
      {userId && <UserSheet id={userId} onClose={() => setUserId(null)} />}
    </div>
  )
}

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

const Card = ({ label, value, sub, warn }: { label: string; value: ReactNode; sub?: string; warn?: boolean }) => (
  <div className={`rounded-2xl p-3 ${warn ? 'bg-rose-500/10 ring-1 ring-rose-400/40' : 'bg-fg/[0.04]'}`}><p className="text-[11px] text-slate-400">{label}</p><p className="text-lg font-extrabold">{value}</p>{sub && <p className="text-[11px] text-slate-500">{sub}</p>}</div>
)

function Overview() {
  const { data: o, err, loading, load } = useLoad<Record<string, any>>('admin-overview')
  if (err) return <p className="text-sm text-rose-300">{err}</p>
  if (!o) return <p className="text-sm text-slate-500">Loading…</p>
  const p = o.problems ?? {}
  const issues = [
    p.mismatch && `${p.mismatch} top-up(s) under review (amount didn't match)`,
    p.pendingOld && `${p.pendingOld} top-up(s) unpaid for over 1 hour (usually abandoned checkouts)`,
    p.withdrawalsStuck && `${p.withdrawalsStuck} payout(s) processing for over 30 min`,
    p.badWebhooks7d && `${p.badWebhooks7d} rejected webhook(s) this week: check secret keys/hash`,
    p.ledgerMismatch && `${p.ledgerMismatch} wallet(s) don't match their ledger: contact your developer`,
    o.openCases && `${o.openCases} support case(s) waiting for you (Cases tab)`,
  ].filter(Boolean) as string[]
  const wh = o.webhooks7d ?? {}
  return (
    <div className="flex flex-col gap-3">
      <button className="self-end text-xs text-slate-400" onClick={load}><RefreshCw size={12} className={`inline ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      <div className="grid grid-cols-2 gap-2">
        <Card label="Users" value={o.users} sub={`+${o.newUsers7d} this week`} />
        <Card label="ID verified" value={o.verified} sub={`${o.kycPending} in review · ${o.frozen} frozen`} />
        <Card label="Money held (Naira)" value={money(o.balances?.NGN ?? 0, 'NGN')} sub="must be covered by Paystack + bank" />
        <Card label="Money held (Lira)" value={money(o.balances?.TRY ?? 0, 'TRY')} />
        <Card label="Top-ups today" value={o.deposits24h?.count ?? 0} sub={`${money(o.deposits24h?.NGN ?? 0, 'NGN')} · ${money(o.deposits24h?.TRY ?? 0, 'TRY')}`} />
        <Card label="Top-ups 7 days" value={o.deposits7d?.count ?? 0} sub={`${money(o.deposits7d?.NGN ?? 0, 'NGN')} · ${money(o.deposits7d?.TRY ?? 0, 'TRY')}`} />
        <Card label="Payouts today" value={o.withdrawals24h?.count ?? 0} sub={money(o.withdrawals24h?.NGN ?? 0, 'NGN')} />
        <Card label="Payouts 7 days" value={o.withdrawals7d?.count ?? 0} sub={`${money(o.withdrawals7d?.NGN ?? 0, 'NGN')} · fees ${money(o.fees7d?.withdrawNGN ?? 0, 'NGN')}`} />
        <Card label="Tickets 7 days" value={o.tickets7d ?? 0} />
        <Card label="Webhooks 7 days" value={Object.values(wh).reduce((a: number, b) => a + Number(b), 0)} sub={Object.keys(wh).length ? Object.entries(wh).map(([k, v]) => `${k} ${v}`).join(' · ') : 'none received yet'} warn={!Object.keys(wh).length && (o.deposits7d?.count ?? 0) > 0} />
      </div>
      <div className={`rounded-2xl p-3 ${issues.length ? 'bg-gold-400/10' : 'bg-mint-400/10'}`}>
        <p className="flex items-center gap-2 text-sm font-bold">{issues.length ? <><AlertTriangle size={16} className="text-gold-300" /> Needs attention</> : <><ShieldCheck size={16} className="text-mint-300" /> All good: nothing stuck</>}</p>
        {issues.map((i) => <p key={i} className="mt-1 text-xs text-slate-300">• {i}</p>)}
      </div>
    </div>
  )
}

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
          <Users size={18} className="shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{u.fullName} <span className="text-xs text-slate-500">@{u.username}</span></p><p className="truncate text-xs text-slate-500">{u.email} · joined {when(u.createdAt)}</p></div>
          <div className="flex flex-col items-end gap-1"><Badge s={u.kyc} />{u.frozen && <span className="text-[10px] text-sky-300">🧊 frozen</span>}</div>
        </button>
      ))}
    </div>
  )
}

function TopUps({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const { data, err, load } = useLoad<{ deposits: any[] }>(`admin-deposits?status=${status}&q=${encodeURIComponent(q)}`)
  const [msg, setMsg] = useState('')
  const recheck = async (ref: string) => { setMsg(''); try { const r = await api('POST', 'admin-recheck', { reference: ref }); setMsg(`${short(ref)} → ${r.status}`); load() } catch (e) { setMsg(errMsg(e)) } }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select className="input w-auto py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All</option>{['paid', 'pending', 'mismatch', 'failed'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <input className="input py-2 text-sm" placeholder="Reference or email" value={q} onChange={(e) => setQ(e.target.value.trim())} />
      </div>
      {msg && <p className="text-xs text-slate-300">{msg}</p>}{err && <p className="text-sm text-rose-300">{err}</p>}
      {data?.deposits.map((d) => (
        <div key={d.reference} className="rounded-2xl bg-fg/[0.04] p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="selectable font-mono text-xs">{d.reference}</span><Badge s={d.status} /></div>
          <p className="mt-1 text-xs text-slate-400">{d.provider} · paid {money(Number(d.amount_minor), d.currency)} → {money(Number(d.credit_minor), d.credit_currency ?? 'NGN')} · {when(d.created_at)}</p>
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
  const recheck = async (ref: string) => { setMsg(''); try { const r = await api('POST', 'admin-recheck', { reference: ref }); setMsg(`${short(ref)} → ${r.status}`); load() } catch (e) { setMsg(errMsg(e)) } }
  return (
    <div className="flex flex-col gap-2">
      <select className="input w-auto py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All</option>{['processing', 'paid', 'failed', 'reversed'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
      {msg && <p className="text-xs text-slate-300">{msg}</p>}{err && <p className="text-sm text-rose-300">{err}</p>}
      {data?.withdrawals.map((w) => (
        <div key={w.reference} className="rounded-2xl bg-fg/[0.04] p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="selectable font-mono text-xs">{w.reference}</span><Badge s={w.status} /></div>
          <p className="mt-1 text-xs text-slate-400">{money(Number(w.amount_minor), 'NGN')} + fee {money(Number(w.fee_minor), 'NGN')} → {w.account_name} · {w.bank_name} ••{String(w.account_number).slice(-4)} · {when(w.created_at)}</p>
          {w.note && <p className="text-xs text-slate-500">{w.note}</p>}
          <div className="mt-2 flex gap-2">
            {w.status === 'processing' && <button className="chip bg-fg/5 py-1.5 text-xs" onClick={() => recheck(w.reference)}><RefreshCw size={12} /> Re-check with Paystack</button>}
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
        <div className="flex flex-col gap-3">
          <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
            {([['Username', '@' + u.username], ['Email', u.email], ['Phone', u.phone ? `${u.phone}${u.phoneVerified ? ' ✓' : ''}` : '–'], ['ID check', `${u.kyc}${u.kycName ? ` · ${u.kycName}` : ''}${u.kycType ? ` (${u.kycType}${u.kycCountry ? `, ${u.kycCountry}` : ''}${u.kycLast4 ? ` ••${u.kycLast4}` : ''})` : ''}`],
              ['Status', u.frozen ? `🧊 Frozen by ${u.frozenBy}` : 'Active'], ['Joined', when(u.createdAt)], ['Naira', money(data.balances.NGN ?? 0, 'NGN')], ['Lira', money(data.balances.TRY ?? 0, 'TRY')]] as [string, string][])
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
      <select className="input w-auto py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
        <option value="open,waiting_user">Open</option><option value="open">Needs your reply</option><option value="waiting_user">Waiting for user</option><option value="resolved">Resolved</option><option value="rejected">Closed</option><option value="all">All</option>
      </select>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {data?.cases.length === 0 && <p className="text-sm text-slate-500">No cases here. 🎉</p>}
      {data?.cases.map((c) => (
        <button key={c.id} onClick={() => setOpen(c.id)} className="glass flex flex-col gap-1 rounded-2xl p-3 text-start">
          <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{c.subject}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_LABEL[c.status]?.c}`}>{c.status === 'open' ? 'Needs reply' : STATUS_LABEL[c.status]?.t}</span></div>
          <p className="text-xs text-slate-400">{CATEGORY_LABEL[c.category as CaseCategory]} · {c.user?.full_name} @{c.user?.username} · ID: {c.user?.kyc_status}</p>
          {c.last && <p className="truncate text-xs text-slate-500">{c.last.author === 'admin' ? 'You' : 'User'}: {c.last.body}{c.last.files ? ` · 📎${c.last.files}` : ''} · {when(c.last.at)}</p>}
        </button>
      ))}
      {open && <AdminCaseSheet id={open} onClose={() => { setOpen(null); load() }} />}
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
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-300">
            <p><b>{u?.fullName}</b> @{u?.username} · {u?.email}</p>
            <p>ID check: <b>{u?.kyc}</b>{u?.kycName ? ` · ${u.kycName}` : ''} · {u?.frozen ? '🧊 frozen' : 'active'} · {CATEGORY_LABEL[c.category as CaseCategory]}</p>
            {c.reference && <p>Reference: <span className="font-mono">{c.reference}</span></p>}
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
