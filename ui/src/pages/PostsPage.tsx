// Trang "Dang bai": bai trong thu muc posts/ (chu, anh, tham do, do vui, chia se video), dang ngay
// hoac len lich len tab Bai dang cua kenh. Lenh: posts_run({ ids, channelKey }), posts_channel(key).
import {
  CalendarClock, Check, CircleAlert, CircleHelp, ExternalLink, FolderOpen, Image as ImageIcon, LayoutGrid,
  ListChecks, LoaderCircle, RefreshCw, Send, SquarePen, SquarePlay, TriangleAlert, Type, Users, Zap, type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { isDemo, type PostItem } from '../api'
import { ActionBar, Button, Card, EmptyState, PageBody, PageHeader, Pill, Select, cn, type Tone } from '../kit'
import type { PageProps } from './index'

type PostType = NonNullable<PostItem['type']>
type PostJob = { status: 'queued' | 'run' | 'done' | 'error' | 'stopped'; step: string; error: string; url: string; line?: string; result?: 'posted' | 'scheduled' | 'duplicate' }
export type PostsState = {
  channelKey: string
  channels: { key: string; name: string; handle: string; ucId: string }[]
  jobs: Record<string, PostJob>
  busy: boolean
  demoPosts?: PostItem[] // chi dung cho ?demo
}

const TYPES: Record<PostType, { label: string; icon: LucideIcon; cls: string }> = {
  text: { label: 'Chữ', icon: Type, cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  image: { label: 'Ảnh', icon: ImageIcon, cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  poll: { label: 'Thăm dò', icon: ListChecks, cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  image_poll: { label: 'Thăm dò ảnh', icon: LayoutGrid, cls: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400' },
  quiz: { label: 'Câu hỏi', icon: CircleHelp, cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  video: { label: 'Video', icon: SquarePlay, cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
}
// cac buoc cua src/flows/post.js (onStep)
const STEPS: [string, string][] = [['open', 'Mở tab Bài đăng'], ['check', 'Kiểm tra trùng'], ['compose', 'Soạn chữ'], ['attach', 'Gắn nội dung'], ['publish', 'Đăng / lên lịch'], ['verify', 'Chờ xác nhận']]
const RESULT: Record<string, string> = { posted: 'Đã đăng', scheduled: 'Đã lên lịch', duplicate: 'Đã có sẵn, bỏ qua' }

const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

function TypeBadge({ type }: { type: PostType }) {
  const t = TYPES[type]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold', t.cls)}>
      <t.icon className="h-3.5 w-3.5" /> {t.label}
    </span>
  )
}

const Chip = ({ icon: Icon, children, tone }: { icon?: LucideIcon; children: ReactNode; tone?: 'primary' }) => (
  <span className={cn('inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold', tone ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
    {Icon && <Icon className="h-3 w-3 shrink-0" />}<span className="truncate">{children}</span>
  </span>
)

const Thumb = ({ src, className }: { src: string; className?: string }) =>
  src ? <img src={src} alt="" className={cn('shrink-0 rounded-md bg-muted object-cover', className)} />
    : <span className={cn('flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground', className)}><ImageIcon className="h-4 w-4 opacity-50" /></span>

// Xem truoc noi dung gan kem theo loai bai
function Attachment({ p }: { p: PostItem }) {
  const type = p.type || 'text'
  if (type === 'image' && p.images.length) {
    return (
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {p.images.slice(0, 10).map((src, i) => <Thumb key={i} src={src} className="h-16 w-16" />)}
      </div>
    )
  }
  if (type === 'poll' && p.options?.length) {
    return (
      <ul className="space-y-1">
        {p.options.map((o, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-1.5 text-sm">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-muted-foreground/40" />
            <span className="truncate">{o.text}</span>
          </li>
        ))}
      </ul>
    )
  }
  if (type === 'image_poll' && p.options?.length) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {p.options.map((o, i) => (
          <figure key={i} className="w-28 overflow-hidden rounded-lg border border-border/60">
            <Thumb src={o.image} className="aspect-square w-full rounded-none" />
            <figcaption className="truncate px-2 py-1 text-xs font-semibold">{o.text}</figcaption>
          </figure>
        ))}
      </div>
    )
  }
  if (type === 'quiz' && p.answers?.length) {
    return (
      <div className="space-y-1">
        <ul className="space-y-1">
          {p.answers.map((a, i) => (
            <li key={i} className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm', a.correct ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border/60')}>
              <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full', a.correct ? 'bg-emerald-500 text-white' : 'border-2 border-muted-foreground/40')}>
                {a.correct && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{a.text}</span>
              {a.image && <Thumb src={a.image} className="h-7 w-7" />}
              {a.correct && <span className="shrink-0 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Đúng</span>}
            </li>
          ))}
        </ul>
        {p.explanation && <p className="text-xs text-muted-foreground"><span className="font-semibold">Giải thích:</span> {p.explanation}</p>}
      </div>
    )
  }
  if (type === 'video' && p.video) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-border/60 p-2">
        <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400"><SquarePlay className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="text-xs font-semibold">Chia sẻ video</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">youtu.be/{p.video}</div>
        </div>
      </div>
    )
  }
  return null
}

function JobLine({ job }: { job: PostJob }) {
  if (job.status === 'done') {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Pill tone="success">{RESULT[job.result || 'posted']}</Pill>
        {job.line && <span className="truncate text-xs text-muted-foreground">{job.line}</span>}
        {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-xs font-semibold text-primary hover:underline"><ExternalLink className="h-3 w-3" />Xem bài</a>}
      </div>
    )
  }
  if (job.status === 'error') return <Pill tone="error" className="max-w-full">{job.error}</Pill>
  if (job.status === 'stopped') return <Pill tone="muted">Đã dừng</Pill>
  if (job.status === 'queued') return <Pill tone="muted">Chờ tới lượt</Pill>
  const at = Math.max(0, STEPS.findIndex(([id]) => id === job.step))
  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> {STEPS[at][1]} <span className="font-normal text-muted-foreground">({at + 1}/{STEPS.length})</span>
      </div>
      <ol className="flex gap-1" aria-label="Tiến độ">
        {STEPS.map(([id, label], i) => (
          <li key={id} title={label} className={cn('h-1.5 flex-1 rounded-full', i < at ? 'bg-primary' : i === at ? 'btn-gradient animate-pulse' : 'bg-muted')} />
        ))}
      </ol>
    </div>
  )
}

function PostCard({ p, job, checked, onCheck, onOpen, canPick }: {
  p: PostItem; job?: PostJob; checked: boolean; onCheck: (v: boolean) => void; onOpen: () => void; canPick: boolean
}) {
  const bad = p.errors.length > 0
  return (
    <article className={cn('rounded-xl border bg-card/40 p-3 transition-colors', bad ? 'border-red-500/30' : checked ? 'border-primary/50 bg-primary/[0.03]' : 'border-border/50')} aria-label={`Bài ${p.dir}`}>
      <div className="flex gap-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-40"
          checked={checked}
          disabled={!canPick}
          aria-label={`Chọn bài ${p.dir}`}
          onChange={(e) => onCheck(e.target.checked)}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeBadge type={p.type || 'text'} />
            {p.when ? <Chip icon={CalendarClock} tone="primary">Lên lịch {fmtWhen(p.when)}</Chip> : <Chip icon={Zap}>Đăng ngay</Chip>}
            {p.channel && <Chip icon={Users}>{p.channel}</Chip>}
            <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground" title={p.dir}>{p.dir}</span>
          </div>
          {p.text ? <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm">{p.text}</p>
            : <p className="text-sm italic text-muted-foreground">(không có chữ)</p>}
          <Attachment p={p} />
          {(p.errors.length > 0 || p.warnings.length > 0) && (
            <ul className="space-y-0.5 text-xs">
              {p.errors.map((e, i) => <li key={`e${i}`} className="flex gap-1.5 text-red-600 dark:text-red-400"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e}</li>)}
              {p.warnings.map((w, i) => <li key={`w${i}`} className="flex gap-1.5 text-amber-700 dark:text-amber-400"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {job ? <div className="min-w-0 flex-1"><JobLine job={job} /></div>
              : <>{bad ? <Pill tone="error">Cần sửa</Pill> : <Pill tone="success">Sẵn sàng</Pill>}<span className="flex-1" /></>}
            <Button variant="subtle" className="h-7 px-2 text-xs" onClick={onOpen} disabled={!p.folder}><FolderOpen /> Mở</Button>
          </div>
        </div>
      </div>
    </article>
  )
}

export function PostsPage({ state, send, go }: PageProps) {
  const s = (state.f.posts as PostsState | undefined) || { channelKey: '', channels: [], jobs: {}, busy: false }
  const posts = isDemo() && s.demoPosts ? s.demoPosts : state.scan.posts
  const [picked, setPicked] = useState<Set<string>>(() => new Set(isDemo() ? ['d2', 'd4', 'd5'] : []))
  const canPick = (p: PostItem) => !p.errors.length && !(s.jobs[p.id] && ['done', 'run', 'queued'].includes(s.jobs[p.id].status))
  const pickable = useMemo(() => posts.filter(canPick), [posts, s]) // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = posts.filter((p) => picked.has(p.id) && canPick(p))
  const toggle = (id: string, v: boolean) => setPicked((old) => { const n = new Set(old); if (v) n.add(id); else n.delete(id); return n })
  const allOn = pickable.length > 0 && pickable.every((p) => picked.has(p.id))
  const counts = posts.reduce<Record<string, number>>((a, p) => { const t = p.type || 'text'; a[t] = (a[t] || 0) + 1; return a }, {})
  const scheduled = posts.filter((p) => p.when).length
  const running = Object.values(s.jobs).filter((j) => j.status === 'run' || j.status === 'queued').length
  const noChannel = s.channels.length === 0

  return (
    <>
      <PageHeader
        icon={SquarePen}
        title="Đăng bài"
        description="Bài đăng cho tab Bài đăng của kênh: chữ, ảnh, thăm dò, câu hỏi, chia sẻ video. Đăng ngay hoặc lên lịch như trên YouTube."
        actions={!noChannel && (
          <div className="w-72 max-w-full shrink-0">
            <Select
              label="Kênh đăng bài"
              value={s.channelKey}
              onChange={(v) => send('posts_channel', v)}
              options={s.channels.map((c) => [c.key, c.handle ? `${c.name} (${c.handle})` : c.name])}
            />
          </div>
        )}
      />
      <PageBody>
        {noChannel && (
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 text-sm">Chưa có kênh nào. Thêm tài khoản Google và tick kênh cần dùng ở trang Tài khoản.</p>
              <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => go('accounts')}>Mở trang Tài khoản</Button>
            </div>
          </Card>
        )}
        {posts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={allOn}
                disabled={!pickable.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(pickable.map((p) => p.id)) : new Set())}
              />
              Chọn tất cả bài sẵn sàng ({pickable.length})
            </label>
            <span className="flex-1" />
            {(Object.keys(TYPES) as PostType[]).filter((t) => counts[t]).map((t) => (
              <span key={t} className="text-[11px] text-muted-foreground">{TYPES[t].label} <b className="text-foreground">{counts[t]}</b></span>
            ))}
            {scheduled > 0 && <span className="text-[11px] text-muted-foreground">· Lên lịch <b className="text-foreground">{scheduled}</b></span>}
          </div>
        )}
        {posts.length === 0 ? (
          <EmptyState icon={SquarePen} text="Chưa có bài nào trong thư mục posts/. Mỗi bài là một thư mục con có noidung.txt (xem HUONG-DAN.txt): ảnh, binhchon.txt cho thăm dò, cauhoi.txt cho câu hỏi." />
        ) : posts.map((p) => (
          <PostCard key={p.id} p={p} job={s.jobs[p.id]} checked={picked.has(p.id) && canPick(p)} canPick={canPick(p)} onCheck={(v) => toggle(p.id, v)} onOpen={() => send('open_path', p.folder)} />
        ))}
      </PageBody>
      <ActionBar>
        <Button
          variant="gradient"
          size="sm"
          disabled={!chosen.length || s.busy || noChannel}
          onClick={() => { send('posts_run', { ids: chosen.map((p) => p.id), channelKey: s.channelKey }); setPicked(new Set()) }}
        >
          {s.busy ? <><LoaderCircle className="animate-spin" /> Đang đăng ({running} bài còn lại)</> : <><Send /> Đăng đã chọn{chosen.length ? ` (${chosen.length})` : ''}</>}
        </Button>
        {s.busy && <Button variant="outline" size="sm" onClick={() => send('stop')}>Dừng</Button>}
        <Button variant="subtle" size="icon-sm" aria-label="Quét lại" title="Quét lại thư mục" disabled={!state.scan.root || s.busy} onClick={() => send('scan')}>
          <RefreshCw />
        </Button>
      </ActionBar>
    </>
  )
}

// ---- du lieu mau cho ?demo#posts ----
const img = (h: number, label: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,55%)"/><stop offset="1" stop-color="hsl(${h + 40},70%,35%)"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><text x="80" y="92" font-family="sans-serif" font-size="26" font-weight="700" fill="white" text-anchor="middle">${label}</text></svg>`,
)}`
const base = { folder: '', date: null, time: null, images: [], errors: [], warnings: [], when: null }
const inDays = (d: number, h: number) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0); return t.toISOString() }
export const postsDemo: PostsState = {
  channelKey: 'UCC0AJ_NoUOq5718yK4_ehBw',
  channels: [
    { key: 'UCC0AJ_NoUOq5718yK4_ehBw', name: 'Dark Bible Stories', handle: '@BibleStoriies', ucId: 'UCC0AJ_NoUOq5718yK4_ehBw' },
    { key: 'UCxkhac000000000000000', name: 'Kênh Phụ', handle: '@kenhphu', ucId: 'UCxkhac000000000000000' },
  ],
  busy: true,
  jobs: {
    d1: { status: 'done', step: '', error: '', url: 'https://www.youtube.com/post/UgkxAbc123', result: 'posted' },
    d3: { status: 'run', step: 'attach', error: '', url: '' },
    d6: { status: 'error', step: '', error: 'YouTube báo: Ảnh không đúng tỷ lệ khung hình.', url: '' },
  },
  demoPosts: [
    { ...base, id: 'd1', dir: 'loi-cam-on', name: 'loi cam on', type: 'text', text: 'Cảm ơn 10.000 người đã đăng ký kênh! 🎉\nTập tiếp theo ra mắt tối thứ 5 lúc 19h, nhớ bật chuông nhé.' },
    { ...base, id: 'd2', dir: '2026-10-29_19h00_bia-moi', name: 'bia moi', type: 'image', when: inDays(3, 19), text: 'Bìa mới cho loạt "Những câu chuyện Cựu Ước". Bạn thấy sao?', images: [img(210, '1'), img(260, '2'), img(20, '3')] },
    { ...base, id: 'd3', dir: 'chon-chu-de', name: 'chon chu de', type: 'poll', text: 'Tập tiếp theo bạn muốn nghe chuyện nào?', options: [{ text: 'Đa-vít và Gô-li-át', image: '' }, { text: 'Giô-na và con cá lớn', image: '' }, { text: 'Đa-ni-ên trong hang sư tử', image: '' }] },
    { ...base, id: 'd4', dir: '2026-10-30_chon-bia', name: 'chon bia', type: 'image_poll', when: inDays(4, 8), text: 'Chọn ảnh bìa cho tập 12:', images: [img(160, 'A'), img(300, 'B')], options: [{ text: 'Bìa tối', image: img(160, 'A') }, { text: 'Bìa sáng', image: img(300, 'B') }], warnings: ['YouTube chỉ cho chọn giờ theo mốc 15 phút: 08:10 được làm tròn thành 08:15.'] },
    { ...base, id: 'd5', dir: 'do-vui-xuat-hanh', name: 'do vui xuat hanh', type: 'quiz', text: 'Ai dẫn dân Y-sơ-ra-ên ra khỏi Ai Cập?', answers: [{ text: 'Áp-ra-ham', image: '', correct: false }, { text: 'Môi-se', image: '', correct: true }, { text: 'Đa-vít', image: img(40, 'Đ'), correct: false }], explanation: 'Môi-se được Chúa gọi từ bụi gai cháy để dẫn dân ra khỏi Ai Cập.' },
    { ...base, id: 'd6', dir: 'anh-dai', name: 'anh dai', type: 'image', text: 'Toàn cảnh thành Giê-ru-sa-lem', images: [img(190, '6:1')], warnings: ['Ảnh "toan-canh.jpg" (3000x500) ngoài tỷ lệ 2:5 đến 5:2, YouTube có thể từ chối.'] },
    { ...base, id: 'd7', dir: 'xem-tap-moi', name: 'xem tap moi', type: 'video', channel: '@kenhphu', video: 'ZyXwVuTsRqP', text: 'Tập mới đã lên sóng, xem ngay nhé!' },
    { ...base, id: 'd8', dir: 'tham-do-thieu', name: 'tham do thieu', type: 'poll', text: 'Bạn xem kênh vào lúc nào?', options: [{ text: 'Buổi sáng', image: '' }], errors: ['Thăm dò cần ít nhất 2 lựa chọn (binhchon.txt có 1).'] },
  ],
}
