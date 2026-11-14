// Live Flash help (v1.29.0, owner 2026-11-14). Someone posts what they need (with a starting budget, photos and an
// optional video of the problem) and chooses to pay through Luda or in cash. Verified helpers chat with them and
// send their own price. Only the ACCEPTED price is held by Luda (nothing when posting); a short wallet is told to
// top up. The helper marks the job finished with photos; the poster confirms (Luda pays the helper) or it completes
// automatically 3 days later unless a problem is reported. Everything lives on the server; the phone only shows it.
import { BadgeCheck, Banknote, Camera, ChevronRight, LifeBuoy, Lock, MapPin, Plus, Send, ShieldCheck, Video, Zap } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Empty, Pill, Tabs, ago, lira, toMinor, useApi } from '../components/LiveKit'
import { LiveKyc, ReviewAndPin, errMsg } from '../components/LiveMoney'
import { Attachments, CasesHub, type Upload } from '../components/LiveSupport'
import { Header, Sheet, Success } from '../components/ui'
import { CITIES } from '../lib/data'
import { JOB_EMOJI_PICK, jobEmoji } from '../lib/jobEmoji'
import { api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'
import { RateButton } from '../components/Ratings'
import { HelpChip } from '../components/HelpCenter'

type Pay = 'luda' | 'cash'
interface Job {
  id: string; emoji?: string; title: string; details: string; city: string; reward_minor: number; pay: Pay; status: 'open' | 'taken' | 'done' | 'cancelled'
  created_at: string; taken_at: string | null; done_at: string | null; agreed_minor: number | null; poster_name?: string; helper_name?: string | null
  mine: boolean; is_helper: boolean; photo_count: number; has_video: boolean; quotes: number; threads: number; my_quote: number | null; cover?: string | null; legacy?: boolean
}
interface Msg { id: string; kind: 'text' | 'quote' | 'system'; body: string; amount_minor: number | null; quote_status: string | null; files: (string | null)[]; video: string | null; created_at: string; from: 'poster' | 'helper' | 'luda' }
interface Thread { helper_id: string; helper_name: string; last_at: string; messages: Msg[] }
interface JobFull extends Omit<Job, 'threads'> { photos: (string | null)[]; video: string | null; done_photos: (string | null)[]; done_note: string; threads: Thread[] }
interface Board { open: Job[]; mine: Job[]; helping: Job[]; talking: Job[]; feePct: number }
const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? ''
const BUDGETS = [100, 200, 500, 1000]

/** Uploads a video straight to Luda's private storage (one-time link from the server); returns its storage path. */
async function uploadVideo(f: File, onPct: (n: number) => void) {
  const r = await api<{ path: string; uploadUrl: string }>('POST', 'flash-video-start', { type: f.type || 'video/mp4', size: f.size })
  await new Promise<void>((ok, bad) => {
    const x = new XMLHttpRequest(); x.open('PUT', r.uploadUrl); x.setRequestHeader('content-type', f.type || 'video/mp4')
    x.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100))
    x.onload = () => (x.status < 300 ? ok() : bad(new Error('Upload failed, try again'))); x.onerror = () => bad(new Error('Upload failed, check your connection'))
    x.send(f)
  })
  return r.path
}
const PayTag = ({ pay }: { pay: Pay }) => pay === 'cash'
  ? <span className="chip bg-gold-400/15 py-0.5 text-[10px] text-gold-200"><Banknote size={11} /> Cash</span>
  : <span className="chip bg-mint-400/15 py-0.5 text-[10px] text-mint-200"><ShieldCheck size={11} /> Paid via Luda</span>

