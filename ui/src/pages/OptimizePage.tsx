// Trang "Toi uu video": quet video da dang cua kenh, chon video, toi uu trong Studio theo mau
// (mau rieng cua kenh hoac mau mac dinh), roi thich + binh luan + ghim. Trang thai: state.f.optimize.
import { CheckCheck, Layers, ListChecks, LoaderCircle, RefreshCw, RotateCcw, Save, ScanSearch, Sparkles, Square, Undo2, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ActionBar, Button, Card, EmptyState, PageBody, PageHeader, Pill, cn, type Tone } from '../kit'
import { OptimizeTemplateEditor, defaultOptimizeTemplate, templateOf, type OptimizeTemplate, type Templates } from './OptimizeTemplateEditor'
import type { PageProps } from './index'

export type OptVideo = {
  id: string; title: string; visibility: string; date: string; dateNote?: string; views: string | number; comments: string | number
  status: 'new' | 'scan' | 'run' | 'done' | 'error'; step: string; error: string; warnings?: string[]
  missing?: string[] // muc mau con thieu (quet trang Chi tiet video) + viec o trang xem video chua kiem lai duoc (thich / binh luan / ghim)
  note?: string // ghi chu khi quet (doc loi...) / "đã thích và bình luận - chưa ghim" (kenh khong ghim duoc, van tinh la da toi uu)
  unread?: boolean // chua doc duoc trang Chi tiet (toi uu se lam ca mau)
}
// Quet toan bo: 2 video moi nhat cua moi kenh da tick (state.f.optimize.all)
export type OptAllGroup = { key: string; name: string; error: string; videos: OptVideo[] }
export type OptAll = { at: string; running: boolean; current: string; perChannel?: number; groups: OptAllGroup[] }
export type OptimizeState = {
  channelKey: string
  channels: { key: string; name: string; handle: string; ucId: string }[]
  videos: OptVideo[]
  busy: boolean
  at: string
  templates: Templates
  limit?: number // so video moi nhat se quet (settings.optimizeScanLimit)
  limits?: number[]
  all?: OptAll
}
const LIMITS = [5, 10, 20, 30, 50]

const STATUS: Record<OptVideo['status'], [Tone, string]> = {
  new: ['muted', 'Chưa tối ưu'], scan: ['muted', 'Chờ đọc'], run: ['active', 'Đang tối ưu'], done: ['success', 'Đã tối ưu'], error: ['error', 'Lỗi'],
}
// ten muc mau (src/optimize-template.js compareFields) -> chu hien thi
const FIELD_VI: Record<string, string> = {
  playlists: 'danh sách phát', paidPromotion: 'quảng cáo trả phí', ai: 'nội dung AI', remix: 'phối lại Shorts', tags: 'thẻ',
  language: 'ngôn ngữ', recordingDate: 'ngày quay', location: 'vị trí', license: 'giấy phép', embeddable: 'cho phép nhúng',
  category: 'danh mục', comments: 'bình luận', description: 'mô tả', endScreen: 'màn hình kết thúc',
}

