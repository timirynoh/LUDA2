import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight, Banknote, Building, CreditCard, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DemoNote, Header, PinPad, Sheet, Success } from '../components/ui'
import { TxList } from '../components/TxList'
import { COUNTRIES, CURRENCIES } from '../lib/data'
import { fmt } from '../lib/fx'
import { useStore } from '../lib/store'

type Mode = 'deposit' | 'withdraw'

const METHODS: Record<Mode, { id: string; icon: typeof CreditCard; name: string; sub: string; fee: number }[]> = {
  deposit: [
    { id: 'card', icon: CreditCard, name: 'Debit / credit card', sub: 'Visa · Mastercard · instant', fee: 0.015 },
    { id: 'bank', icon: Building, name: 'TRNC bank transfer', sub: 'IBAN · within minutes', fee: 0 },
    { id: 'home', icon: Smartphone, name: 'From home country', sub: 'Bank app / mobile money via partner', fee: 0.01 },
    { id: 'agent', icon: Banknote, name: 'Cash at Luda agent', sub: 'Verified shops in your city', fee: 0.005 },
  ],
  withdraw: [
    { id: 'bank', icon: Building, name: 'To TRNC bank account', sub: 'IBAN · same day', fee: 0 },
    { id: 'home', icon: Smartphone, name: 'Send home', sub: 'Bank / mobile money in your country', fee: 0.01 },
    { id: 'agent', icon: Banknote, name: 'Cash pickup', sub: 'Collect with a one-time code', fee: 0.005 },
  ],
}

