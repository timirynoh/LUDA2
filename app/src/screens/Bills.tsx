import { motion } from 'framer-motion'
import { Droplets, Flame, Home, Loader2, Smartphone, Wifi, Zap } from 'lucide-react'
import { useState } from 'react'
import { DemoNote, Header, Sheet, Success } from '../components/ui'
import { BILL_CASHBACK } from '../config'
import { BILLERS, CITIES, type BillCategory } from '../lib/data'
import { fmt } from '../lib/fx'
import { useStore } from '../lib/store'

const ICONS: Record<BillCategory, typeof Zap> = { electricity: Zap, water: Droplets, gas: Flame, internet: Wifi, mobile: Smartphone, rent: Home }

/** Deterministic pseudo-bill so the same account always shows the same amount in demo mode. */
function mockBill(biller: string, account: string) {
  let h = 0
  for (const ch of biller + account) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const base: Record<string, [number, number]> = {
    kibtek: [450, 2400], water: [120, 480], lpg: [780, 780], turkcell: [200, 900], telsim: [200, 900], fiber: [650, 1100], rent: [9000, 22000],
  }
  const [lo, hi] = base[biller] ?? [100, 500]
  const amount = lo === hi ? lo : Math.round(lo + (h % 1000) / 1000 * (hi - lo))
  const due = new Date(Date.now() + ((h % 12) + 2) * 86_400_000)
  return { amount, due, period: new Date().toLocaleString('en', { month: 'long', year: 'numeric' }), holder: `Account ••${account.slice(-3) || '000'}` }
}

export default function Bills() {
  const { s, set, t, addTx, reward, gate } = useStore()
  const city = CITIES.find((c) => c.id === s.city)!
  const [biller, setBiller] = useState<string | null>(null)
  const [account, setAccount] = useState('')
  const [bill, setBill] = useState<ReturnType<typeof mockBill> | null>(null)
  const [stage, setStage] = useState<'form' | 'busy' | 'bill' | 'done'>('form')
  const b = BILLERS.find((x) => x.id === biller)
  const name = (id: string, n: string) => (id === 'water' ? `${city.name} Municipality Water` : n)

  const open = (id: string, acc = '') => {
    if (!gate(2, 'Pay bills')) return
    setBiller(id); setAccount(acc); setBill(null); setStage('form') }
  const fetchBill = async () => { setStage('busy'); await new Promise((r) => setTimeout(r, 900)); setBill(mockBill(biller!, account)); setStage('bill') }
  const pay = () => {
    const amt = bill!.amount
    const pts = Math.round(amt * BILL_CASHBACK * 10)
    set((p) => ({
      ...p, balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) - amt }, points: p.points + pts,
      savedBills: p.savedBills.some((x) => x.biller === biller && x.account === account) ? p.savedBills : [...p.savedBills, { biller: biller!, account }],
    }))
    addTx({ type: 'bill', amount: -amt, currency: 'TRY', label: `${name(b!.id, b!.name)} · ${bill!.period}`, meta: `+${pts} pts` })
    reward(s.quests.includes('bill') ? 15 : 80, { quest: 'bill', badge: 'bill_slayer', title: 'Bill paid on time' })
    setStage('done')
  }

  return (
    <div>
      <Header back title={t('bills.title')} sub={`Balance ${fmt(s.balances.TRY ?? 0, 'TRY')} · ${BILL_CASHBACK * 100}% ${t('bills.cashback')}`} />
      <div className="grid grid-cols-2 gap-3 px-5 tab:grid-cols-3">
        {BILLERS.map((x, i) => {
          const Icon = ICONS[x.category]
          return (
            <motion.button key={x.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
              onClick={() => open(x.id)} className="card flex flex-col items-start gap-3 text-start active:scale-[.98]">
              <div className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${x.color} text-white shadow-lg`}><Icon size={22} /></div>
              <div><p className="font-semibold leading-tight">{name(x.id, x.name)}</p><p className="text-xs capitalize text-slate-500">{x.category}</p></div>
            </motion.button>
          )
        })}
      </div>

      {s.savedBills.length > 0 && (
        <div className="px-5 pt-6">
          <p className="label mb-2">{t('bills.saved')}</p>
          <div className="flex flex-col gap-2">
            {s.savedBills.map((x) => {
              const bb = BILLERS.find((y) => y.id === x.biller)!
              const Icon = ICONS[bb.category]
              return (
                <button key={x.biller + x.account} onClick={() => open(x.biller, x.account)} className="card flex items-center gap-3 py-3 text-start">
                  <Icon size={18} className="text-slate-400" /><span className="flex-1 text-sm font-semibold">{name(bb.id, bb.name)}</span>
                  <span className="text-xs text-slate-500">{x.account}</span><span className="chip bg-mint-400/15 text-mint-300">Pay</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <DemoNote />

      <Sheet open={!!b} onClose={() => setBiller(null)} title={b ? name(b.id, b.name) : ''}>
        {b && stage === 'form' && (
          <div className="flex flex-col gap-4">
            <div><p className="label mb-2">{b.hint}</p><input className="input" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. 1234567" /></div>
            <button className="btn-primary py-4" disabled={account.length < 3} onClick={fetchBill}>{t('bills.fetch')}</button>
          </div>
        )}
        {stage === 'busy' && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-mint-300" size={36} /></div>}
        {stage === 'bill' && bill && (
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl bg-gradient-to-br from-ink-700 to-ink-800 p-5">
              <p className="text-xs text-slate-400">{bill.holder} · {bill.period}</p>
              <p className="mt-1 text-sm text-slate-400">{t('bills.due')}</p>
              <p className="text-4xl font-extrabold">{fmt(bill.amount, 'TRY')}</p>
              <p className="mt-2 text-xs text-gold-300">Due {bill.due.toLocaleDateString()} · earn {Math.round(bill.amount * BILL_CASHBACK * 10)} pts</p>
            </div>
            {bill.amount > (s.balances.TRY ?? 0) && <p className="text-sm text-rose-400">{t('wallet.insufficient')} — convert or deposit TL first.</p>}
            <button className="btn-primary py-4" disabled={bill.amount > (s.balances.TRY ?? 0)} onClick={pay}>{t('bills.pay')}</button>
          </div>
        )}
        {stage === 'done' && bill && <Success title={t('wallet.success')} sub={`${fmt(bill.amount, 'TRY')} paid · receipt saved to Activity`} onClose={() => setBiller(null)} />}
      </Sheet>
    </div>
  )
}
