// Live: Flash help with escrow. The reward is held from the poster's wallet when the job is posted, so helpers
// know the money is real; the helper is paid when the poster confirms (or automatically after 3 days).
import { BadgeCheck, LifeBuoy, MapPin, Plus, Zap } from 'lucide-react'
import { useState } from 'react'
import { Empty, Pill, Tabs, ago, lira, toMinor, useApi } from '../components/LiveKit'
import { LiveKyc, ReviewAndPin, errMsg } from '../components/LiveMoney'
import { CasesHub } from '../components/LiveSupport'
import { Header, Sheet, Success } from '../components/ui'
import { CITIES } from '../lib/data'
import { api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'

interface Job { id: string; title: string; details: string; city: string; reward_minor: number; status: 'open' | 'taken' | 'done' | 'cancelled'; created_at: string; taken_at: string | null; poster_name?: string; helper_name?: string; mine: boolean }
interface Board { open: Job[]; mine: Job[]; helping: Job[]; feePct: number }
const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? ''
const REWARDS = [50, 100, 200, 500]

export default function LiveFlash() {
  const { s } = useStore()
  const { refresh } = useLive()
  const [tab, setTab] = useState<'board' | 'mine' | 'helping'>('board')
  const [here, setHere] = useState(true)
  const { data, reload } = useApi<Board>(`flash${here ? `?city=${s.city}` : ''}`)
  const [post, setPost] = useState(false)
  const [view, setView] = useState<Job | null>(null)
  const done = () => { reload(); void refresh() }
  const toPay = (data?.mine ?? []).filter((j) => j.status === 'taken').length
  const board = (data?.open ?? []).filter((j) => !j.mine)

  return (
    <div className="pb-8">
      <Header back title="Flash help" sub="Quick paid help from students nearby" right={<button className="btn-primary px-4 py-2.5 text-sm" onClick={() => setPost(true)}><Plus size={16} /> Ask</button>} />
      <div className="flex flex-col gap-4 px-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'board', label: 'Jobs' }, { value: 'mine', label: 'My requests', badge: toPay }, { value: 'helping', label: "I'm helping" }]} />
        {tab === 'board' && <>
          <button onClick={() => setHere(!here)} className={`chip self-start py-2 ${here ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}><MapPin size={12} /> {here ? cityName(s.city) || 'My city' : 'All cities'}</button>
          {!data ? <p className="text-sm text-slate-500">Loading…</p> : board.length === 0
            ? <Empty emoji="⚡" title="No open jobs right now" sub="Need a hand? Post a job. The reward is held safely until it's done." action={<button className="btn-primary mt-2 px-5 py-3" onClick={() => setPost(true)}><Plus size={16} /> Ask for help</button>} />
            : board.map((j) => (
              <button key={j.id} className="card flex items-center gap-3 text-start" onClick={() => setView(j)}>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-300 to-amber-500 text-ink-950"><Zap size={22} /></span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{j.title}</p><p className="truncate text-xs text-slate-400">@{j.poster_name}{j.city ? ` · ${cityName(j.city)}` : ''} · {ago(j.created_at)}</p></div>
                <p className="text-lg font-extrabold text-mint-300">{lira(j.reward_minor)}</p>
              </button>))}
        </>}
        {tab === 'mine' && (data?.mine.length ? data.mine.map((j) => <MyJob key={j.id} j={j} onChange={done} />) : <Empty emoji="🙋🏾" title="No requests yet" sub="Moving, a parcel, a quick errand: ask and pay only when it's done." />)}
        {tab === 'helping' && (data?.helping.length ? data.helping.map((j) => <Helping key={j.id} j={j} feePct={data.feePct} onChange={done} />) : <Empty emoji="💪🏿" title="You're not helping anyone yet" sub="Take a job from the board and earn into your wallet." />)}
      </div>
      {post && <PostSheet onClose={() => setPost(false)} onDone={() => { done(); setTab('mine') }} />}
      {view && <TakeSheet j={view} feePct={data?.feePct ?? 0.05} onClose={() => setView(null)} onDone={() => { done(); setTab('helping') }} />}
    </div>
  )
}

function PostSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { s } = useStore()
  const { me } = useLive()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [reward, setReward] = useState('100')
  const [review, setReview] = useState(false)
  const r = toMinor(reward), bal = me?.balances.TRY ?? 0
  return (
    <Sheet open onClose={onClose} title="Ask for help">
      {review ? (
        <ReviewAndPin holdLabel={`Hold to post · ${lira(r)}`} onClose={() => setReview(false)}
          rows={[['Job', title], ['Reward (held now)', <b key="r">{lira(r)}</b>], ['Where', cityName(s.city)]]}
          warning="The reward leaves your Lira wallet now and is held by Luda. You pay the helper by tapping Job done. Cancel before anyone takes it to get it back."
          run={async (auth) => { await api('POST', 'flash-post', { title, details, city: s.city, rewardMinor: r, ...auth }); onDone() }}
          done={<Success title="Posted ⚡" sub="Students nearby can now take your job." onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <input className="input" placeholder="What do you need? (e.g. Help carry a fridge)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} />
          <textarea className="input min-h-24" placeholder="Where, when, anything the helper should know" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={400} />
          <p className="label">Reward</p>
          <div className="flex flex-wrap gap-2">{REWARDS.map((v) => <button key={v} onClick={() => setReward(String(v))} className={`chip py-2 ${reward === String(v) ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>₺{v}</button>)}</div>
          <input className="input text-lg font-bold" value={reward} onChange={(e) => setReward(e.target.value)} inputMode="numeric" />
          {r > bal && <p className="text-xs text-rose-300">Not enough in your Lira wallet ({lira(bal)}).</p>}
          <button className="btn-primary py-4" disabled={title.trim().length < 5 || r < 20_00 || r > bal} onClick={() => setReview(true)}>Review</button>
        </div>
      )}
    </Sheet>
  )
}