export default function LiveFlash() {
  const { s } = useStore()
  const { me } = useLive()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'board' | 'mine' | 'helping'>('board')
  const [here, setHere] = useState(false)
  const { data, reload } = useApi<Board>(`flash${here ? `?city=${s.city}` : ''}`)
  const [post, setPost] = useState(params.get('new') === '1')
  // old links (/flash?id=…) open the job page
  useEffect(() => { const id = params.get('id'); if (id) nav(`/flash/${id}`, { replace: true }) }, [params, nav])
  const mineAction = (data?.mine ?? []).filter((j) => j.quotes > 0 || (j.status === 'taken' && j.done_at)).length
  const board = (data?.open ?? []).filter((j) => !j.mine).sort((a, b) => Number(b.city === s.city) - Number(a.city === s.city))
  const helping = [...(data?.helping ?? []), ...(data?.talking ?? []).filter((t) => !(data?.helping ?? []).some((h) => h.id === t.id))]

  return (
    <div className="pb-8">
      <Header back title="Flash help" sub="Quick paid help from people nearby" right={<div className="flex items-center gap-2"><HelpChip topic="market" /><button className="btn-primary px-4 py-2.5 text-sm" onClick={() => setPost(true)}><Plus size={16} /> Ask</button></div>} />
      <div className="flex flex-col gap-4 px-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'board', label: 'Requests' }, { value: 'mine', label: 'My requests', badge: mineAction }, { value: 'helping', label: "I'm helping" }]} />
        {tab === 'board' && <>
          <button onClick={() => setHere(!here)} className={`chip self-start py-2 ${here ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}><MapPin size={12} /> {here ? cityName(s.city) || 'My city' : 'All cities'}</button>
          {!data ? <p className="text-sm text-slate-500">Loading…</p> : board.length === 0
            ? <Empty emoji="⚡" title="No open requests right now" sub="Need a plumber, a hand moving, an errand? Ask, agree a price in the chat, and pay only when it's done." action={<button className="btn-primary mt-2 px-5 py-3" onClick={() => setPost(true)}><Plus size={16} /> Ask for help</button>} />
            : <>
              {me && me.profile.kyc !== 'verified' && <Link to="/wallet" className="flex items-center gap-3 rounded-2xl border border-mint-400/30 bg-mint-400/[0.08] p-3 text-start"><Lock size={18} className="shrink-0 text-mint-300" /><span className="flex-1 text-sm"><b>{`Paid jobs waiting: ${board.length}`}</b><br /><span className="text-xs text-slate-400">Verify your ID once (about 2 minutes) to chat, send your price and get paid.</span></span><span className="text-xs font-bold text-mint-300">Verify</span></Link>}
              {[['near', board.filter((j) => !j.city || j.city === s.city)], ['far', board.filter((j) => j.city && j.city !== s.city)]].map(([k, list]) => (list as Job[]).length > 0 && (
                <div key={k as string} className="flex flex-col gap-2">
                  <p className="label">{k === 'near' ? `📍 In ${cityName(s.city) || 'your city'}` : '🚗 Other cities · can you get there?'}</p>
                  {(list as Job[]).map((j) => <JobCard key={j.id} j={j} far={k === 'far'} locked={me?.profile.kyc !== 'verified'} />)}
                </div>))}
            </>}
        </>}
        {tab === 'mine' && (data?.mine.length ? data.mine.map((j) => <JobCard key={j.id} j={j} />) : <Empty emoji="🙋🏾" title="No requests yet" sub="Post what you need. Helpers chat with you and send their price; you choose." />)}
        {tab === 'helping' && (helping.length ? helping.map((j) => <JobCard key={j.id} j={j} />) : <Empty emoji="💪🏿" title="You're not helping anyone yet" sub="Open a request, chat with the person and send your price." />)}
      </div>
      {post && <PostSheet onClose={() => { setPost(false); if (params.get('new')) setParams({}, { replace: true }) }} onDone={(id) => { reload(); nav(`/flash/${id}`) }} />}
    </div>
  )
}

function JobCard({ j, far, locked }: { j: Job; far?: boolean; locked?: boolean }) {
  const status = j.mine
    ? j.status === 'open' ? (j.quotes ? <Pill tone="wait">{j.quotes === 1 ? '1 price to look at' : `${j.quotes} prices to look at`}</Pill> : j.threads ? <Pill tone="wait">People are asking</Pill> : <Pill tone="wait">Waiting for helpers</Pill>)
      : j.status === 'taken' ? (j.done_at ? <Pill tone="ok">Finished · confirm</Pill> : <Pill tone="wait">@{j.helper_name} is on it</Pill>)
      : j.status === 'done' ? <Pill tone="ok">Done</Pill> : <Pill tone="back">Cancelled</Pill>
    : j.is_helper ? (j.status === 'taken' ? (j.done_at ? <Pill tone="wait">Waiting for @{j.poster_name} to confirm</Pill> : <Pill tone="wait">Your price was accepted</Pill>) : j.status === 'done' ? <Pill tone="ok">Done</Pill> : <Pill tone="back">Cancelled</Pill>)
    : j.my_quote ? <Pill tone="wait">{`Your price: ${lira(j.my_quote)}`}</Pill> : null
  return (
    <Link to={`/flash/${j.id}`} className="card flex items-center gap-3 text-start">
      {j.cover ? <img src={j.cover} alt="" className="size-12 shrink-0 rounded-2xl object-cover" /> : <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-300 to-amber-500 text-2xl text-ink-950">{j.emoji || <Zap size={22} />}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{j.title}</p>
        <p className="truncate text-xs text-slate-400">{j.mine ? '' : `@${j.poster_name} · `}{j.city ? `${cityName(j.city)} · ` : ''}{ago(j.created_at)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1"><PayTag pay={j.pay} />{j.has_video && <span className="chip bg-fg/10 py-0.5 text-[10px] text-slate-300"><Video size={11} /> Video</span>}{far && <span className="chip bg-sky-400/15 py-0.5 text-[10px] text-sky-200">Not in your city</span>}{status}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <p className="text-[10px] text-slate-500">{j.agreed_minor ? 'Agreed' : 'Budget'}</p>
        <p className="text-lg font-extrabold text-mint-300">{lira(j.agreed_minor ?? j.reward_minor)}</p>
        {locked ? <Lock size={13} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
      </div>
    </Link>
  )
}

function PostSheet({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { s } = useStore()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [budget, setBudget] = useState('200')
  const [pay, setPay] = useState<Pay>('luda')
  const [picked, setPicked] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [video, setVideo] = useState<{ path: string; name: string } | null>(null)
  const [pct, setPct] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const vidRef = useRef<HTMLInputElement>(null)
  const emoji = picked || jobEmoji(`${title} ${details}`)
  const b = toMinor(budget)
  const addVideo = async (f?: File) => {
    if (!f) return
    setErr('')
    try { setPct(0); const path = await uploadVideo(f, setPct); setVideo({ path, name: f.name }) } catch (e) { setErr(errMsg(e)) } finally { setPct(null); if (vidRef.current) vidRef.current.value = '' }
  }
  const submit = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api<{ job: { id: string } }>('POST', 'flash-post', { title, details, city: s.city, budgetMinor: b, pay, emoji, files: files.map(({ name, type, data }) => ({ name, type, data })), video: video?.path })
      onDone(r.job.id)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title="Ask for help">
      <div className="flex flex-col gap-3 pb-4">
        <div className="flex items-center gap-2"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-300 to-amber-500 text-2xl">{emoji}</span>
          <input className="input flex-1" placeholder="What do you need? (e.g. Need a plumber)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} /></div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">{JOB_EMOJI_PICK.map((e) => <button key={e} onClick={() => setPicked(e === picked ? '' : e)} className={`grid size-10 shrink-0 place-items-center rounded-xl text-xl ${emoji === e ? 'bg-mint-400/25 ring-1 ring-mint-400/50' : 'bg-fg/[0.05]'}`}>{e}</button>)}</div>
        <textarea className="input min-h-24" placeholder="What's the problem? Where and when? Anything the helper should know" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={600} />
        <p className="label">Show the problem (optional)</p>
        <Attachments files={files} setFiles={setFiles} hint="Photos help helpers see if they can fix it." />
        {video ? <div className="flex items-center justify-between rounded-2xl bg-fg/[0.05] px-3 py-2.5 text-sm"><span className="flex items-center gap-2"><Video size={16} className="text-mint-300" /> Video added</span><button className="text-xs text-slate-400 underline" onClick={() => setVideo(null)}>Remove</button></div>
          : <label className={`flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-fg/20 px-3 py-3 text-sm text-slate-300 ${pct !== null ? 'opacity-60' : ''}`}><Video size={16} /> {pct !== null ? `Uploading video… ${pct}%` : 'Add a short video of the problem (up to 50 MB)'}
            <input ref={vidRef} type="file" accept="video/*" capture="environment" className="hidden" disabled={pct !== null} onChange={(e) => void addVideo(e.target.files?.[0])} /></label>}
        <p className="label">Your budget</p>
        <div className="flex flex-wrap gap-2">{BUDGETS.map((v) => <button key={v} onClick={() => setBudget(String(v))} className={`chip py-2 ${budget === String(v) ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>₺{v}</button>)}</div>
        <input className="input text-lg font-bold" value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" aria-label="Budget in lira" />
        <p className="-mt-1 text-xs text-slate-400">A starting point. Helpers can send their own price in the chat; you choose.</p>
        <p className="label">How will you pay?</p>
        <div className="grid grid-cols-2 gap-2">
          {([['luda', '🔒 Through Luda', 'The price you accept is held safely until the job is done'], ['cash', '💵 Cash', 'Pay the helper in hand when the job is done']] as const).map(([v, l, sub]) => (
            <button key={v} onClick={() => setPay(v)} className={`rounded-2xl p-3 text-start ${pay === v ? 'bg-mint-400/15 ring-1 ring-mint-400/50' : 'bg-fg/[0.05]'}`}><p className="text-sm font-semibold">{l}</p><p className="mt-1 text-[11px] text-slate-400">{sub}</p></button>
          ))}
        </div>
        <p className="text-xs text-slate-500">Nothing leaves your wallet now.</p>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-4" disabled={busy || pct !== null || title.trim().length < 5 || b < 20_00} onClick={() => void submit()}>{busy ? 'Posting…' : 'Post request'}</button>
      </div>
    </Sheet>
  )
}

/* ------------------------------ one request ------------------------------ */

export function LiveFlashJob() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { refresh } = useLive()
  const { data, err, reload } = useApi<{ job: JobFull; feePct: number; kyc: boolean }>(`flash-job?id=${id}`)
  const [open, setOpen] = useState<string | null>(params.get('h'))
  const [help, setHelp] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [finish, setFinish] = useState(false)
  const [msg, setMsg] = useState('')
  // live-ish: refresh the conversation every 8 s while the page is open
  useEffect(() => { const t = setInterval(reload, 8000); return () => clearInterval(t) }, [reload])
  if (err) return <div className="pb-8"><Header back title="Flash help" /><p className="px-5 text-sm text-rose-300">{err}</p></div>
  if (!data) return <div className="pb-8"><Header back title="Flash help" /><p className="px-5 text-sm text-slate-500">Loading…</p></div>
  const j = data.job, fee = data.feePct
  const done = () => { reload(); void refresh() }
  const act = async (route: string, body: Record<string, unknown>, ask?: string) => {
    if (ask && !confirm_(ask)) return
    setMsg(''); try { await api('POST', route, { id: j.id, ...body }); done() } catch (e) { setMsg(errMsg(e)) }
  }
  const myThread = j.mine ? undefined : j.threads[0]
  const amount = j.agreed_minor ?? j.reward_minor
  const helperGets = j.pay === 'luda' ? amount - Math.round(amount * fee) : amount

  return (
    <div className="pb-10">
      <Header back title={j.title} sub={j.mine ? 'Your request' : `@${j.poster_name}${j.city ? ` · ${cityName(j.city)}` : ''}`} />
      <div className="flex flex-col gap-3 px-5">
        <div className="card flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1"><PayTag pay={j.pay} />{j.status === 'open' && <Pill tone="wait">Open</Pill>}{j.status === 'taken' && <Pill tone="wait">{j.done_at ? 'Finished · waiting for confirmation' : `@${j.helper_name} is on it`}</Pill>}{j.status === 'done' && <Pill tone="ok">Done</Pill>}{j.status === 'cancelled' && <Pill tone="back">Cancelled</Pill>}</div>
            <div className="text-end"><p className="text-[10px] text-slate-500">{j.agreed_minor ? 'Agreed price' : 'Budget'}</p><p className="text-2xl font-extrabold text-mint-300">{lira(amount)}</p></div>
          </div>
          {j.details && <p className="whitespace-pre-line text-sm text-slate-300">{j.details}</p>}
          {(j.photos.some(Boolean) || j.video) && <div className="flex flex-wrap gap-2">
            {j.photos.filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer"><img src={u!} alt="Problem photo" className="size-20 rounded-xl object-cover ring-1 ring-fg/10" /></a>)}
            {j.video && <video src={j.video} controls playsInline className="max-h-56 w-full rounded-xl bg-black" />}
          </div>}
          <p className="text-xs text-slate-500"><span>{ago(j.created_at)}</span> · <span>{j.pay === 'luda' ? 'The price you agree is held by Luda, not the budget.' : 'Paid in cash when the job is done.'}</span></p>
        </div>

        {/* finished photos */}
        {j.done_at && <div className="card flex flex-col gap-2 border border-mint-400/30">
          <p className="font-semibold">📸 Finished {ago(j.done_at)}</p>
          {j.done_note && <p className="text-sm text-slate-300">{j.done_note}</p>}
          <div className="flex flex-wrap gap-2">{j.done_photos.filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer"><img src={u!} alt="Finished work" className="size-24 rounded-xl object-cover ring-1 ring-fg/10" /></a>)}</div>
        </div>}

        {/* poster actions */}
        {j.mine && j.status === 'taken' && <div className="card flex flex-col gap-2">
          <p className="text-sm">{j.done_at ? `@${j.helper_name} says the job is finished. Check the photos.` : `@${j.helper_name} is doing the job. When it's done they'll add photos.`}</p>
          <button className="btn-primary py-3.5" onClick={() => setConfirm(true)}>{j.pay === 'cash' ? `Job done · I paid ${lira(amount)} in cash` : `Job done · pay @${j.helper_name} ${lira(amount)}`}</button>
          <button className="btn-ghost py-2.5 text-sm" onClick={() => setHelp(true)}><LifeBuoy size={15} /> Report a problem</button>
          {j.done_at && <p className="text-[11px] text-slate-500">{j.pay === 'luda' ? 'If you do nothing, the helper is paid automatically 3 days after finishing, unless you report a problem.' : 'If you do nothing, the job closes automatically 3 days after finishing.'}</p>}
        </div>}
        {j.mine && j.status === 'open' && <button className="btn-ghost py-2.5 text-sm" onClick={() => void act('flash-cancel', {}, 'Cancel this request?')}>Cancel request</button>}
        {j.mine && j.status === 'done' && j.helper_name && <RateButton kind="flash" refId={j.id} title={`Rate @${j.helper_name}`} sub={j.title} />}

        {/* helper actions */}
        {j.is_helper && j.status === 'taken' && <div className="card flex flex-col gap-2">
          <p className="text-sm">{j.done_at ? `Waiting for @${j.poster_name} to confirm.` : j.pay === 'luda' ? `Your price was accepted and ${lira(amount)} is held by Luda. Do the job, then mark it finished with photos.` : `Your price was accepted: ${lira(amount)} in cash when done. Do the job, then mark it finished with photos.`}</p>
          {j.pay === 'luda' && <p className="text-xs text-slate-400">{`You receive ${lira(helperGets)} after Luda's ${Math.round(fee * 100)}% fee.`}</p>}
          {!j.done_at && <button className="btn-primary py-3.5" onClick={() => setFinish(true)}><Camera size={16} /> Job finished · add photos</button>}
          {!j.done_at && <button className="btn-ghost py-2.5 text-sm" onClick={() => void act('flash-drop', {}, "Give this job back? It goes back on the board and any held money returns to the poster.")}>I can't do it</button>}
        </div>}
        {j.is_helper && j.status === 'done' && <RateButton kind="flash" refId={j.id} title={`Rate @${j.poster_name}`} sub={j.title} />}

        {msg && <p className="text-sm text-rose-300">{msg}</p>}

        {/* conversations */}
        {j.mine ? (
          <div className="flex flex-col gap-2">
            <p className="label">{j.threads.length ? 'Helpers' : 'No one has written yet'}</p>
            {j.threads.map((t) => {
              const q = [...t.messages].reverse().find((m) => m.kind === 'quote')
              return (
                <button key={t.helper_id} onClick={() => setOpen(t.helper_id)} className="card flex items-center gap-3 text-start">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-fg/10 text-sm font-bold">{t.helper_name.slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><p className="font-semibold">@{t.helper_name}</p><p className="truncate text-xs text-slate-400">{t.messages.at(-1)?.body || (t.messages.at(-1)?.kind === 'quote' ? 'Sent a price' : 'Photo or video')}</p></div>
                  {q && <div className="text-end"><p className="font-extrabold text-mint-300">{lira(q.amount_minor ?? 0)}</p><p className="text-[10px] text-slate-500">{q.quote_status === 'pending' ? 'their price' : q.quote_status}</p></div>}
                  <ChevronRight size={14} className="text-slate-500" />
                </button>
              )
            })}
          </div>
        ) : j.status === 'open' || myThread ? (
          !data.kyc ? <div className="card"><p className="mb-3 text-sm text-slate-300">Verify your ID once to chat and send your price. It keeps everyone safe.</p><LiveKyc /></div>
            : <ChatPanel j={j} thread={myThread} helperId={null} feePct={fee} onChange={done} />
        ) : null}
      </div>

      {open && j.mine && (() => { const t = j.threads.find((x) => x.helper_id === open); return t ? (
        <Sheet open onClose={() => setOpen(null)} title={`@${t.helper_name}`}><ChatPanel j={j} thread={t} helperId={t.helper_id} feePct={fee} onChange={done} /></Sheet>) : null })()}
      {confirm && <ConfirmDone j={j} amount={amount} onClose={() => setConfirm(false)} onDone={done} />}
      {finish && <FinishSheet j={j} onClose={() => setFinish(false)} onDone={() => { setFinish(false); done() }} />}
      {help && <CasesHub start="new" category="payment" reference={j.id} subject={`Problem with Flash request "${j.title}"`} onClose={() => setHelp(false)} />}
    </div>
  )
}
const confirm_ = (q: string) => window.confirm(q)

/** The chat between the poster and one helper, with prices. helperId = the thread when the poster is viewing. */
function ChatPanel({ j, thread, helperId, feePct, onChange }: { j: JobFull; thread?: Thread; helperId: string | null; feePct: number; onChange: () => void }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [pct, setPct] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [quote, setQuote] = useState(false)
  const [accept, setAccept] = useState<Msg | null>(null)
  const vidRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [thread?.messages.length])
  const poster = !!helperId
  const canWrite = j.status === 'open' || (j.status === 'taken' && (poster ? j.helper_name === thread?.helper_name : j.is_helper))
  const send = async (extra: Record<string, unknown> = {}) => {
    setBusy(true); setErr('')
    try {
      await api('POST', 'flash-msg', { id: j.id, helper: helperId ?? undefined, body: text.trim() || undefined, files: files.map(({ name, type, data }) => ({ name, type, data })), ...extra })
      setText(''); setFiles([]); onChange()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const sendVideo = async (f?: File) => {
    if (!f) return
    setErr('')
    try { setPct(0); const path = await uploadVideo(f, setPct); await send({ video: path }) } catch (e) { setErr(errMsg(e)) } finally { setPct(null); if (vidRef.current) vidRef.current.value = '' }
  }
  const decline = async (m: Msg) => { setErr(''); try { await api('POST', 'flash-quote-decline', { id: j.id, msgId: m.id }); onChange() } catch (e) { setErr(errMsg(e)) } }
  return (
    <div className="flex flex-col gap-3 pb-2">
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto rounded-2xl bg-fg/[0.03] p-3">
        {!thread?.messages.length && <p className="text-center text-xs text-slate-500">{poster ? 'No messages yet.' : `Ask @${j.poster_name} anything about the job, then send your price.`}</p>}
        {thread?.messages.map((m) => {
          const mine = poster ? m.from === 'poster' : m.from === 'helper'
          if (m.kind === 'system') return <p key={m.id} className="text-center text-[11px] text-slate-400">ℹ️ {m.body}{m.files.filter(Boolean).length > 0 && <span className="mt-1 flex flex-wrap justify-center gap-1">{m.files.filter(Boolean).map((u, i) => <img key={i} src={u!} alt="" className="size-14 rounded-lg object-cover" />)}</span>}</p>
          if (m.kind === 'quote') return (
            <div key={m.id} className={`max-w-[85%] rounded-2xl border p-3 ${mine ? 'self-end' : 'self-start'} ${m.quote_status === 'pending' ? 'border-mint-400/50 bg-mint-400/10' : 'border-fg/10 bg-fg/[0.04]'}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">🧾 Price</p>
              <p className="text-2xl font-extrabold">{lira(m.amount_minor ?? 0)}</p>
              {m.body && <p className="mt-1 whitespace-pre-line text-sm text-slate-300">{m.body}</p>}
              <p className="mt-1 text-[10px] text-slate-500">{m.quote_status === 'pending' ? 'Waiting for an answer' : m.quote_status === 'accepted' ? '✅ Accepted' : m.quote_status === 'declined' ? 'Declined' : 'Replaced by a newer price'} · {ago(m.created_at)}</p>
              {poster && m.quote_status === 'pending' && j.status === 'open' && <div className="mt-2 flex gap-2"><button className="btn-primary flex-1 py-2.5 text-sm" onClick={() => setAccept(m)}>Accept</button><button className="btn-ghost px-3 py-2.5 text-sm" onClick={() => void decline(m)}>Decline</button></div>}
            </div>
          )
          return (
            <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? 'self-end bg-mint-400/15' : 'self-start bg-fg/[0.07]'}`}>
              {m.body && <p className="whitespace-pre-line">{m.body}</p>}
              {m.files.filter(Boolean).length > 0 && <div className="mt-1 flex flex-wrap gap-1">{m.files.filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer"><img src={u!} alt="" className="size-20 rounded-lg object-cover" /></a>)}</div>}
              {m.video && <video src={m.video} controls playsInline className="mt-1 max-h-48 w-full rounded-lg bg-black" />}
              <p className="mt-0.5 text-[10px] text-slate-500">{ago(m.created_at)}</p>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {canWrite && <>
        <Attachments files={files} setFiles={setFiles} />
        <div className="flex items-end gap-2">
          <textarea className="input min-h-12 flex-1 py-3" placeholder="Write a message" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={1} />
          <label className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-2xl bg-fg/[0.06] text-slate-300" aria-label="Send a video"><Video size={18} />
            <input ref={vidRef} type="file" accept="video/*" className="hidden" disabled={pct !== null} onChange={(e) => void sendVideo(e.target.files?.[0])} /></label>
          <button className="btn-primary grid size-12 shrink-0 place-items-center p-0" aria-label="Send" disabled={busy || (!text.trim() && !files.length)} onClick={() => void send()}><Send size={18} /></button>
        </div>
        {pct !== null && <p className="text-xs text-slate-400">{`Uploading video… ${pct}%`}</p>}
        {!poster && j.status === 'open' && <button className="btn-primary py-3.5" onClick={() => setQuote(true)}>🧾 {j.my_quote ? 'Send a new price' : 'Send your price'}</button>}
      </>}
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {quote && <QuoteSheet j={j} feePct={feePct} onClose={() => setQuote(false)} onDone={() => { setQuote(false); onChange() }} />}
      {accept && <AcceptSheet j={j} m={accept} helper={thread?.helper_name ?? ''} onClose={() => setAccept(null)} onDone={onChange} />}
    </div>
  )
}

function QuoteSheet({ j, feePct, onClose, onDone }: { j: JobFull; feePct: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(Math.round(j.reward_minor / 100)))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const a = toMinor(amount)
  const go = async () => { setBusy(true); setErr(''); try { await api('POST', 'flash-quote', { id: j.id, amountMinor: a, note }); onDone() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) } }
  return (
    <Sheet open onClose={onClose} title="Your price">
      <div className="flex flex-col gap-3 pb-4">
        <p className="text-sm text-slate-300">{`@${j.poster_name}'s budget is ${lira(j.reward_minor)}. Send the price you need to do the job, and say why.`}</p>
        <input className="input text-2xl font-extrabold" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" aria-label="Your price in lira" />
        <textarea className="input min-h-24" placeholder="Why this price? (e.g. needs a new part, 2 people, 3 hours)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} />
        {j.pay === 'luda' ? <p className="text-xs text-slate-400">{`If accepted, ${lira(a)} is held by Luda. You receive ${lira(a - Math.round(a * feePct))} after Luda's ${Math.round(feePct * 100)}% fee.`}</p>
          : <p className="text-xs text-slate-400">{`Paid to you in cash (${lira(a)}) when the job is done.`}</p>}
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-4" disabled={busy || a < 20_00} onClick={() => void go()}>Send price</button>
      </div>
    </Sheet>
  )
}

function AcceptSheet({ j, m, helper, onClose, onDone }: { j: JobFull; m: Msg; helper: string; onClose: () => void; onDone: () => void }) {
  const { me } = useLive()
  const amount = m.amount_minor ?? 0
  const bal = me?.balances.TRY ?? 0
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  if (j.pay === 'cash') {
    const go = async () => { setErr(''); try { await api('POST', 'flash-accept', { id: j.id, msgId: m.id }); setOk(true); onDone() } catch (e) { setErr(errMsg(e)) } }
    return (
      <Sheet open onClose={onClose} title="Accept this price">
        {ok ? <Success title="Accepted ✅" sub={`@${helper} can start. Pay ${lira(amount)} in cash when the job is done.`} onClose={onClose} /> : (
          <div className="flex flex-col gap-3 pb-4">
            <p className="text-3xl font-extrabold">{lira(amount)} <span className="text-base font-semibold text-gold-200">in cash</span></p>
            <p className="text-sm text-slate-300">{`You agree to pay @${helper} ${lira(amount)} in cash when the job is done. Luda doesn't hold cash, so only pay once the work is finished.`}</p>
            {err && <p className="text-sm text-rose-300">{err}</p>}
            <button className="btn-primary py-4" onClick={() => void go()}>Accept price</button>
          </div>)}
      </Sheet>
    )
  }
  return (
    <Sheet open onClose={onClose} title="Accept this price">
      {bal < amount ? (
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-sm text-slate-300">{`To accept ${lira(amount)}, top up ${lira(amount - bal)} more. You have ${lira(bal)} in your Lira wallet.`}</p>
          <Link to="/wallet" className="btn-primary py-4">Top up my wallet</Link>
          <button className="btn-ghost py-3 text-sm" onClick={onClose}>Not now</button>
        </div>
      ) : (
        <ReviewAndPin holdLabel={`Hold to accept · ${lira(amount)}`} onClose={onClose}
          rows={[['Job', j.title], ['Helper', `@${helper}`], ['Price (held now)', <b key="p">{lira(amount)}</b>]]}
          warning={err || "This amount leaves your Lira wallet now and is held by Luda. The helper is paid when you confirm the job is done (or 3 days after they finish, unless you report a problem)."}
          run={async (auth) => { try { await api('POST', 'flash-accept', { id: j.id, msgId: m.id, ...auth }); onDone() } catch (e) { setErr(errMsg(e)); throw e } }}
          done={<Success title="Accepted ✅" sub={`${lira(amount)} is held safely. @${helper} can start the job.`} onClose={onClose} />} />
      )}
    </Sheet>
  )
}

function ConfirmDone({ j, amount, onClose, onDone }: { j: JobFull; amount: number; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  if (j.pay === 'cash' && !j.legacy) {
    const go = async () => { setErr(''); try { await api('POST', 'flash-done', { id: j.id }); setOk(true); onDone() } catch (e) { setErr(errMsg(e)) } }
    return (
      <Sheet open onClose={onClose} title="Job done">
        {ok ? <Success title="Done! Thanks for using Flash ⚡" onClose={onClose} /> : <div className="flex flex-col gap-3 pb-4">
          <p className="text-sm text-slate-300">{`Confirm that @${j.helper_name} finished the job and you paid ${lira(amount)} in cash.`}</p>
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" onClick={() => void go()}>Yes, done and paid</button>
        </div>}
      </Sheet>
    )
  }
  return (
    <Sheet open onClose={onClose} title="Pay your helper">
      <ReviewAndPin holdLabel="Hold to pay" onClose={onClose} rows={[['Job', j.title], ['Helper', `@${j.helper_name}`], ['Price', lira(amount)]]}
        run={async (auth) => { await api('POST', 'flash-done', { id: j.id, ...auth }); onDone() }} done={<Success title="Paid! Thanks for using Flash ⚡" onClose={onClose} />} />
    </Sheet>
  )
}

function FinishSheet({ j, onClose, onDone }: { j: JobFull; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<Upload[]>([])
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => { setBusy(true); setErr(''); try { await api('POST', 'flash-finished', { id: j.id, note, files: files.map(({ name, type, data }) => ({ name, type, data })) }); onDone() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) } }
  return (
    <Sheet open onClose={onClose} title="Job finished">
      <div className="flex flex-col gap-3 pb-4">
        <p className="text-sm text-slate-300">{`Take photos of the finished work so @${j.poster_name} can see it's done.`}</p>
        <Attachments files={files} setFiles={setFiles} hint="At least one photo is needed." />
        <textarea className="input min-h-20" placeholder="Anything to add? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        <p className="flex items-center gap-1.5 text-xs text-slate-400"><BadgeCheck size={14} className="text-mint-300" /> {j.pay === 'luda' ? "You're paid when they confirm, or automatically after 3 days unless they report a problem." : 'Collect the cash when they confirm.'}</p>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-4" disabled={busy || !files.length} onClick={() => void go()}>{busy ? 'Sending…' : 'Send photos · job finished'}</button>
      </div>
    </Sheet>
  )
}