// rescan: "Quét lại" o video da toi uu (quet bo qua video lan truoc da toi uu) -> doc lai trang Chi tiet
function VideoRow({ v, on = false, toggle, busy, open, rescan }: { v: OptVideo; on?: boolean; toggle?: () => void; busy: boolean; open: () => void; rescan?: () => void }) {
  const [tone, text] = STATUS[v.status]
  const missing = v.status === 'done' && v.missing && v.missing.length ? v.missing : null
  const warn = v.status === 'done' && ((v.warnings && v.warnings.length > 0) || !!missing)
  return (
    <li className={cn('flex items-start gap-3 rounded-lg px-2 py-2', on ? 'bg-primary/5' : 'hover:bg-muted/40')}>
      {toggle && <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--primary))]" checked={on} disabled={busy} onChange={toggle} aria-label={`Chọn ${v.title}`} />}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={open}
          title={`Mở trang chỉnh sửa video trong Tài khoản trình duyệt\n${v.title}`}
          aria-label={`Mở trang chỉnh sửa video ${v.title}`}
          className="block max-w-full cursor-pointer truncate text-left text-sm font-semibold underline-offset-2 hover:text-primary hover:underline focus-visible:underline focus-visible:outline-none"
        >{v.title}</button>
        <p className="truncate text-[11px] text-muted-foreground">
          {[v.visibility, [v.date, v.dateNote].filter(Boolean).join(' · '), `${v.views} lượt xem`, `${v.comments} bình luận`].filter(Boolean).join('  •  ')}
        </p>
        {v.status === 'error' && v.error && <p className="mt-0.5 line-clamp-2 text-[11px] text-red-600 dark:text-red-400">{v.error}</p>}
        {v.status !== 'run' && v.status !== 'scan' && v.missing && v.missing.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1" title={`Thiếu: ${v.missing.map((k) => FIELD_VI[k] ?? k).join(', ')}`}>
            <span className="text-[11px] font-semibold text-muted-foreground">Thiếu:</span>
            {v.missing.map((k) => <span key={k} className="rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300">{FIELD_VI[k] ?? k}</span>)}
          </div>
        )}
        {v.note && v.status !== 'scan' && <p className={cn('mt-0.5 line-clamp-2 text-[11px]', v.status === 'done' ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')} title={v.note}>{v.note}</p>}
        {(warn || (v.status === 'new' && v.warnings && v.warnings.length > 0)) && <p className="mt-0.5 line-clamp-2 text-[11px] text-amber-600 dark:text-amber-400" title={v.warnings!.join('\n')}>{v.warnings!.join(' · ')}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {v.status === 'run' || (v.status === 'scan' && v.step) ? <Pill tone="active">{v.step || text}</Pill> : <Pill tone={warn ? 'warning' : tone}>{warn ? 'Đã tối ưu, có cảnh báo' : text}</Pill>}
        {rescan && v.status === 'done' && (
          <Button variant="subtle" size="sm" className="h-6 rounded-md px-2 text-[11px]" disabled={busy} onClick={rescan} title="Đọc lại trang Chi tiết của video này (lần quét sau sẽ theo kết quả mới)" aria-label={`Quét lại ${v.title}`}>
            <ScanSearch /> Quét lại
          </Button>
        )}
      </div>
    </li>
  )
}

// Ket qua "Quet toan bo": nhom theo kenh, moi kenh vai video moi nhat + so video theo trang thai
function ScanAllCard({ s, send, go }: { s: OptimizeState; send: PageProps['send']; go: PageProps['go'] }) {
  const all = s.all
  if (!all || (!all.groups.length && !all.running)) return null
  const left = (g: OptAllGroup) => g.videos.filter((v) => v.status === 'new' || v.status === 'error')
  const total = all.groups.reduce((n, g) => n + left(g).length, 0)
  const chans = all.groups.filter((g) => left(g).length).length
  const cur = all.groups.find((g) => g.key === all.current)
  const openVideo = (key: string, id: string) => { go('accounts'); send('optimize_open_video', { channelKey: key, id }) }
  const hint = all.running
    ? `Đang quét${cur ? ` kênh ${cur.name}` : ''} (${Math.max(1, all.groups.findIndex((g) => g.key === all.current) + 1)}/${all.groups.length} kênh)`
    : `${all.groups.length} kênh · ${total} video chưa tối ưu${all.at ? ` · quét lúc ${new Date(all.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}` : ''}`
  return (
    <Card title="Quét toàn bộ" hint={hint}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs text-muted-foreground">{all.perChannel ?? 2} video mới nhất của mỗi kênh đã tick. Tối ưu chỉ làm các mục còn thiếu, mục đã điền giữ nguyên.</p>
        <Button variant="gradient" size="sm" disabled={s.busy || !total} onClick={() => send('optimize_run_all')}>
          <Sparkles /> Tối ưu mục còn thiếu ({total} video{chans > 1 ? `, ${chans} kênh` : ''})
        </Button>
      </div>
      <div className="max-h-[520px] space-y-3 overflow-y-auto">
        {all.groups.map((g) => {
          const n = (st: OptVideo['status']) => g.videos.filter((v) => v.status === st).length
          const todo = left(g)
          return (
            <section key={g.key} aria-label={`Kênh ${g.name}`} className="rounded-lg ring-1 ring-border/60">
              <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{g.name}</h3>
                {all.running && all.current === g.key && <Pill tone="active"><LoaderCircle className="h-3 w-3 animate-spin" /> Đang quét</Pill>}
                {n('done') > 0 && <Pill tone="success">{n('done')} đã tối ưu</Pill>}
                {n('new') > 0 && <Pill tone="muted">{n('new')} chưa tối ưu</Pill>}
                {n('error') > 0 && <Pill tone="error">{n('error')} lỗi</Pill>}
                <Button variant="outline" size="sm" className="h-7" disabled={s.busy || !todo.length} onClick={() => send('optimize_run_all', { items: [{ channelKey: g.key, ids: todo.map((v) => v.id) }] })}>
                  <Sparkles /> Tối ưu kênh này
                </Button>
              </header>
              {g.error && <p className="px-3 pt-2 text-[11px] text-red-600 dark:text-red-400">{g.error}</p>}
              {g.videos.length ? (
                <ul className="space-y-0.5 p-1">
                  {g.videos.map((v) => <VideoRow key={v.id} v={v} busy={s.busy} open={() => openVideo(g.key, v.id)} rescan={() => send('optimize_rescan', { channelKey: g.key, id: v.id })} />)}
                </ul>
              ) : !g.error && <p className="px-3 py-2 text-[11px] text-muted-foreground">{all.running ? 'Chờ quét…' : 'Không có video.'}</p>}
            </section>
          )
        })}
      </div>
    </Card>
  )
}

function TemplateCard({ s, send }: { s: OptimizeState; send: PageProps['send'] }) {
  const ch = s.channels.find((c) => c.key === s.channelKey)
  const hasOwn = !!(s.channelKey && s.templates[s.channelKey])
  const [target, setTarget] = useState<'channel' | 'default'>(hasOwn ? 'channel' : 'default')
  const key = target === 'channel' && s.channelKey ? s.channelKey : 'default'
  const saved = templateOf(s.templates, key)
  const savedKey = JSON.stringify(saved)
  const [t, setT] = useState<OptimizeTemplate>(saved)
  useEffect(() => setTarget(hasOwn ? 'channel' : 'default'), [s.channelKey, hasOwn])
  useEffect(() => setT(saved), [savedKey, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(t) !== savedKey
  return (
    <Card title="Mẫu tối ưu" hint={hasOwn ? `Kênh ${ch?.name ?? ''} đang dùng mẫu riêng` : 'Kênh này đang dùng mẫu mặc định'}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Sửa mẫu nào" className="inline-flex rounded-lg bg-background/50 p-1 ring-1 ring-border/60">
          {([['channel', `Mẫu riêng của kênh${ch ? ` ${ch.name}` : ''}`], ['default', 'Mẫu mặc định (mọi kênh)']] as const).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={target === v} disabled={v === 'channel' && !ch} onClick={() => setTarget(v)}
              className={cn('max-w-[260px] truncate rounded-md px-3 py-1 text-xs font-semibold disabled:opacity-40', target === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{l}</button>
          ))}
        </div>
        {target === 'channel' && !hasOwn && <span className="text-[11px] text-muted-foreground">Chưa có mẫu riêng: đang sửa từ mẫu mặc định, bấm Lưu để tạo.</span>}
        <span className="flex-1" />
        {dirty ? <Pill tone="warning">Chưa lưu</Pill> : <Pill tone="success">Đã lưu</Pill>}
      </div>
      <OptimizeTemplateEditor value={t} onChange={setT} channelName={ch?.name} sample={s.videos[0]?.title} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button className="h-9" disabled={!dirty || (target === 'channel' && !ch)} onClick={() => send('optimize_template_save', { channelKey: key, template: t })}>
          <Save /> {key === 'default' ? 'Lưu mẫu mặc định' : 'Lưu mẫu cho kênh'}
        </Button>
        <Button variant="subtle" className="h-9" disabled={!dirty} onClick={() => setT(saved)}><Undo2 /> Bỏ thay đổi</Button>
        <span className="flex-1" />
        {target === 'channel' && hasOwn && (
          <Button variant="outline" className="h-9" onClick={() => send('optimize_template_save', { channelKey: s.channelKey, template: null })}><RotateCcw /> Kênh dùng lại mẫu mặc định</Button>
        )}
        {target === 'default' && (
          <Button variant="outline" className="h-9" onClick={() => setT(defaultOptimizeTemplate())}><RefreshCw /> Về mẫu gốc của tool</Button>
        )}
      </div>
    </Card>
  )
}

export function OptimizePage({ state, send, go }: PageProps) {
  const s = state.f.optimize as OptimizeState | undefined
  const [sel, setSel] = useState<Set<string>>(new Set())
  useEffect(() => { send('optimize_open') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setSel(new Set()), [s?.channelKey])
  if (!s) return <PageBody><EmptyState icon={Wand2} text="Đang tải…" /></PageBody>
  const videos = s.videos
  const todo = videos.filter((v) => v.status === 'new' || v.status === 'error')
  const chosen = videos.filter((v) => sel.has(v.id))
  const done = videos.filter((v) => v.status === 'done').length
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allOn = videos.length > 0 && chosen.length === videos.length
  const scanning = s.busy && !s.all?.running && !videos.some((v) => v.status === 'run')
  const allVideos = (s.all?.groups ?? []).flatMap((g) => g.videos)
  const working = s.busy && (!!s.all?.running || [...videos, ...allVideos].some((v) => v.status === 'run' || v.status === 'scan'))
  const read = videos.filter((v) => v.status !== 'scan').length
  const limit = s.limit ?? 10
  // bam tieu de: sang trang Tai khoan, khung Studio chuyen dung kenh roi mo trang chinh sua video
  const openVideo = (id: string) => { go('accounts'); send('optimize_open_video', { channelKey: s.channelKey, id }) }
  return (
    <>
      <PageHeader
        icon={Wand2}
        title="Tối ưu video"
        description="Quét các video mới nhất (chọn số video), đọc trang Chi tiết của từng video để biết video nào còn thiếu thông tin so với mẫu, rồi tối ưu trong YouTube Studio + thích, bình luận, ghim. Video đã tối ưu ở lần trước được bỏ qua (bấm “Quét lại” ở video để đọc lại)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Kênh cần tối ưu"
              value={s.channelKey}
              disabled={s.busy || !s.channels.length}
              onChange={(e) => send('optimize_select', e.target.value)}
              className="h-8 max-w-[240px] truncate rounded-md border border-input bg-background/50 px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {!s.channels.length && <option value="">Chưa có kênh</option>}
              {s.channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
            <select
              aria-label="Số video cần quét"
              title="Số video mới nhất sẽ quét"
              value={limit}
              disabled={s.busy}
              onChange={(e) => send('optimize_limit', Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background/50 px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(s.limits ?? LIMITS).map((n) => <option key={n} value={n}>{n} video</option>)}
            </select>
            <Button variant="outline" size="sm" disabled={s.busy || !s.channelKey} onClick={() => send('optimize_list', { channelKey: s.channelKey, limit })}>
              {scanning ? <LoaderCircle className="animate-spin" /> : <ScanSearch />} Quét video
            </Button>
            <Button variant="outline" size="sm" disabled={s.busy || !s.channels.length} title={`Quét ${s.all?.perChannel ?? 2} video mới nhất của mọi kênh đã tick (lần lượt từng kênh)`} onClick={() => send('optimize_scan_all')}>
              {s.all?.running ? <LoaderCircle className="animate-spin" /> : <Layers />} Quét toàn bộ
            </Button>
          </div>
        }
      />
      <PageBody>
        {!s.channels.length && (
          <Card>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <p className="flex-1">Chưa có kênh nào được tick. Đăng nhập tài khoản Google và chọn kênh ở trang Tài khoản trước.</p>
              <Button variant="outline" size="sm" onClick={() => go('accounts')}>Mở trang Tài khoản</Button>
            </div>
          </Card>
        )}
        <Card title="Video đã đăng" hint={scanning && videos.length ? `Đang đọc trang Chi tiết: ${read}/${videos.length} video` : s.at ? `${videos.length} video · ${done} đã tối ưu · quét lúc ${new Date(s.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : `Bấm “Quét video” để đọc ${limit} video mới nhất trong Studio`}>
          {videos.length ? (
            <>
              <div className="mb-1 flex items-center gap-3 px-2 text-xs text-muted-foreground">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={allOn} disabled={s.busy} onChange={() => setSel(allOn ? new Set() : new Set(videos.map((v) => v.id)))} aria-label="Chọn tất cả" />
                  Chọn tất cả
                </label>
                <button className="font-semibold hover:text-foreground disabled:opacity-50" disabled={s.busy} onClick={() => setSel(new Set(todo.map((v) => v.id)))}>Chọn video chưa tối ưu ({todo.length})</button>
              </div>
              <ul className="max-h-[420px] space-y-0.5 overflow-y-auto">
                {videos.map((v) => <VideoRow key={v.id} v={v} on={sel.has(v.id)} toggle={() => toggle(v.id)} busy={s.busy} open={() => openVideo(v.id)} rescan={() => send('optimize_rescan', { channelKey: s.channelKey, id: v.id })} />)}
              </ul>
            </>
          ) : (
            <EmptyState icon={ListChecks} text={s.busy ? 'Đang quét video trong Studio…' : 'Chưa có danh sách. Tool mở trang Nội dung của kênh trong Studio, rồi đọc (không sửa) trang Chi tiết của từng video để xem còn thiếu mục nào so với mẫu.'} />
          )}
        </Card>
        <ScanAllCard s={s} send={send} go={go} />
        <TemplateCard s={s} send={send} />
      </PageBody>
      <ActionBar>
        {working ? (
          <Button variant="danger" size="sm" onClick={() => send('stop')}><Square /> {s.all?.running || [...videos, ...allVideos].some((v) => v.status === 'scan') ? 'Dừng quét' : 'Dừng sau video đang tối ưu'}</Button>
        ) : (
          <>
            <Button variant="gradient" size="sm" disabled={s.busy || !chosen.length} onClick={() => send('optimize_run', { channelKey: s.channelKey, ids: chosen.map((v) => v.id) })}>
              <Sparkles /> Tối ưu đã chọn ({chosen.length})
            </Button>
            <Button variant="outline" size="sm" disabled={s.busy || !todo.length} onClick={() => send('optimize_run', { channelKey: s.channelKey, ids: todo.map((v) => v.id) })}>
              <CheckCheck /> Tối ưu tất cả chưa tối ưu ({todo.length})
            </Button>
          </>
        )}
      </ActionBar>
    </>
  )
}

// Du lieu mau cho ?demo#optimize (cac video trong khung hinh video quay)
const vid = (id: string, title: string, visibility: string, date: string, dateNote: string, views: number, comments: number, status: OptVideo['status'] = 'new', extra: Partial<OptVideo> = {}): OptVideo =>
  ({ id, title, visibility, date, dateNote, views, comments, status, step: '', error: '', warnings: [], ...extra })
export const optimizeDemo: OptimizeState = {
  channelKey: 'UC6roez1tiwHbdhvLWBvLRmQ',
  channels: [
    { key: 'UC6roez1tiwHbdhvLWBvLRmQ', name: 'Dark Bible Study', handle: '@DarkBibleStudy999', ucId: 'UC6roez1tiwHbdhvLWBvLRmQ' },
    { key: 'UCLBuhr6vMvZQPqZpTTslWaQ', name: 'Dark Faith 2nd', handle: '@DarkFaith9999', ucId: 'UCLBuhr6vMvZQPqZpTTslWaQ' },
  ],
  busy: false,
  at: '2026-10-26T12:05:00Z',
  limit: 10,
  limits: LIMITS,
  templates: {
    default: { ...defaultOptimizeTemplate(), playlists: ['Dark Bible Study', 'Bible Podcast'] },
  },
  videos: [
    vid('Prem0000001', 'The Prophet Who Ran From God: Jonah’s Untold Story', 'Riêng tư', '27 thg 10, 2026', 'Đang công chiếu', 0, 0, 'new', { missing: ['playlists', 'paidPromotion', 'ai', 'tags', 'recordingDate', 'location', 'remix'] }),
    vid('vyiSqHByq24', 'The Tower of Babel: Humanity’s First Rebellion Against God', 'Công khai', '25 thg 10, 2026', 'Đã xuất bản', 412, 9, 'new', { missing: ['playlists', 'location', 'recordingDate'] }),
    vid('kQ1pB7xZt0E', 'Why Did God Harden Pharaoh’s Heart? The Dark Truth', 'Công khai', '24 thg 10, 2026', 'Đã xuất bản', 1280, 31, 'new', { missing: ['playlists'] }),
    vid('Lm8sN2rTq5Y', 'The Nephilim: Giants of the Bible Explained', 'Công khai', '22 thg 10, 2026', 'Đã xuất bản', 3540, 57, 'done'),
    vid('Zx4cV6bNm1Q', 'Lilith: The Forbidden Story Before Eve', 'Công khai', '20 thg 10, 2026', 'Đã xuất bản', 2210, 44, 'done', { missing: [], note: 'đã thích và bình luận - chưa ghim' }),
    vid('Hj7gF3dSa9W', 'The Book of Enoch: Why It Was Removed', 'Không công khai', '18 thg 10, 2026', 'Đã tải lên', 96, 2, 'error', { error: 'Quá 5 giây vẫn chưa thấy "Lưu".' }),
    vid('Rt5yU1iOp3A', 'The Witch of Endor: Did Saul Really Speak to Samuel?', 'Công khai', '16 thg 10, 2026', 'Đã xuất bản', 733, 12, 'new', { note: 'Không đọc được trang Chi tiết: Quá 20 giây vẫn chưa thấy "Chi tiết video".' }),
    vid('Pq2wE8rTy6U', 'Cain’s Mark: What Was It Really?', 'Công khai', '15 thg 10, 2026', 'Đã xuất bản', 5021, 88, 'done', { missing: [], note: 'Đã tối ưu ở lần trước: không quét lại.' }),
  ],
  all: {
    at: '2026-10-26T12:20:00Z', running: false, current: '', perChannel: 2,
    groups: [
      { key: 'UC6roez1tiwHbdhvLWBvLRmQ', name: 'Dark Bible Study', error: '', videos: [
        vid('Prem0000001', 'The Prophet Who Ran From God: Jonah’s Untold Story', 'Riêng tư', '27 thg 10, 2026', 'Đang công chiếu', 0, 0, 'new', { missing: ['playlists', 'paidPromotion', 'location'] }),
        vid('vyiSqHByq24', 'The Tower of Babel: Humanity’s First Rebellion Against God', 'Công khai', '25 thg 10, 2026', 'Đã xuất bản', 412, 9, 'done', { missing: [], note: 'đã thích và bình luận - chưa ghim' }),
      ] },
      { key: 'UCLBuhr6vMvZQPqZpTTslWaQ', name: 'Dark Faith 2nd', error: '', videos: [
        vid('Fa1thVid001', 'The Covenant Seed: A Forgotten Psalm', 'Công khai', '27 thg 10, 2026', 'Đã công chiếu', 756, 2, 'new', { unread: true, note: 'YouTube Studio đang hiện hộp thoại "Xác minh danh tính của bạn" (Google cần bạn tự xác minh tài khoản). Tool dừng video này và không tự xác minh. Hãy mở trang Tài khoản, chọn tài khoản Google này, làm theo hướng dẫn xác minh trong khung Studio (nút "Tiếp theo"), xong rồi chạy lại.' }),
        vid('Fa1thVid002', 'Seven Old Scriptures Every Reader Should Know', 'Công khai', '26 thg 10, 2026', 'Đã xuất bản', 1125, 6, 'done'),
      ] },
    ],
  },
}
