// Real-money building blocks (live mode): review → hold → PIN, KYC, top-up, withdraw, convert, send.
import { InfoTip } from './LiveGuides'
import { BadgeCheck, ExternalLink, Fingerprint, Loader2, Lock, Search, ShieldCheck } from 'lucide-react'
import { bioApprove, bioSaved } from '../lib/bio'
import { ManualKycSheet } from './ManualKyc'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { HoldButton } from './Confirm'
import { BankBadge, popularity } from './BankBadge'
import { PinPad, Segmented, Sheet, Success } from './ui'
import { FOREIGN_CURRENCIES, PENDING_KEY, PROVIDER_LABEL, api, liveConfig, money, type Cur, type LiveConfig, type Provider } from '../lib/live'
import { COUNTRIES } from '../lib/data'
import { useStore } from '../lib/store'
import { useLive } from '../lib/liveStore'

const parseMinor = (v: string) => Math.round(Number(v.replace(/[^\d.]/g, '') || 0) * 100)
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

/** How a money action is approved: the PIN, or this phone's fingerprint (verified by the server). */
export type Approval = { pin: string } | { bio: Awaited<ReturnType<typeof bioApprove>> }

/**
 * Two deliberate steps before money moves: (1) read the summary and press-and-hold,
 * (2) fingerprint / Face ID (if set up on this phone) or the PIN, checked by the server.
 */
export function ReviewAndPin({ rows, warning, holdLabel, run, done, onClose }: {
  rows: [string, ReactNode][]; warning?: ReactNode; holdLabel: string
  run: (auth: Approval) => Promise<void>; done: ReactNode; onClose: () => void
}) {
  const [stage, setStage] = useState<'review' | 'pin' | 'busy' | 'done'>('review')
  const [err, setErr] = useState('')
  const canBio = !!bioSaved()?.server
  const go = async (auth: Approval) => {
    setStage('busy'); setErr('')
    try { await run(auth); setStage('done') } catch (e) {
      // Only a wrong PIN / fingerprint goes back to the PIN pad. Anything else (missing receipt, already handled,
      // no internet, server error) is shown on the review screen, so it never looks like the PIN stopped working.
      const m = errMsg(e)
      if (/\bPIN\b|fingerprint|Face ID|passkey|too many/i.test(m)) { setErr(m); setStage('pin') }
      else { setErr(m); setStage('review') }
    }
  }
  const fingerprint = async () => {
    setErr('')
    try { const bio = await bioApprove(); await go({ bio }) } catch (e) { setErr(`${errMsg(e)}. Use your PIN instead.`); setStage('pin') }
  }
  const approve = () => { if (canBio) void fingerprint(); else setStage('pin') }
  if (stage === 'done') return <>{done}</>
  if (stage === 'busy') return <div className="flex flex-col items-center gap-3 py-10"><Loader2 className="animate-spin text-mint-300" size={40} /><p className="text-sm text-slate-400">Processing… don't close Luda</p></div>
  if (stage === 'pin') return (
    <div className="flex flex-col items-center gap-3"><p className="text-sm text-slate-300">Enter your Luda PIN to approve</p><PinPad error={err} onDone={(pin) => go({ pin })} />
      {canBio && <button className="flex items-center gap-2 text-sm text-mint-300" onClick={fingerprint}><Fingerprint size={18} /> Use fingerprint / Face ID</button>}
      <a href="/security?a=forgot-pin" className="text-xs text-mint-300 underline">Forgot your PIN?</a>
      <button className="text-xs text-slate-500 underline" onClick={onClose}>Cancel</button></div>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04]">
        {rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="text-slate-400">{k}</span><span className="text-end font-semibold">{v}</span></div>)}
      </div>
      {warning && <div className="rounded-2xl border border-gold-400/30 bg-gold-400/[0.07] p-3 text-xs text-gold-100">{warning}</div>}
      {err && <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200"><b>Not done:</b> {err}<br /><span className="text-xs text-rose-200/70">This is not a PIN problem.</span></div>}
      <HoldButton label={holdLabel} onDone={approve} />
      {canBio && <p className="text-center text-[11px] text-slate-500"><Fingerprint size={12} className="inline" /> You'll approve with your fingerprint / Face ID</p>}
      <button className="btn-ghost text-sm" onClick={onClose}>Go back</button>
    </div>
  )
}

/* ---------------------------------- KYC ---------------------------------- */