export default function Wallet() {
  const { s, set, t, addTx, reward, checkPin } = useStore()
  const [params, setParams] = useSearchParams()
  const mode = (params.get('a') as Mode | null) ?? null
  const home = COUNTRIES.find((c) => c.code === s.country)!
  const [cur, setCur] = useState('TRY')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('card')
  const [stage, setStage] = useState<'form' | 'pin' | 'busy' | 'done'>('form')
  const [err, setErr] = useState('')

  const open = (m: Mode) => { setParams({ a: m }); setStage('form'); setAmount(''); setErr(''); setMethod(METHODS[m][0].id) }
  const close = () => setParams({})
  const amt = parseFloat(amount) || 0
  const m = mode ? METHODS[mode].find((x) => x.id === method) ?? METHODS[mode][0] : null
  const fee = m ? amt * m.fee : 0
  const currencies = [...new Set(['TRY', home.currency, 'USD', 'EUR', ...Object.keys(s.balances)])]

  const execute = async () => {
    setStage('busy')
    await new Promise((r) => setTimeout(r, 1400))
    const delta = mode === 'deposit' ? amt - fee : -(amt + fee)
    set((p) => ({ ...p, balances: { ...p.balances, [cur]: (p.balances[cur] ?? 0) + delta } }))
    addTx({ type: mode!, amount: delta, currency: cur, label: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} · ${m!.name}`, meta: fee ? `fee ${fmt(fee, cur)}` : 'no fee' })
    setStage('done')
    if (mode === 'deposit') reward(s.quests.includes('deposit') ? 10 : 50, { quest: 'deposit', badge: 'first_deposit', title: 'Wallet topped up' })
    else reward(10, { title: 'Withdrawal sent' })
  }

  const submit = () => {
    if (mode === 'withdraw' && amt + fee > (s.balances[cur] ?? 0)) return setErr(t('wallet.insufficient'))
    setErr('')
    if (mode === "withdraw") setStage("pin")
    else execute()
  }

  return (
    <div>
      <Header title={t('wallet.title')} sub="Multi-currency · escrow-protected" />
      <div className="flex snap-x gap-3 overflow-x-auto px-5 pb-2">
        {currencies.map((c, i) => (
          <motion.button key={c} onClick={() => setCur(c)} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
            className={`relative min-w-[11rem] snap-start overflow-hidden rounded-3xl p-5 text-start transition ${cur === c ? 'bg-gradient-to-br from-ink-600 to-ink-800 ring-2 ring-mint-400/50' : 'glass'}`}>
            <div className="absolute -top-8 -right-8 size-24 rounded-full bg-mint-400/10 blur-2xl" />
            <p className="text-2xl">{CURRENCIES[c]?.flag}</p>
            <p className="mt-3 text-xs text-slate-400">{CURRENCIES[c]?.name}</p>
            <p className="text-xl font-extrabold">{fmt(s.balances[c] ?? 0, c, { compact: true })}</p>
          </motion.button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pt-4">
        <button className="btn-primary py-4" onClick={() => open('deposit')}><ArrowDownLeft size={18} /> {t('act.deposit')}</button>
        <button className="btn-ghost py-4" onClick={() => open('withdraw')}><ArrowUpRight size={18} /> {t('act.withdraw')}</button>
      </div>

      <div className="mx-5 mt-4 flex items-center gap-3 rounded-2xl bg-mint-400/5 p-3 text-xs text-slate-400">
        <ShieldCheck size={28} className="shrink-0 text-mint-300" />
        Funds are held with a licensed partner in segregated accounts. PIN + device binding protects every withdrawal.
      </div>

      <div className="px-5 pt-6">
        <p className="label mb-3">{t('wallet.history')}</p>
        <TxList txs={s.txs} empty={t('wallet.empty')} />
      </div>
      <DemoNote />

      <Sheet open={!!mode} onClose={close} title={mode === 'deposit' ? t('act.deposit') : t('act.withdraw')}>
        {stage === 'form' && mode && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 overflow-x-auto">
              {currencies.map((c) => (
                <button key={c} onClick={() => setCur(c)} className={`chip shrink-0 py-2 ${cur === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{CURRENCIES[c]?.flag} {c}</button>
              ))}
            </div>
            <div>
              <p className="label mb-2">{t('wallet.amount')}</p>
              <div className="relative">
                <input inputMode="decimal" className="input py-4 pe-16 text-3xl font-bold" value={amount} placeholder="0"
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
                <span className="absolute end-4 top-1/2 -translate-y-1/2 font-semibold text-slate-400">{cur}</span>
              </div>
              {mode === 'withdraw' && <p className="mt-2 text-xs text-slate-400">Available: {fmt(s.balances[cur] ?? 0, cur)}</p>}
              <div className="mt-2 flex gap-2">
                {[100, 500, 1000, 5000].map((v) => <button key={v} onClick={() => setAmount(String(v))} className="chip bg-fg/5 py-1.5 text-slate-300">{v.toLocaleString()}</button>)}
              </div>
            </div>
            <div>
              <p className="label mb-2">{t('wallet.method')}</p>
              <div className="flex flex-col gap-2">
                {METHODS[mode].map(({ id, icon: Icon, name, sub, fee }) => (
                  <button key={id} onClick={() => setMethod(id)}
                    className={`glass flex items-center gap-3 rounded-2xl p-3 text-start ${method === id ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
                    <div className="grid size-10 place-items-center rounded-xl bg-fg/5"><Icon size={18} /></div>
                    <div className="flex-1"><p className="text-sm font-semibold">{name}</p><p className="text-xs text-slate-500">{sub}</p></div>
                    <span className="text-xs text-slate-400">{fee ? `${(fee * 100).toFixed(1)}%` : 'Free'}</span>
                  </button>
                ))}
              </div>
            </div>
            {amt > 0 && (
              <div className="rounded-2xl bg-fg/[0.03] p-3 text-sm">
                <div className="flex justify-between text-slate-400"><span>Fee</span><span>{fmt(fee, cur)}</span></div>
                <div className="mt-1 flex justify-between font-semibold"><span>{mode === 'deposit' ? 'You receive' : 'Total debited'}</span><span>{fmt(mode === 'deposit' ? amt - fee : amt + fee, cur)}</span></div>
              </div>
            )}
            {err && <p className="text-sm text-rose-400">{err}</p>}
            <button className="btn-primary py-4" disabled={amt <= 0} onClick={submit}>{t('wallet.confirm')}</button>
          </div>
        )}
        {stage === 'pin' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-slate-300">{t('wallet.pin')}</p>
            <PinPad error={err} onDone={async (p) => ((await checkPin(p)) ? execute() : setErr('Wrong PIN — try again'))} />
          </div>
        )}
        {stage === 'busy' && (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-300"><Loader2 className="animate-spin text-mint-300" size={40} />Processing securely…</div>
        )}
        {stage === 'done' && <Success title={t('wallet.success')} sub={`${fmt(amt, cur)} ${mode === 'deposit' ? 'added to' : 'sent from'} your wallet`} onClose={close} />}
      </Sheet>
    </div>
  )
}
