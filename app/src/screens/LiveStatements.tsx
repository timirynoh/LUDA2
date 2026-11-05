// Statements & insights (v1.21.0, owner's pick): a month of your wallet from the server ledger, where your money went,
// and a PDF statement to share (landlord, embassy, university).
import { Download, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Header } from '../components/ui'
import { errMsg } from '../components/LiveMoney'
import { api } from '../lib/live'
import { amt, CAT_LABEL, monthName, rowLabel, saveStatementPdf, type Statement } from '../lib/statement'
import { useStore } from '../lib/store'

const thisMonth = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7)

export default function LiveStatements() {
  const { toast } = useStore()
  const [month, setMonth] = useState(thisMonth)
  const [st, setSt] = useState<Statement | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [cur, setCur] = useState<string | null>(null)
  const load = useCallback(async () => {
    setSt(null)
    try { setSt(await api<Statement>('GET', `statement?month=${month}`)); setErr('') } catch (e) { setErr(errMsg(e)) }
  }, [month])
  useEffect(() => { void load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect
  const months = [...new Set([thisMonth(), ...(st?.months ?? [])])].sort().reverse()
  const curs = Object.keys(st?.currencies ?? {})
  const c = cur && curs.includes(cur) ? cur : curs.includes('NGN') ? 'NGN' : curs[0]
  const out = (st?.categories ?? []).filter((x) => x.cur === c && x.out > 0).sort((a, b) => b.out - a.out)
  const inn = (st?.categories ?? []).filter((x) => x.cur === c && x.in > 0).sort((a, b) => b.in - a.in)
  const maxOut = Math.max(1, ...out.map((x) => x.out))
  const rows = (st?.rows ?? []).filter((r) => r.cur === c).slice().reverse()
  const pdf = async () => { if (!st) return; setBusy(true); try { await saveStatementPdf(st); toast({ title: 'Statement ready', emoji: '📄' }) } catch { toast({ title: 'Couldn’t make the PDF. Try again', emoji: '⚠️' }) } finally { setBusy(false) } }

  return (
    <div className="pb-10">
      <Header back title="Statements" sub="Your wallet, month by month" />
      <div className="flex flex-col gap-4 px-5">
        <div className="flex gap-2 overflow-x-auto">
          {months.map((m) => <button key={m} onClick={() => setMonth(m)} className={`chip shrink-0 px-3.5 py-2 text-xs font-semibold ${m === month ? 'bg-mint-400 text-ink-950' : 'glass text-slate-300'}`}>{monthName(m)}</button>)}
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        {!st && !err && <Loader2 className="mx-auto mt-6 animate-spin text-slate-500" />}
        {st && !curs.length && <p className="card py-10 text-center text-sm text-slate-400">No wallet activity yet.</p>}
        {st && c && <>
          {curs.length > 1 && <div className="glass grid grid-cols-2 gap-1 rounded-2xl p-1">{curs.map((x) => <button key={x} onClick={() => setCur(x)} className={`rounded-xl py-2 text-sm font-semibold ${x === c ? 'bg-mint-400 text-ink-950' : 'text-slate-300'}`}>{x === 'NGN' ? '₦ Naira' : x === 'TRY' ? '₺ Lira' : x}</button>)}</div>}
          <div className="grid grid-cols-2 gap-2">
            <div className="card py-3"><p className="text-xs text-slate-400">Money in</p><p className="mt-1 text-lg font-extrabold text-mint-300">{amt(st.currencies[c].in, c)}</p></div>
            <div className="card py-3"><p className="text-xs text-slate-400">Money out</p><p className="mt-1 text-lg font-extrabold text-rose-300">{amt(st.currencies[c].out, c)}</p></div>
            <div className="card py-3"><p className="text-xs text-slate-400">Start of month</p><p className="mt-1 font-bold">{amt(st.currencies[c].opening, c)}</p></div>
            <div className="card py-3"><p className="text-xs text-slate-400">End of month</p><p className="mt-1 font-bold">{amt(st.currencies[c].closing, c)}</p></div>
          </div>

          {out.length > 0 && <section className="card flex flex-col gap-3">
            <p className="text-sm font-semibold">Where your money went</p>
            {out.map((x) => (
              <div key={x.cat}>
                <div className="flex items-center justify-between text-sm"><span>{CAT_LABEL[x.cat]?.[0]} {CAT_LABEL[x.cat]?.[1] ?? x.cat}</span><span className="font-semibold">{amt(x.out, c)}</span></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fg/5"><div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500" style={{ width: `${Math.max(3, (x.out / maxOut) * 100)}%` }} /></div>
              </div>
            ))}
          </section>}
          {inn.length > 0 && <section className="card flex flex-col gap-2">
            <p className="text-sm font-semibold">Where it came from</p>
            {inn.map((x) => <div key={x.cat} className="flex items-center justify-between text-sm"><span>{CAT_LABEL[x.cat]?.[0]} {CAT_LABEL[x.cat]?.[1] ?? x.cat}</span><span className="font-semibold text-mint-300">{amt(x.in, c)}</span></div>)}
          </section>}

          <button className="btn-primary py-3.5" disabled={busy} onClick={() => void pdf()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF statement</button>
          <p className="-mt-2 text-center text-[11px] text-slate-500">For your landlord, embassy or university. Every line comes from Luda’s records.</p>

          <section className="flex flex-col gap-1">
            <p className="label mb-1">Transactions</p>
            {rows.length === 0 ? <p className="card text-center text-sm text-slate-400">No transactions this month.</p> : rows.map((r, i) => (
              <div key={`${r.ref}${i}`} className="flex items-center gap-3 rounded-2xl bg-fg/[0.03] px-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-fg/5">{CAT_LABEL[r.cat]?.[0] ?? '•'}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{rowLabel(r)}</p><p className="text-[11px] text-slate-500">{new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div>
                <div className="text-end"><p className={`text-sm font-bold ${r.amount < 0 ? 'text-rose-300' : 'text-mint-300'}`}>{amt(r.amount, r.cur, true)}</p><p className="text-[11px] text-slate-500">{amt(r.balance, r.cur)}</p></div>
              </div>
            ))}
          </section>
        </>}
      </div>
    </div>
  )
}