/** Identity check: Didit (ID document + live selfie, any nationality) and/or Nigerian NIN/BVN (Dojah). */
export function LiveKyc({ onDone }: { onDone?: () => void }) {
  const { me } = useLive()
  const [cfg, setCfg] = useState<LiveConfig | null>(null)
  const [nin, setNin] = useState(false)
  useEffect(() => { liveConfig().then(setCfg).catch(() => {}) }, [])
  if (me?.profile.kyc === 'verified' || !cfg) return <NinKyc onDone={onDone} />
  if (cfg.didit && !nin) return <DiditKyc ninAvailable={!!cfg.nin} onUseNin={() => setNin(true)} />
  return <NinKyc onDone={onDone} />
}

function DiditKyc({ ninAvailable, onUseNin }: { ninAvailable: boolean; onUseNin: () => void }) {
  const { me } = useLive()
  const [appeal, setAppeal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const start = async () => {
    setBusy(true); setErr('')
    try { const r = await api<{ url?: string; status?: string }>('POST', 'kyc-start'); if (r.url) window.location.assign(r.url) } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  const left = me?.profile.kycTriesLeft ?? 2
  const startedAt = me?.profile.kycStartedAt ? Date.parse(me.profile.kycStartedAt) : 0
  const stuck = me?.profile.kyc === 'pending' && Date.now() - startedAt > 2 * 60_000
  if (me?.profile.kyc === 'pending' && !stuck) return (
    <div className="flex items-center gap-3 rounded-2xl border border-sky-400/40 bg-sky-400/10 p-3 text-sky-200"><Loader2 className="animate-spin" />
      <div><p className="text-sm font-bold">ID check in progress</p><p className="text-xs text-slate-400">Usually a few minutes. We'll unlock withdrawals and sending as soon as it's approved.</p></div></div>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3"><ShieldCheck className="shrink-0 text-mint-300" />
        <p className="text-sm">Verify once to <b>withdraw</b> and <b>send money</b>. Takes about 2 minutes, for every nationality. <InfoTip slug="tip-kyc" /></p></div>
      <ul className="grid gap-1.5 text-sm text-slate-300">
        <li>📄 Photo of your <b>passport</b>, national ID or TRNC residence permit</li>
        <li>🤳 A quick live selfie (we check it's really you)</li>
        <li>✍️ The name on your document must match <b>{me?.profile.fullName}</b></li>
      </ul>
      {me?.profile.kyc === 'failed' && <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300">Your last check wasn't approved. Use a valid, unexpired document and good light, then try again.</p>}
      {stuck && <p className="rounded-xl bg-gold-400/10 p-3 text-xs text-gold-100">Your last check didn't finish. If it is approved later, you'll see it here. Otherwise try again or contact the Luda team.</p>}
      {left <= 0 && <p className="rounded-xl bg-gold-400/10 p-3 text-xs text-gold-100">You've used today's 2 ID checks. Try again tomorrow, or send your ID to the Luda team below.</p>}
      {appeal && <ManualKycSheet onClose={() => setAppeal(false)} />}
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {(err || left <= 0) && <button className="btn-primary py-4" onClick={() => setAppeal(true)}><ShieldCheck size={18} /> Send your ID to the Luda team (free)</button>}
      <button className="btn-primary py-4" disabled={busy || left <= 0} onClick={start}>{busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />} Verify my identity</button>
      <p className="-mt-1 text-center text-[11px] text-slate-500">{left > 0 ? `${left} of 2 tries left today` : 'No tries left today'}</p>
      <p className="flex items-start gap-1.5 text-[11px] text-slate-500"><Lock size={12} className="mt-0.5 shrink-0" /> Done on Didit's secure page. Luda keeps only your verified name, date of birth, country and the last 4 characters of your document number.</p>
      <button className="text-xs text-mint-300 underline" onClick={() => setAppeal(true)}>Can't verify? Send your ID to the Luda team</button>
      {ninAvailable && <button className="text-xs text-slate-400 underline" onClick={onUseNin}>Nigerian? Verify with NIN or BVN instead</button>}
    </div>
  )
}

function NinKyc({ onDone }: { onDone?: () => void }) {
  const { me, refresh } = useLive()
  const [type, setType] = useState<'nin' | 'bvn'>('nin')
  const [num, setNum] = useState('')
  const [dob, setDob] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  if (me?.profile.kyc === 'verified' || ok) return (
    <div className="flex items-center gap-3 rounded-2xl border border-mint-400/40 bg-mint-400/10 p-3 text-mint-300"><BadgeCheck />
      <div><p className="text-sm font-bold">Identity verified</p><p className="text-xs text-slate-400">{me?.profile.kycName ?? ok}. Withdrawals and sending are unlocked.</p></div></div>
  )
  const submit = async () => {
    setBusy(true); setErr('')
    try { const r = await api<{ name: string }>('POST', 'kyc', { type, number: num, dob }); setOk(r.name); await refresh(); onDone?.() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3"><ShieldCheck className="shrink-0 text-mint-300" />
        <p className="text-sm">Verify once to <b>withdraw</b> and <b>send money</b>. We check your NIN or BVN with the official database. Your name and date of birth must match <b>{me?.profile.fullName}</b>.</p></div>
      <Segmented value={type} onChange={setType} options={[{ value: 'nin', label: 'NIN' }, { value: 'bvn', label: 'BVN' }]} />
      <input className="input font-mono tracking-widest" inputMode="numeric" maxLength={11} placeholder={`11-digit ${type.toUpperCase()}`} value={num} onChange={(e) => { setNum(e.target.value.replace(/\D/g, '')); setErr('') }} />
      <label className="label">Date of birth</label>
      <input className="input" type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDob(e.target.value); setErr('') }} />
      <p className="flex items-start gap-1.5 text-[11px] text-slate-500"><Lock size={12} className="mt-0.5 shrink-0" /> We keep only the last 4 digits. Your number is never shown to other users. Max 3 tries a day.</p>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      <button className="btn-primary py-4" disabled={num.length !== 11 || !dob || busy} onClick={submit}>{busy ? <Loader2 size={18} className="animate-spin" /> : null} Verify my identity</button>
    </div>
  )
}

/* -------------------------------- top up -------------------------------- */

export function DepositSheet({ onClose }: { onClose: () => void }) {
  const { me } = useLive()
  const { s } = useStore()
  const home = COUNTRIES.find((c) => c.code === s.country)?.currency ?? 'NGN'
  const [cfg, setCfg] = useState<LiveConfig | null>(null)
  const [cur, setCur] = useState<string>('NGN')
  const [provider, setProvider] = useState<Provider>('paystack')
  const [amt, setAmt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [quote, setQuote] = useState<{ reference: string; checkoutUrl: string; currency: string; creditMinor: number; creditCurrency: Cur; feeMinor: number; chargeMinor: number; providerAddsFee?: boolean; estFeeMinor?: number } | null>(null)
  useEffect(() => {
    liveConfig().then((c) => {
      setCfg(c)
      // Start with the student's home currency when it's offered.
      if (home !== 'NGN' && c.foreign.includes(home)) { setCur(home); setProvider('flutterwave') } else if (c.providers[0]) setProvider(c.providers[0])
    }).catch((e) => setErr(errMsg(e)))
  }, [home])
  const foreign = cur !== 'NGN'
  const info = FOREIGN_CURRENCIES[cur]
  const minor = parseMinor(amt)
  const pick = (c: string) => { setCur(c); setAmt(''); setErr(''); if (c !== 'NGN') setProvider('flutterwave') }
  const start = async () => {
    setBusy(true); setErr('')
    try {
      const q = await api('POST', 'deposit', { provider, currency: cur, amountMinor: minor })
      localStorage.setItem(PENDING_KEY, q.reference)
      setQuote(q)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const currencies = ['NGN', ...(cfg?.foreign ?? [])]
  return (
    <Sheet open onClose={onClose} title="Top up your wallet">
      {quote ? (
        <div className="flex flex-col gap-3">
          <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
            <div className="flex justify-between px-4 py-3"><span className="text-slate-400">Top-up</span><span>{money(quote.chargeMinor - quote.feeMinor, quote.currency)}</span></div>
            {quote.providerAddsFee ? <>
              <div className="flex justify-between gap-3 px-4 py-3"><span className="text-slate-400">{PROVIDER_LABEL[provider]} fee</span><span className="text-end">added by {PROVIDER_LABEL[provider]} at checkout{quote.estFeeMinor ? <><br /><span className="text-xs text-slate-400">about {money(quote.estFeeMinor, quote.currency)}</span></> : null}</span></div>
              <div className="flex justify-between px-4 py-3 text-base"><span>You pay</span><b>{money(quote.chargeMinor, quote.currency)} + fee</b></div>
            </> : <>
              <div className="flex justify-between px-4 py-3"><span className="text-slate-400">{PROVIDER_LABEL[provider]} fee</span><span>{money(quote.feeMinor, quote.currency)}</span></div>
              <div className="flex justify-between px-4 py-3 text-base"><span>You pay</span><b>{money(quote.chargeMinor, quote.currency)}</b></div>
            </>}
            <div className="flex justify-between px-4 py-3"><span className="text-slate-400">Lands in your {quote.creditCurrency === 'TRY' ? 'Lira' : 'Naira'} wallet</span><b className="text-mint-300">{money(quote.creditMinor, quote.creditCurrency)}</b></div>
          </div>
          {quote.creditCurrency === 'TRY' && <p className="text-[11px] text-slate-500">Converted to Lira at today's rate. Spend it on tickets in Cyprus or send it to friends.</p>}
          <p className="text-[11px] text-slate-500">You'll pay on {PROVIDER_LABEL[provider]}'s secure page{info ? ` (${info.how})` : ' (card, bank transfer or USSD)'}, then come back to Luda automatically.</p>
          <button className="btn-primary py-4" onClick={() => window.location.assign(quote.checkoutUrl)}><ExternalLink size={18} /> Confirm & pay with {PROVIDER_LABEL[provider]}</button>
          <button className="btn-ghost text-sm" onClick={() => setQuote(null)}>Change amount</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="label">Pay in</p>
          <div className="flex flex-wrap gap-2">
            {currencies.map((c) => (
              <button key={c} onClick={() => pick(c)} className={`chip ${cur === c ? 'border-mint-400/60 bg-mint-400/15 text-mint-200' : ''}`}>{c === 'NGN' ? '🇳🇬' : FOREIGN_CURRENCIES[c]?.flag} {c}</button>
            ))}
          </div>
          <input className="input text-2xl font-bold" inputMode="numeric" placeholder={`${cur} amount`} value={amt} onChange={(e) => { setAmt(e.target.value.replace(/[^\d]/g, '')); setErr('') }} />
          <div className="flex flex-wrap gap-2">{(info?.quick ?? [5000, 10000, 20000, 50000]).map((v) => <button key={v} className="chip" onClick={() => setAmt(String(v))}>{money(v * 100, cur)}</button>)}</div>
          {foreign ? (
            <p className="rounded-xl bg-fg/[0.04] p-3 text-xs text-slate-300">{info?.flag} Paid with <b>Flutterwave</b> ({info?.how}). It lands in your <b>Lira wallet</b> at today's rate. You'll see the exact Lira amount before you pay.</p>
          ) : <>
            <p className="label">Pay with</p>
            <div className="grid grid-cols-2 gap-2">
              {(cfg?.providers ?? []).map((p) => (
                <button key={p} onClick={() => setProvider(p)} className={`glass rounded-2xl p-3 text-start ${provider === p ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
                  <p className="text-sm font-semibold">{PROVIDER_LABEL[p]}</p><p className="text-xs text-slate-400">Card · transfer · USSD</p></button>
              ))}
            </div>
          </>}
          {cfg && cfg.providers.length === 0 && <p className="text-sm text-rose-300">Top-ups are switched off right now.</p>}
          {me?.profile.kyc !== 'verified' && <p className="text-[11px] text-slate-500">Before identity verification: Naira up to ₦100,000 a day; other currencies up to about ₺3,000 a day.</p>}
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" disabled={minor <= 0 || (!foreign && minor < 1000_00) || busy || !cfg?.providers.length} onClick={start}>{busy && <Loader2 size={18} className="animate-spin" />} See exact amount</button>
          <p className="text-center text-[11px] text-slate-500">{foreign ? 'Minimum about ₺100.' : 'Minimum ₦1,000.'} The fee is shown before you pay.</p>
        </div>
      )}
    </Sheet>
  )
}

/* ------------------------------- withdraw ------------------------------- */

/** Keep in sync with LIMITS.minWithdraw in supabase/functions/_shared/money.ts. */
const MIN_WITHDRAW = 300_00

export function WithdrawSheet({ onClose }: { onClose: () => void }) {
  const { me, refresh } = useLive()
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([])
  const [q, setQ] = useState('')
  const [bank, setBank] = useState<{ code: string; name: string } | null>(null)
  const [acct, setAcct] = useState('')
  const [name, setName] = useState<{ accountName: string; matches: boolean } | null>(null)
  const [amt, setAmt] = useState('')
  const [err, setErr] = useState('')
  const [review, setReview] = useState(false)
  const [result, setResult] = useState('')
  const [resultMsg, setResultMsg] = useState('')
  const [feeTry, setFeeTry] = useState<number | null>(null) // set by the server (GET config) in lira; never decided in the app
  const [mid, setMid] = useState<number | null>(null)
  useEffect(() => { liveConfig().then((c) => setFeeTry(c.fees.withdraw)).catch(() => {}); api<{ ngnPerTry: number }>('GET', 'rate').then((r) => setMid(r.ngnPerTry)).catch(() => {}) }, [])
  const verified = me?.profile.kyc === 'verified'
  useEffect(() => { if (verified) api('GET', 'banks').then((r) => setBanks(r.banks)).catch((e) => setErr(errMsg(e))) }, [verified])
  useEffect(() => {
    if (!bank || acct.length !== 10) return
    let alive = true
    api('POST', 'resolve', { account: acct, bankCode: bank.code }).then((r) => alive && setName(r)).catch((e) => alive && setErr(errMsg(e)))
    return () => { alive = false }
  }, [bank, acct])
  const shown = useMemo(() => (q.trim() ? banks.filter((b) => b.name.toLowerCase().includes(q.toLowerCase())) : [...banks].sort((a, b) => popularity(a.name) - popularity(b.name))).slice(0, 8), [banks, q])
  const minor = parseMinor(amt), bal = me?.balances.NGN ?? 0
  // The fee is priced in lira: from the Lira wallet when it has enough, otherwise the same value in Naira (the server decides the same way).
  const fromLira = feeTry !== null && (me?.balances.TRY ?? 0) >= feeTry
  const feeNgn = feeTry === null ? null : fromLira ? 0 : mid ? Math.ceil(feeTry * mid) : null
  const fee = feeNgn
  const feeText = feeTry === null ? '…' : fromLira ? `${money(feeTry, 'TRY')} from your Lira wallet` : `${money(feeTry, 'TRY')} (≈ ${money(feeNgn ?? 0, 'NGN')})`
  const ready = fee !== null && !!bank && !!name?.matches && minor >= MIN_WITHDRAW && minor + fee <= bal

  return (
    <Sheet open onClose={onClose} title="Withdraw to your bank">
      {!verified ? <LiveKyc /> : review ? (
        <ReviewAndPin
          rows={[['To', <span key="to">{name!.accountName}<br /><span className="text-xs text-slate-400">{bank!.name} · {acct}</span></span>], ['Amount', money(minor, 'NGN')], ['Luda fee', feeText], ['Leaves your Naira wallet', <b key="v">{money(minor + (fee ?? 0), 'NGN')}</b>]]}
          warning="Check the account carefully. Money sent to a bank can't be pulled back by Luda."
          holdLabel="Hold to withdraw"
          run={async (auth) => { const r = await api('POST', 'withdraw', { amountMinor: minor, account: acct, bankCode: bank!.code, bankName: bank!.name, ...auth }); setResult(r.status); setResultMsg(r.message ?? ''); await refresh() }}
          done={<Success title={result === 'failed' ? 'Withdrawal didn\'t go through' : result === 'paid' ? 'Sent to your bank 🎉' : 'Withdrawal on its way'} sub={result === 'failed' ? resultMsg || 'Your money is back in your wallet.' : result === 'processing' ? 'It usually arrives in your account in 2–5 minutes. You\'ll get a notification, and you can follow it in your history.' : undefined} onClose={onClose} />}
          onClose={() => setReview(false)} />
      ) : (
        <div className="flex flex-col gap-3">
          {!bank ? <>
            <div className="relative"><Search size={16} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" /><input className="input ps-11" placeholder="Search your bank" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="flex flex-col gap-1">{shown.map((b) => <button key={b.code} className="glass flex items-center gap-3 rounded-xl p-3 text-start text-sm" onClick={() => setBank(b)}><BankBadge name={b.name} />{b.name}</button>)}</div>
            {!banks.length && !err && <Loader2 className="mx-auto animate-spin text-slate-500" />}
          </> : <>
            <button className="glass flex items-center gap-3 rounded-xl p-3 text-start text-sm" onClick={() => { setBank(null); setName(null) }}><BankBadge name={bank.name} />{bank.name}<span className="ms-auto text-xs text-mint-300">Change</span></button>
            <input className="input font-mono tracking-widest" inputMode="numeric" maxLength={10} placeholder="10-digit account number" value={acct} onChange={(e) => { setAcct(e.target.value.replace(/\D/g, '')); setName(null); setErr('') }} />
            {name && (name.matches
              ? <p className="flex items-center gap-2 rounded-xl bg-mint-400/10 p-3 text-sm text-mint-200"><BadgeCheck size={16} /> {name.accountName}</p>
              : <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{name.accountName}: this isn't your account. You can only withdraw to an account in your verified name ({me?.profile.kycName}).</p>)}
            <input className="input text-xl font-bold" inputMode="numeric" placeholder="₦ amount" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ''))} />
            <p className="flex items-start gap-2 text-xs text-slate-400"><span className="flex-1">Available {money(bal, 'NGN')} · fee {feeText} · minimum {money(MIN_WITHDRAW, 'NGN')}</span><InfoTip slug="tip-withdraw" /></p>
            {minor + (fee ?? 0) > bal && minor > 0 && <p className="text-sm text-rose-300">Not enough in your Naira wallet (amount + fee).</p>}
          </>}
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" disabled={!ready} onClick={() => setReview(true)}>Review withdrawal</button>
        </div>
      )}
    </Sheet>
  )
}

/* -------------------------------- convert -------------------------------- */

export function ConvertSheet({ onClose, initialFrom = 'NGN' }: { onClose: () => void; initialFrom?: Cur }) {
  const { me, refresh } = useLive()
  const [from, setFrom] = useState<Cur>(initialFrom)
  const to: Cur = from === 'NGN' ? 'TRY' : 'NGN'
  const [amt, setAmt] = useState('')
  const [q, setQ] = useState<{ out: number; rate: number; margin: number; capped?: boolean; fromBought?: number; minor: number } | null>(null)
  const [err, setErr] = useState('')
  const [review, setReview] = useState(false)
  const minor = parseMinor(amt), bal = me?.balances[from] ?? 0
  // The quote comes from the server (it knows how much of your lira was bought with Instant: spend-only).
  useEffect(() => {
    if (minor <= 0 || minor > bal) { setQ(null); return }
    setErr('')
    const t = setTimeout(() => { api<{ out: number; rate: number; margin: number; capped?: boolean; fromBought?: number }>('GET', `convert-quote?from=${from}&amount=${minor}`).then((r) => setQ({ ...r, minor })).catch((e) => { setQ(null); setErr(errMsg(e)) }) }, 350)
    return () => clearTimeout(t)
  }, [from, minor, bal])
  const out = q && q.minor === minor ? q.out : 0
  const fx = me?.fx
  return (
    <Sheet open onClose={onClose} title="Convert">
      {review && q ? (
        <ReviewAndPin rows={[['You give', money(minor, from)], ['You get', <b key="v">{money(out, to)}</b>], ['Rate', `₺1 = ₦${q.rate.toFixed(2)}`], ['Luda fee', `${+(q.margin * 100).toFixed(2)}%, included`], ...(from === 'NGN' ? [['Spend-only lira', 'For bills, tickets, Market, Flash and savings. Can\'t be sent to others.'] as [string, ReactNode]] : [])]}
          holdLabel="Hold to convert" onClose={() => setReview(false)}
          run={async (auth) => { await api('POST', 'convert', { from, to, amountMinor: minor, expectMinor: out, ...auth }); await refresh() }}
          done={<Success title="Converted ✅" sub={`${money(out, to)} added to your ${to === 'NGN' ? 'Naira' : 'Lira'} wallet`} onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-3">
          <Segmented value={from} onChange={(v) => { setFrom(v); setAmt('') }} options={[{ value: 'NGN', label: '₦ → ₺' }, { value: 'TRY', label: '₺ → ₦' }]} />
          <input className="input text-2xl font-bold" inputMode="decimal" placeholder={`${from === 'NGN' ? '₦' : '₺'} amount`} value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} />
          <p className="text-xs text-slate-400">Available {money(bal, from)}{from === 'TRY' && fx && fx.boughtTry > 0 ? ` · ${money(fx.boughtTry, 'TRY')} bought with Instant` : ''}</p>
          {minor > 0 && out > 0 && <p className="rounded-xl bg-fg/[0.04] p-3 text-sm">You get <b>{money(out, to)}</b></p>}
          {from === 'NGN' && <p className="flex items-start gap-2 rounded-xl bg-sky-400/10 p-3 text-xs text-sky-100"><span className="flex-1">Lira you buy here is <b>for spending in Luda</b>: bills, bus tickets, Market, Flash and savings. It can't be sent to other people, and changing it back gives at most the Naira you paid. Limit ₺5,000 a day.</span><InfoTip slug="tip-spend-only" /></p>}
          {from === 'TRY' && q?.capped && <p className="rounded-xl bg-gold-400/10 p-3 text-xs text-gold-100">Part of this is lira you bought with Instant, so you get back the Naira you paid for it, not today's higher amount.</p>}
          {minor > bal && <p className="text-sm text-rose-300">Not enough in your {from === 'NGN' ? 'Naira' : 'Lira'} wallet.</p>}
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" disabled={!q || minor <= 0 || minor > bal || out <= 0} onClick={() => setReview(true)}>Review</button>
        </div>
      )}
    </Sheet>
  )
}

/* ---------------------------------- send ---------------------------------- */

export function SendSheet({ onClose, to: initialTo = '' }: { onClose: () => void; to?: string }) {
  const { me, refresh } = useLive()
  const [to, setTo] = useState(initialTo)
  const [who, setWho] = useState<{ username: string; fullName: string; verified: boolean } | null>(null)
  const [cur, setCur] = useState<Cur>('TRY')
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [review, setReview] = useState(false)
  const verified = me?.profile.kyc === 'verified'
  useEffect(() => {
    const u = to.trim().replace(/^@/, '').toLowerCase()
    if (u.length < 3) return
    let alive = true
    const t = setTimeout(() => api('GET', `user?u=${encodeURIComponent(u)}`).then((r) => alive && (setWho(r), setErr(''))).catch((e) => alive && (setWho(null), setErr(errMsg(e)))), 400)
    return () => { alive = false; clearTimeout(t) }
  }, [to])
  const minor = parseMinor(amt), bal = cur === 'TRY' && me?.fx ? Math.min(me.balances.TRY ?? 0, me.fx.freeTry) : me?.balances[cur] ?? 0 // bought lira is spend-only
  return (
    <Sheet open onClose={onClose} title="Send money">
      {!verified ? <LiveKyc /> : review ? (
        <ReviewAndPin rows={[['To', <span key="to">{who!.fullName}<br /><span className="text-xs text-slate-400">@{who!.username}</span></span>], ['Amount', <b key="v">{money(minor, cur)}</b>], ...(note ? [['Note', note] as [string, ReactNode]] : [])]}
          warning="Only send to people you know. Luda can't reverse a transfer to another user."
          holdLabel="Hold to send" onClose={() => setReview(false)}
          run={async (auth) => { await api('POST', 'send', { to: who!.username, currency: cur, amountMinor: minor, note, ...auth }); await refresh() }}
          done={<Success title="Sent 💸" sub={`${money(minor, cur)} to @${who!.username}`} onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-3">
          <input className="input" placeholder="@username" autoCapitalize="none" value={to} onChange={(e) => { setTo(e.target.value); setWho(null) }} />
          {who && <p className="flex items-center gap-2 rounded-xl bg-fg/[0.04] p-3 text-sm">{who.fullName} {who.verified && <BadgeCheck size={14} className="text-mint-300" />}</p>}
          <Segmented value={cur} onChange={setCur} options={[{ value: 'TRY', label: '₺ Lira' }, { value: 'NGN', label: '₦ Naira' }]} />
          <input className="input text-2xl font-bold" inputMode="decimal" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} />
          <p className="text-xs text-slate-400">{cur === 'TRY' && me?.fx && me.fx.boughtTry > 0 ? `You can send ${money(bal, cur)} · ${money(me.fx.boughtTry, 'TRY')} bought with Instant is for spending in Luda only` : `Available ${money(bal, cur)}`}</p>
          <input className="input" maxLength={80} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <p className="text-sm text-rose-300">{err}</p>}
          {minor > bal && <p className="text-sm text-rose-300">Not enough money in this wallet.</p>}
          <button className="btn-primary py-4" disabled={!who || minor <= 0 || minor > bal} onClick={() => setReview(true)}>Review</button>
        </div>
      )}
    </Sheet>
  )
}