function TakeSheet({ j, feePct, onClose, onDone }: { j: Job; feePct: number; onClose: () => void; onDone: () => void }) {
  const { me } = useLive()
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const take = async () => { try { await api('POST', 'flash-take', { id: j.id }); setOk(true); onDone() } catch (e) { setErr(errMsg(e)) } }
  if (me?.profile.kyc !== 'verified') return <Sheet open onClose={onClose} title="Verify to earn"><p className="mb-3 text-sm text-slate-300">Helpers verify their ID once, so everyone stays safe.</p><LiveKyc onDone={onClose} /></Sheet>
  return (
    <Sheet open onClose={onClose} title={j.title}>
      {ok ? <Success title="It's yours! 💪🏿" sub={`Do the job, then ask @${j.poster_name} to tap Job done. You'll get ${lira(j.reward_minor - Math.round(j.reward_minor * feePct))}.`} onClose={onClose} /> : (
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-3xl font-extrabold text-mint-300">{lira(j.reward_minor)}</p>
          {j.details && <p className="whitespace-pre-line text-sm text-slate-300">{j.details}</p>}
          <p className="flex items-center gap-2 text-sm text-slate-400"><BadgeCheck size={16} className="text-mint-300" /> Reward already held by Luda · posted by @{j.poster_name}</p>
          <p className="text-xs text-slate-400">You receive {lira(j.reward_minor - Math.round(j.reward_minor * feePct))} after Luda's {Math.round(feePct * 100)}% fee.</p>
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" onClick={take}>Take this job</button>
        </div>
      )}
    </Sheet>
  )
}

function MyJob({ j, onChange }: { j: Job; onChange: () => void }) {
  const [pay, setPay] = useState(false)
  const [help, setHelp] = useState(false)
  const [err, setErr] = useState('')
  const cancel = async () => { if (!confirm('Cancel this job? The reward comes back to your wallet.')) return; try { await api('POST', 'flash-cancel', { id: j.id }); onChange() } catch (e) { setErr(errMsg(e)) } }
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate font-semibold">{j.title}</p><p className="font-extrabold text-mint-300">{lira(j.reward_minor)}</p></div>
      <div>{j.status === 'open' && <Pill tone="wait">Waiting for a helper</Pill>}{j.status === 'taken' && <Pill tone="wait">@{j.helper_name} is on it</Pill>}{j.status === 'done' && <Pill tone="ok">Done · paid @{j.helper_name}</Pill>}{j.status === 'cancelled' && <Pill tone="back">Cancelled · refunded</Pill>}</div>
      {j.status === 'open' && <button className="btn-ghost py-2.5 text-sm" onClick={cancel}>Cancel & get reward back</button>}
      {j.status === 'taken' && <div className="flex gap-2"><button className="btn-primary flex-1 py-3 text-sm" onClick={() => setPay(true)}>Job done · pay @{j.helper_name}</button><button className="btn-ghost px-4 py-3 text-sm" onClick={() => setHelp(true)}><LifeBuoy size={15} /> Problem</button></div>}
      {err && <p className="text-xs text-rose-300">{err}</p>}
      {pay && <Sheet open onClose={() => setPay(false)} title="Pay your helper">
        <ReviewAndPin holdLabel="Hold to pay" onClose={() => setPay(false)} rows={[['Job', j.title], ['Helper', `@${j.helper_name}`], ['Reward', lira(j.reward_minor)]]}
          run={async (auth) => { await api('POST', 'flash-done', { id: j.id, ...auth }); onChange() }} done={<Success title="Paid! Thanks for using Flash ⚡" onClose={() => setPay(false)} />} />
      </Sheet>}
      {help && <CasesHub start="new" category="payment" reference={j.id} subject={`Problem with Flash job "${j.title}"`} onClose={() => setHelp(false)} />}
    </div>
  )
}

function Helping({ j, feePct, onChange }: { j: Job; feePct: number; onChange: () => void }) {
  const [err, setErr] = useState('')
  const drop = async () => { if (!confirm("Give this job back? It goes back on the board.")) return; try { await api('POST', 'flash-drop', { id: j.id }); onChange() } catch (e) { setErr(errMsg(e)) } }
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate font-semibold">{j.title}</p><p className="font-extrabold text-mint-300">{lira(j.reward_minor - Math.round(j.reward_minor * feePct))}</p></div>
      <p className="text-xs text-slate-400">for @{j.poster_name}{j.city ? ` · ${cityName(j.city)}` : ''}</p>
      {j.details && <p className="text-sm text-slate-300">{j.details}</p>}
      <div>{j.status === 'taken' && <Pill tone="wait">In progress · paid when @{j.poster_name} confirms (or after 3 days)</Pill>}{j.status === 'done' && <Pill tone="ok">Paid to your wallet</Pill>}{j.status === 'cancelled' && <Pill tone="back">Cancelled</Pill>}</div>
      {j.status === 'taken' && <button className="btn-ghost py-2.5 text-sm" onClick={drop}>I can't do it</button>}
      {err && <p className="text-xs text-rose-300">{err}</p>}
    </div>
  )
}
