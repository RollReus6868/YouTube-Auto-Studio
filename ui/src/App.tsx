import {
  AlertTriangle, ArrowUpCircle, BookOpen, CalendarClock, Clapperboard, Copy, Download, Eraser, ExternalLink, FileVideo, FolderOpen, FolderPlus, Globe, Home,
  ImageIcon, LayoutTemplate, Palette, Plus, RefreshCw, Save, ScrollText, Settings, Sparkles,
  Square, Subtitles, Trash2, Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { call, demoState, emptyState, isDemo, newPreset, type Job, type Preset, type Settings as SettingsT, type State, type VideoItem } from './api'
import {
  ActionBar, AppShell, BrowserPane, Button, Card, Choice, Dialog, EmptyState, Field, GradientProgress, PageBody, PageHeader, Pill, Select,
  Sidebar, TextArea, TextInput, ThemeGrid, ToggleRow, cn, useStickToBottom, type Tone,
} from './kit'
import { LogDock, LogLine } from './LogDock'
import { GuidePage } from './GuidePage'
import { FEATURE_PAGES } from './pages'
import { StudioPicker, type AccountsState } from './pages/AccountsPage'
import { PresetOptimizeCard, defaultOptimizeTemplate } from './pages/OptimizeTemplateEditor'
import { VisibilityCard } from './VisibilityCard'

const PRIVACY: Record<Preset['privacy'], string> = { public: 'Công khai', unlisted: 'Không công khai', private: 'Riêng tư' }
// ban sao danh sach o src/google.js (GEMINI_MODELS), dung khi backend chua gui state.gemini
const MODELS: [string, string][] = [['gemini-3.8-flash', 'Gemini 3.8 Flash (trợ giúp toàn diện)'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite (nhanh nhất, rẻ nhất)'], ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro (suy luận nâng cao, bản xem trước)'], ['gemini-4-argon', 'Gemini 4 Argon (nhiệm vụ phức tạp, mới)']]
const THINKING: [string, string][] = [['low', 'Thấp – nhanh chóng và hiệu quả'], ['medium', 'Trung bình – độ sâu cân bằng'], ['high', 'Cao – cực kỳ kỹ lưỡng']]
const VARS = ['{ten_video}', '{tieu_de}', '{so_tap}', '{ngay}', '{ten_kenh}', '{hashtag}', '{playlist}']

function useBackend() {
  const [state, setState] = useState<State>(() => (isDemo() ? withDemo(demoState) : emptyState))
  useEffect(() => {
    window.ya?.onState(setState)
    call('hello').then((s) => s && setState(s))
  }, [])
  const send = (cmd: string, payload?: unknown) => call(cmd, payload).then((s) => s && setState({ ...s }))
  return { state, send }
}
type Backend = ReturnType<typeof useBackend>
const withDemo = (s: State): State => ({ ...s, f: { ...s.f, ...Object.fromEntries(FEATURE_PAGES.filter((p) => p.demo).map((p) => [p.id, p.demo])) } })
// chen trang tinh nang vao danh sach thanh ben (sau trang `after`, hoac cuoi nhom)
type NavItem = { id: string; label: string; icon: typeof Home; dot?: boolean }
function withFeatures(items: NavItem[], bottom: boolean) {
  const out = [...items]
  for (const p of FEATURE_PAGES.filter((x) => !!x.bottom === bottom)) {
    const i = p.after ? out.findIndex((x) => x.id === p.after) : -1
    out.splice(p.first ? 0 : i >= 0 ? i + 1 : out.length, 0, { id: p.id, label: p.label, icon: p.icon })
  }
  return out
}

const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}
const fmtSize = (b: number) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(1)} GB` : `${Math.max(1, Math.round(b / (1 << 20)))} MB`)
const chars = (s: string) => [...s].length
const bytes = (s: string) => new TextEncoder().encode(s).length

function Chip({ icon: Icon, children, tone = 'muted' }: { icon?: typeof FileVideo; children: ReactNode; tone?: Tone }) {
  const tones: Record<string, string> = { muted: 'bg-muted/70 text-muted-foreground', active: 'bg-primary/10 text-primary', warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', tones[tone] ?? tones.muted)}>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  )
}

function UpdateBadge({ state, go }: { state: State; go: () => void }) {
  if (state.update.status !== 'available') return null
  return (
    <button onClick={go} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-500/20 dark:text-amber-400">
      <ArrowUpCircle className="h-3.5 w-3.5" /> Có bản mới {state.update.latest}
    </button>
  )
}

// video: thu muc video cua trang Dang video (chua chon rieng thi dung thu muc goc); khong: thu muc goc (bai dang)
function FolderBar({ state, send, video }: Backend & { video?: boolean }) {
  const root = state.scan.root || state.settings?.root || ''
  const own = state.settings?.videoDir || ''
  const dir = video ? own || state.scan.videoDir || root : root
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/30 p-2 pl-3">
      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-xs font-bold text-muted-foreground">{video ? 'Thư mục video' : 'Thư mục gốc'}</span>
      <span className={cn('min-w-0 flex-1 basis-40 truncate text-sm', dir ? 'font-semibold' : 'text-muted-foreground')} title={dir}>
        {dir || (video ? 'Chưa chọn thư mục chứa video' : 'Chưa chọn thư mục gốc')}
        {video && dir && !own && <span className="font-normal text-muted-foreground"> (thư mục gốc)</span>}
      </span>
      <Button variant="outline" className="h-8 px-3" onClick={() => send(video ? 'choose_video_dir' : 'choose_root')}>
        <FolderOpen /> {dir ? 'Đổi' : 'Chọn thư mục'}
      </Button>
      <Button variant="outline" className="h-8 px-3" disabled={!dir} onClick={() => send('scan')}>
        <RefreshCw /> Quét lại
      </Button>
    </div>
  )
}

// "Riêng tư → Công khai lúc ..." / "Công khai · Công chiếu ngay"
const visText = (m: VideoItem['meta']) => m.publishAt
  ? `Riêng tư → ${m.schedulePremiere ? 'Công chiếu' : 'Công khai'} lúc ${fmtWhen(m.publishAt)}`
  : `${PRIVACY[m.privacy]}${m.premiere ? ' · Công chiếu ngay' : ''}`

/* ================= Dang video ================= */
// cac buoc cua src/flows/upload.js (hop thoai tai len cua Studio)
const STEPS: Record<string, string> = {
  open: 'Đang mở hộp thoại tải lên', file: 'Đang chọn file video', details: 'Đang điền chi tiết', thumbnail: 'Đang đặt hình thu nhỏ',
  playlist: 'Đang chọn danh sách phát', more: 'Đang đặt các mục nâng cao', subtitles: 'Đang thêm phụ đề', endscreen: 'Đang thêm màn hình kết thúc',
  visibility: 'Đang chọn chế độ hiển thị', schedule: 'Đang lên lịch', wait: 'Đang chờ tải lên xong', publish: 'Đang lưu',
}

function JobLine({ job, send }: { job: Job; send: Backend['send'] }) {
  if (job.status === 'queued') return <Pill tone="muted">Đang chờ đăng</Pill>
  if (job.status === 'run') {
    return (
      <div className="space-y-1">
        <GradientProgress value={job.progress} />
        <p className="text-[11px] text-muted-foreground">{STEPS[job.step] || 'Đang xử lý'}… · đã tải lên {job.progress}%</p>
      </div>
    )
  }
  if (job.status === 'done') {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Pill tone="success">Đã đăng</Pill>
        <button className="text-xs font-semibold text-primary hover:underline" onClick={() => send('open_url', job.url)}>{job.url}</button>
      </span>
    )
  }
  if (job.status === 'stopped') return <Pill tone="warning">Đã dừng</Pill>
  return <Pill tone="error" className="max-w-full">{job.error}</Pill>
}

function VideoCard({ v, job, open, onToggle, busy, connected, send }: {
  v: VideoItem; job?: Job; open: boolean; onToggle: () => void; busy: boolean; connected: boolean; send: Backend['send'] // connected: da chon kenh dang video
}) {
  const bad = v.errors.length > 0
  const active = job && (job.status === 'run' || job.status === 'queued')
  return (
    <article className={cn('rounded-xl border bg-card/40 transition-all', bad ? 'border-red-500/30' : active ? 'border-primary/40' : 'border-border/50 hover:border-primary/30')}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-3 pb-[38px] text-left">
        <div className="relative flex h-[72px] w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {v.thumbUrl ? <img src={v.thumbUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-muted-foreground/60" />}
          {v.size > 0 && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">{fmtSize(v.size)}</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug">{v.meta.title || v.name}</h3>
          <div className="flex flex-wrap gap-1">
            <Chip icon={LayoutTemplate} tone="active">{v.preset}</Chip>
            {v.meta.publishAt ? <Chip icon={CalendarClock}>{fmtWhen(v.meta.publishAt)}</Chip> : <Chip>{PRIVACY[v.meta.privacy]} ngay</Chip>}
            {(v.meta.premiere || (v.meta.publishAt && v.meta.schedulePremiere)) && <Chip icon={Clapperboard}>Công chiếu</Chip>}
            {v.video && <Chip icon={FileVideo}>{v.video}</Chip>}
            {v.thumb && <Chip icon={ImageIcon}>{v.thumb}</Chip>}
            {v.subtitles.length > 0 && <Chip icon={Subtitles}>{v.subtitles.map((s) => s.lang).join(', ')}</Chip>}
          </div>
        </div>
      </button>
      {/* nam ngoai nut mo/dong: trong dong trang thai co lien ket bam duoc */}
      <div className="-mt-[34px] mb-3 ml-[152px] mr-3 min-h-[22px]">
        {job && !bad ? <JobLine job={job} send={send} />
          : bad ? <Pill tone="error" className="max-w-full">{v.errors[0]}</Pill>
          : v.warnings.length > 0 ? <Pill tone="warning" className="max-w-full">{v.warnings[0]}</Pill>
          : <Pill tone="success">Sẵn sàng</Pill>}
      </div>
      {open && (
        <div className="space-y-3 border-t border-border/50 p-3 text-sm">
          <div>
            <p className="mb-1 text-xs font-bold text-muted-foreground">Mô tả</p>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2.5 font-sans text-[13px]">{v.meta.description || '(trống)'}</pre>
          </div>
          <div className="flex flex-wrap gap-1">
            {v.meta.tags.length ? v.meta.tags.map((t) => <Chip key={t}>{t}</Chip>) : <span className="text-xs text-muted-foreground">Không có thẻ</span>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Playlist</dt><dd className="truncate font-semibold">{v.meta.playlist || '—'}</dd>
            <dt className="text-muted-foreground">Dành cho trẻ em</dt><dd className="font-semibold">{v.meta.madeForKids ? 'Có' : 'Không'}</dd>
            <dt className="text-muted-foreground">Hiển thị</dt><dd className="font-semibold">{visText(v.meta)}</dd>
          </dl>
          {[...v.errors.slice(1), ...v.warnings.slice(v.errors.length ? 0 : 1), ...(job?.warnings ?? [])].map((m) => (
            <p key={m} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{m}</p>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-8 px-3 text-xs" disabled={busy || !v.folder || !v.video} onClick={() => send('describe', v.id)}><Sparkles /> Gemini viết mô tả</Button>
            <Button variant="outline" className="h-8 px-3 text-xs" disabled={busy || bad || !connected || job?.status === 'done'} onClick={() => send('upload', [v.id])}><Upload /> Đăng video này</Button>
            <Button variant="subtle" className="h-8 px-3 text-xs" onClick={() => send('open_path', v.folder)} disabled={!v.folder}><FolderOpen /> Mở thư mục</Button>
          </div>
        </div>
      )}
    </article>
  )
}

function DraftDialog({ state, send }: Backend) {
  const d = state.draft
  const [text, setText] = useState('')
  useEffect(() => setText(d?.text ?? ''), [d?.text])
  const v = state.scan.videos.find((x) => x.id === d?.id)
  const file = v?.layout === 'flat' && v.infoFile ? v.infoFile : 'info.txt'
  return (
    <Dialog
      open={!!d}
      onClose={() => send('draft_close')}
      title={`Gemini viết mô tả${v ? `: ${v.meta.title}` : ''}`}
      actions={
        <>
          <Button variant="outline" onClick={() => send('draft_close')}>Đóng</Button>
          <Button variant="outline" disabled={d?.loading} onClick={() => d && send('describe', d.id)}><RefreshCw /> Viết lại</Button>
          <Button disabled={!d || d.loading || !text.trim()} onClick={() => d && send('save_description', { id: d.id, text })}><Save /> Lưu vào {file}</Button>
        </>
      }
    >
      {d?.loading ? <p className="animate-pulse">Gemini đang viết…</p>
        : d?.error ? <p className="text-red-600 dark:text-red-400">{d.error}</p>
        : <>
            <TextArea rows={10} value={text} onChange={(e) => setText(e.target.value)} aria-label="Mô tả Gemini viết" className="text-foreground" />
            <p className="text-[11px]">Sửa lại nếu cần. Bấm lưu sẽ thay phần mô tả (sau dòng ---) trong {file}{file === 'info.txt' ? ' của video này' : ' (chưa có thì tạo mới), đặt cạnh file video'}.</p>
          </>}
    </Dialog>
  )
}

// Cach xep file trong thu muc video (kieu phang, mac dinh)
function FlatHelp() {
  return (
    <Card title="Cách xếp file" hint="một thư mục, không cần thư mục con">
      <pre className="overflow-x-auto rounded-lg bg-muted/40 p-2.5 font-mono text-[12px] leading-relaxed">{`Video cần đăng/
  Bí ẩn rừng sâu tập 1.mp4     ← video (tiêu đề = tên file)
  Bí ẩn rừng sâu tập 1.jpg     ← thumbnail cùng tên (.jpg .jpeg .png .webp)
  Bí ẩn rừng sâu tập 1.vi.srt  ← phụ đề (tùy chọn)
  Bí ẩn rừng sâu tập 1.txt     ← mô tả riêng (tùy chọn, Gemini lưu vào đây)
  da-dang/                     ← tool chuyển file đã đăng vào đây`}</pre>
      <p className="mt-2 text-xs text-muted-foreground">Mô tả, thẻ, danh sách phát, chế độ hiển thị và lịch lấy từ trang Mẫu mặc định. Thư mục con kiểu cũ (mỗi video một thư mục có info.txt) vẫn đọc được.</p>
    </Card>
  )
}

function VideosPage({ state, send, go }: Backend & { go: (p: string) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const ready = state.scan.videos.filter((v) => !v.errors.length && state.jobs[v.id]?.status !== 'done')
  const up = state.upload
  const connected = up.channels.some((c) => c.key === up.channelKey)
  const busy = state.status !== 'idle'
  const finished = Object.entries(state.jobs).filter(([id, j]) => j.status === 'done' && !state.scan.videos.some((v) => v.id === id))
  return (
    <>
      <PageHeader
        icon={Upload}
        title="Đăng video"
        description="Chọn một thư mục chứa video và ảnh thumbnail cùng tên. Tiêu đề là tên file; mô tả, thẻ, chế độ hiển thị và lịch lấy theo mẫu mặc định. Tool đăng bằng hộp thoại tải lên của YouTube Studio."
        actions={<>
          <UpdateBadge state={state} go={() => go('update')} />
          {up.channels.length ? (
            <div className="w-72 max-w-full shrink-0">
              <Select
                label="Kênh đăng video"
                value={up.channelKey}
                onChange={(v) => send('upload_channel', v)}
                options={up.channels.map((c) => [c.key, c.handle ? `${c.name} (${c.handle})` : c.name])}
              />
            </div>
          ) : <button onClick={() => go('accounts')} className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted/70">Chưa có kênh: đăng nhập Google ở trang Tài khoản</button>}
        </>}
      />
      <div className="shrink-0 space-y-3 px-4 pb-3">
        <FolderBar state={state} send={send} video />
        {state.scan.errors.map((e) => (
          <div key={e} className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" /> <span className="min-w-0 flex-1">{e}</span>
          </div>
        ))}
      </div>
      <PageBody>
        {finished.length > 0 && (
          <Card title="Vừa đăng xong" hint="file đã chuyển vào da-dang/, không đăng lại">
            <ul className="space-y-1.5">
              {finished.map(([id, j]) => (
                <li key={id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold">{j.title}</span>
                  <button className="text-xs font-semibold text-primary hover:underline" onClick={() => send('open_url', j.url)}>{j.url}</button>
                  {j.warnings && j.warnings.length > 0 && <Pill tone="warning" className="max-w-full">{j.warnings[0]}</Pill>}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {state.scan.videos.length === 0 ? (
          <div className="space-y-3">
            <EmptyState icon={FileVideo} text={state.scan.videoDir || state.settings?.videoDir ? 'Chưa có video nào trong thư mục này (video đã đăng nằm trong da-dang/ và được bỏ qua).' : 'Chọn thư mục chứa video cần đăng.'} />
            <FlatHelp />
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{state.scan.videos.length} video · {ready.length} sẵn sàng · bấm vào một video để xem mô tả, nhờ Gemini viết (tùy chọn), hoặc đăng riêng</p>
            {state.scan.videos.map((v) => (
              <VideoCard key={v.id} v={v} job={state.jobs[v.id]} open={open === v.id} onToggle={() => setOpen(open === v.id ? null : v.id)} busy={busy} connected={connected} send={send} />
            ))}
          </>
        )}
      </PageBody>
      <ActionBar>
        {busy ? (
          <Button variant="danger" size="sm" onClick={() => send('stop')}><Square /> Dừng sau video đang tải</Button>
        ) : (
          <Button variant="gradient" size="sm" disabled={!connected || !ready.length} title={connected ? '' : 'Chọn kênh đăng video (đăng nhập Google và tick kênh ở trang Tài khoản)'} onClick={() => send('upload')}>
            <Upload /> {ready.length ? `Đăng ${ready.length} video` : 'Đăng video'}
          </Button>
        )}
        <Button variant="subtle" size="icon-sm" aria-label="Sửa mẫu mặc định" title="Sửa mẫu mặc định" onClick={() => go('presets')}>
          <LayoutTemplate />
        </Button>
      </ActionBar>
      <DraftDialog state={state} send={send} />
    </>
  )
}

/* ================= Mau mac dinh (kieu hop thoai tai len cua Studio) ================= */
function renderPreview(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{([\p{L}\w]+)\}/gu, (m, k) => (k in vars ? vars[k] : m)).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n')
}

function PresetsPage({ state, send }: Backend) {
  const settings = state.settings
  const [presets, setPresets] = useState<Preset[]>(() => settings?.presets ?? [])
  const [def, setDef] = useState(settings?.defaultPreset ?? '')
  const [sel, setSel] = useState(settings?.defaultPreset ?? '')
  const [confirmDel, setConfirmDel] = useState(false)
  const saved = JSON.stringify({ p: settings?.presets, d: settings?.defaultPreset })
  const dirty = saved !== JSON.stringify({ p: presets, d: def })
  // dong bo khi backend gui cai dat moi (lan dau mo / sau khi luu)
  useEffect(() => {
    if (!settings) return
    setPresets(settings.presets)
    setDef(settings.defaultPreset)
    setSel((s) => (settings.presets.some((p) => p.id === s) ? s : settings.defaultPreset))
  }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps

  const p = presets.find((x) => x.id === sel) ?? presets[0]
  if (!p) return <PageBody><EmptyState icon={LayoutTemplate} text="Đang tải mẫu…" /></PageBody>
  const set = (patch: Partial<Preset>) => setPresets((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
  const add = (copy: boolean) => {
    const id = `mau-${Date.now().toString(36)}`
    const n = copy ? { ...p, id, name: `${p.name} (bản sao)` } : newPreset(id, `Mẫu ${presets.length + 1}`)
    setPresets((ps) => [...ps, n])
    setSel(id)
  }
  const remove = () => {
    const rest = presets.filter((x) => x.id !== p.id)
    setPresets(rest)
    if (def === p.id) setDef(rest[0].id)
    setSel(rest[0].id)
    setConfirmDel(false)
  }

  const tagText = p.tags.join(', ')
  const vars: Record<string, string> = {
    ten_video: 'Bí ẩn rừng sâu', so_tap: '1', ngay: new Date().toLocaleDateString('vi-VN'), ten_kenh: settings?.channel || '',
    hashtag: p.tags.slice(0, 3).map((t) => `#${t.replace(/\s+/g, '')}`).join(' '), playlist: p.playlist,
  }
  vars.tieu_de = renderPreview(p.title, vars)
  const previewDesc = renderPreview(p.description, vars)
  const tagLen = p.tags.reduce((n, t) => n + chars(t) + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, p.tags.length - 1)

  return (
    <>
      <PageHeader
        icon={LayoutTemplate}
        title="Mẫu mặc định"
        description="Giống hộp thoại tải lên của YouTube Studio. Chỉnh một lần, mọi video dùng mẫu này sẽ được điền sẵn."
        actions={dirty ? <Pill tone="warning">Chưa lưu</Pill> : <Pill tone="success">Đã lưu</Pill>}
      />
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3">
        {presets.map((x) => (
          <button
            key={x.id}
            onClick={() => setSel(x.id)}
            aria-pressed={x.id === p.id}
            className={cn('inline-flex max-w-[200px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all',
              x.id === p.id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground')}
          >
            <span className="truncate">{x.name || '(chưa đặt tên)'}</span>
            {x.id === def && <span className="rounded bg-primary/15 px-1 text-[10px] text-primary">mặc định</span>}
          </button>
        ))}
        <Button variant="subtle" className="h-8 px-3" onClick={() => add(false)}><Plus /> Mẫu mới</Button>
        <Button variant="subtle" className="h-8 px-3" onClick={() => add(true)}><Copy /> Nhân bản</Button>
      </div>
      <PageBody>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <Card title="Chi tiết">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tên mẫu"><TextInput value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
                  <Field label="Dùng làm mẫu mặc định">
                    <Button variant={def === p.id ? 'default' : 'outline'} className="h-9 w-full" onClick={() => setDef(p.id)} disabled={def === p.id}>
                      {def === p.id ? 'Đang là mẫu mặc định' : 'Đặt làm mặc định'}
                    </Button>
                  </Field>
                </div>
                <Field label="Tiêu đề (thư mục con kiểu cũ)" hint={<span><span className={cn(chars(vars.tieu_de) > 100 && 'text-red-500')}>{chars(vars.tieu_de)}/100 ký tự sau khi điền</span> · video trong thư mục video lấy tên file làm tiêu đề</span>}>
                  <TextInput value={p.title} onChange={(e) => set({ title: e.target.value })} placeholder="{ten_video}" />
                </Field>
                <Field label="Mô tả" hint={<span className={cn(bytes(previewDesc) > 5000 && 'text-red-500')}>{bytes(previewDesc)}/5000 byte sau khi điền</span>}>
                  <TextArea rows={7} value={p.description} onChange={(e) => set({ description: e.target.value })} placeholder="Giới thiệu video, link mạng xã hội, hashtag…" />
                </Field>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-[11px] text-muted-foreground">Biến dùng được:</span>
                  {VARS.map((v) => <code key={v} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{v}</code>)}
                  <span className="text-[11px] text-muted-foreground">và mọi dòng “Khóa: giá trị” trong file .txt cùng tên video (hoặc info.txt)</span>
                </div>
                <Field label="Thẻ (cách nhau bằng dấu phẩy)" hint={<span className={cn(tagLen > 500 && 'text-red-500')}>{tagLen}/500 ký tự</span>}>
                  <TagInput value={tagText} onChange={(tags) => set({ tags })} />
                </Field>
                <Field label="Danh sách phát (tên)" hint="Tool tick danh sách phát này trong hộp thoại tải lên, chưa có thì tạo mới.">
                  <TextInput value={p.playlist} onChange={(e) => set({ playlist: e.target.value })} placeholder="Không thêm" />
                </Field>
              </div>
            </Card>
            <Card title="Đối tượng người xem">
              <Choice
                name="Dành cho trẻ em"
                value={p.madeForKids ? 'yes' : 'no'}
                onChange={(v) => set({ madeForKids: v === 'yes' })}
                options={[
                  { value: 'yes', label: 'Có, nội dung dành cho trẻ em', hint: 'Tắt bình luận, thông báo và một số tính năng khác theo quy định của YouTube.' },
                  { value: 'no', label: 'Không, nội dung không dành cho trẻ em' },
                ]}
              />
            </Card>
          </div>
          <div className="space-y-3">
            <VisibilityCard p={p} set={set} />
            <Card title="Tùy chọn khác">
              <ToggleRow title="Thông báo cho người đăng ký" hint="Mục “Xuất bản lên nguồn cấp dữ liệu Kênh đăng ký và thông báo cho người đăng ký” trong Hiện thêm." checked={p.notifySubscribers} onChange={(v) => set({ notifySubscribers: v })} />
            </Card>
            <Card title="Xem trước" hint="với video mẫu “Bí ẩn rừng sâu”, tập 1">
              <div className="space-y-2">
                <p className="break-words text-sm font-bold">{vars.tieu_de}</p>
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2.5 font-sans text-[13px] text-muted-foreground">{previewDesc}</pre>
              </div>
            </Card>
          </div>
        </div>
        <PresetOptimizeCard className="mt-3" value={p.optimize ?? defaultOptimizeTemplate()} onChange={(optimize) => set({ optimize })} enabled={!!p.optimizeAfterUpload} onToggle={(v) => set({ optimizeAfterUpload: v })} channelName={settings?.channel} />
      </PageBody>
      <ActionBar>
        <Button variant="gradient" size="xl" className="flex-1" disabled={!dirty} onClick={() => send('settings_save', { presets, defaultPreset: def })}>
          <Save /> Lưu mẫu
        </Button>
        <Button variant="subtle" size="icon-xl" aria-label="Bỏ thay đổi" title="Bỏ thay đổi" disabled={!dirty} onClick={() => { setPresets(settings?.presets ?? []); setDef(settings?.defaultPreset ?? '') }}>
          <RefreshCw />
        </Button>
        <Button variant="danger" size="icon-xl" aria-label="Xóa mẫu này" title="Xóa mẫu này" disabled={presets.length < 2} onClick={() => setConfirmDel(true)}>
          <Trash2 />
        </Button>
      </ActionBar>
      <Dialog open={confirmDel} onClose={() => setConfirmDel(false)} title={`Xóa mẫu “${p.name}”?`} actions={<><Button variant="outline" onClick={() => setConfirmDel(false)}>Hủy</Button><Button onClick={remove}><Trash2 /> Xóa</Button></>}>
        <p>Video có dòng “Preset: {p.name}” trong info.txt sẽ chuyển sang dùng mẫu mặc định. Bấm Lưu mẫu để xóa hẳn.</p>
      </Dialog>
    </>
  )
}

// O nhap tu do; chi tach thanh mang khi roi o (de go dau phay khong bi nhay).
function TagInput({ value, onChange }: { value: string; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return <TextInput value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(text.split(/[,\n]/).map((t) => t.trim()).filter(Boolean))} placeholder="phim hay, review phim" />
}

/* ================= Khung YouTube Studio ================= */
function Browser({ state, send }: Backend) {
  const onRect = useCallback((r: unknown) => void call('pane', r), [])
  return (
    <>
      <header className="flex h-11 shrink-0 items-center gap-2 px-3">
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={state.studio.channelId}>
          YouTube Studio{state.studio.channelName ? ` · ${state.studio.channelName}` : state.studio.channelId ? ` · ${state.studio.channelId}` : ' · chưa vào kênh'}
          {state.studio.channelId && !state.studio.channelName && (state.f.accounts as AccountsState | undefined)?.list.some((a) => a.channels.length) && <span className="font-normal text-muted-foreground"> (kênh chưa có trong danh sách)</span>}
        </span>
        <StudioPicker state={state} send={send} />
        <Button variant="subtle" className="h-7 rounded-md px-2 text-xs" onClick={() => send('studio_home')} title="Về trang chủ YouTube Studio">
          <Home /> Về Studio
        </Button>
      </header>
      <BrowserPane onRect={onRect} />
    </>
  )
}

/* ================= Nhat ky ================= */
function LogsPage({ state, send }: Backend) {
  // dong moi nhat o cuoi, tu cuon xuong tru khi dang cuon len xem dong cu
  const { ref, onScroll } = useStickToBottom(state.logs)
  return (
    <>
      <PageHeader icon={ScrollText} title="Nhật ký" description="Mọi việc tool đã làm, mới nhất ở cuối." />
      <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {state.logs.length === 0 ? <EmptyState icon={ScrollText} text="Chưa có gì. Chọn thư mục gốc để bắt đầu." /> : (
          <ul className="space-y-1.5">
            {state.logs.map((l, i) => <LogLine key={i} l={l} />)}
          </ul>
        )}
      </div>
      <ActionBar>
        <Button variant="subtle" size="sm" disabled={!state.logs.length} onClick={() => send('clear')}><Eraser /> Xóa nhật ký</Button>
        <Button variant="outline" size="sm" onClick={() => send('open_data')} title="nhat-ky.txt (nhật ký đầy đủ) và loi-trang/ (ảnh + HTML lúc lỗi)"><FolderOpen /> Mở thư mục dữ liệu</Button>
      </ActionBar>
    </>
  )
}

/* ================= Cai dat ================= */
type Draft = Pick<SettingsT, 'channel' | 'geminiModel' | 'geminiThinking' | 'replyStyle' | 'replyMode' | 'replyPerHour' | 'skipWords'>
const pickDraft = (s: SettingsT | null): Draft => ({
  channel: s?.channel ?? '', geminiModel: s?.geminiModel ?? 'gemini-3.8-flash', geminiThinking: s?.geminiThinking ?? 'low', replyStyle: s?.replyStyle ?? '',
  replyMode: s?.replyMode ?? 'review', replyPerHour: s?.replyPerHour ?? 20, skipWords: s?.skipWords ?? '',
})

function SettingsPage({ state, send }: Backend) {
  // so sanh theo noi dung: backend gui state moi lien tuc, khong duoc xoa chu dang go
  const savedKey = JSON.stringify(pickDraft(state.settings))
  const savedDraft = useMemo(() => JSON.parse(savedKey) as Draft, [savedKey])
  const [d, setD] = useState<Draft>(savedDraft)
  useEffect(() => setD(savedDraft), [savedDraft])
  const [key, setKey] = useState('')
  const dirty = JSON.stringify(d) !== JSON.stringify(savedDraft)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const all = state.gemini?.models?.length ? state.gemini.models : MODELS
  const models = all.some(([v]) => v === d.geminiModel) ? all : [[d.geminiModel, d.geminiModel] as [string, string], ...all]
  // Gemini 1.x / 2.x khong co cap do tu duy
  const thinks = !/^gemini-(1|2)\./.test(d.geminiModel)
  return (
    <>
      <PageHeader icon={Settings} title="Cài đặt" description="Thư mục làm việc, Gemini API, cách trả lời bình luận. Kênh YouTube đăng nhập ở trang Tài khoản." actions={dirty ? <Pill tone="warning">Chưa lưu</Pill> : undefined} />
      <PageBody>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-3">
            <Card title="Thư mục làm việc">
              <div className="space-y-3">
                <FolderBar state={state} send={send} video />
                <FolderBar state={state} send={send} />
                <p className="text-[11px] text-muted-foreground">Thư mục video: video + thumbnail cùng tên cho trang Đăng video. Thư mục gốc: posts/ cho trang Đăng bài.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-8 px-3" disabled={!state.scan.root} onClick={() => send('create_skeleton')}><FolderPlus /> Tạo thư mục mẫu</Button>
                  <Button variant="outline" className="h-8 px-3" disabled={!state.scan.root} onClick={() => send('open_path', state.scan.root)}><FolderOpen /> Mở thư mục</Button>
                </div>
                <Field label="Tên kênh" hint="Dùng cho biến {ten_kenh} trong mẫu mô tả.">
                  <TextInput value={d.channel} onChange={(e) => set({ channel: e.target.value })} placeholder="Kênh của tôi" />
                </Field>
              </div>
            </Card>
            <Card title="Gemini API" hint={<Sparkles className="inline h-3.5 w-3.5" />}>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {state.secrets.gemini ? <Pill tone="success">Đã lưu API key{state.secrets.geminiEncrypted ? ' (mã hóa)' : ''}</Pill> : <Pill tone="muted">Chưa có API key</Pill>}
                  {state.secrets.gemini && <Button variant="subtle" className="h-8 px-3" onClick={() => send('gemini_clear')}><Trash2 /> Xóa</Button>}
                </div>
                <div className="flex gap-2">
                  <TextInput type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={state.secrets.gemini ? 'Nhập key mới để thay' : 'Dán Gemini API key (AIza…)'} aria-label="Gemini API key" />
                  <Button variant="outline" className="h-9 shrink-0 px-3" disabled={!key.trim()} onClick={() => { send('gemini_set', key); setKey('') }}><Save /> Lưu key</Button>
                </div>
                <Field label="Model"><Select label="Model" value={d.geminiModel} onChange={(v) => set({ geminiModel: v })} options={models} /></Field>
                {thinks && <Field label="Cấp độ tư duy" hint="Cao thì kỹ hơn nhưng chậm và tốn hạn mức hơn."><Select label="Cấp độ tư duy" value={d.geminiThinking ?? 'low'} onChange={(v) => set({ geminiThinking: v as Draft['geminiThinking'] })} options={THINKING} /></Field>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" className="h-8 px-3 text-xs" disabled={!state.secrets.gemini || state.gemini?.loading} onClick={() => send('gemini_models')}><RefreshCw /> {state.gemini?.loading ? 'Đang tải…' : 'Tải danh sách model mới nhất'}</Button>
                  {state.gemini?.at && !state.gemini.error && <span className="text-xs text-muted-foreground">{state.gemini.models.length} model</span>}
                  {state.gemini?.error && <span className="text-xs text-red-600 dark:text-red-400">{state.gemini.error}</span>}
                </div>
                <Button variant="subtle" className="h-8 px-3 text-xs" onClick={() => send('open_url', 'https://aistudio.google.com/apikey')}><ExternalLink /> Lấy key ở Google AI Studio</Button>
              </div>
            </Card>
          </div>
          <div className="space-y-3">
            <Card title="Trả lời bình luận">
              <div className="space-y-3">
                <Choice
                  name="Chế độ trả lời"
                  value={d.replyMode}
                  onChange={(replyMode) => set({ replyMode })}
                  options={[
                    { value: 'review', label: 'Duyệt tay trước khi gửi', hint: 'An toàn nhất. Gemini soạn nháp, bạn sửa hoặc bấm gửi.' },
                    { value: 'auto', label: 'Tự gửi bình luận ngắn, tích cực', hint: 'Câu hỏi, góp ý hoặc bình luận nhạy cảm vẫn chờ duyệt.' },
                    { value: 'off', label: 'Tắt' },
                  ]}
                />
                <Field label="Giọng văn và quy tắc cho Gemini">
                  <TextArea rows={5} value={d.replyStyle} onChange={(e) => set({ replyStyle: e.target.value })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tối đa trả lời mỗi giờ">
                    <TextInput type="number" min={1} max={200} value={d.replyPerHour} onChange={(e) => set({ replyPerHour: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })} />
                  </Field>
                  <Field label="Bỏ qua bình luận chứa từ" hint="Cách nhau bằng dấu phẩy.">
                    <TextInput value={d.skipWords} onChange={(e) => set({ skipWords: e.target.value })} placeholder="link, sub chéo" />
                  </Field>
                </div>
              </div>
            </Card>
            <Card title="Chủ đề" hint={<Palette className="inline h-3.5 w-3.5" />}>
              <ThemeGrid />
            </Card>
          </div>
        </div>
      </PageBody>
      <ActionBar>
        <Button variant="gradient" size="sm" disabled={!dirty} onClick={() => send('settings_save', d)}><Save /> Lưu cài đặt</Button>
        <Button variant="subtle" size="icon-sm" aria-label="Bỏ thay đổi" title="Bỏ thay đổi" disabled={!dirty} onClick={() => setD(savedDraft)}><RefreshCw /></Button>
      </ActionBar>
    </>
  )
}

/* ================= Cap nhat ================= */
function UpdatePage({ state, send }: Backend) {
  const u = state.update
  const busy = state.status !== 'idle'
  return (
    <>
      <PageHeader icon={ArrowUpCircle} title="Cập nhật" description="Tool tự kiểm tra bản mới mỗi lần mở. Bấm một nút để tải và cài." actions={<Pill tone="muted">Đang dùng bản {state.version || '—'}</Pill>} />
      <PageBody>
        <Card>
          {u.status === 'available' || u.status === 'downloading' || u.status === 'installing' ? (
            <div className="space-y-3">
              <h2 className="text-sm font-bold">Có bản mới {u.latest}</h2>
              {u.notes && <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">{u.notes}</pre>}
              {u.status === 'downloading' && (
                <div className="space-y-1.5">
                  <GradientProgress value={u.progress} />
                  <p className="text-xs text-muted-foreground">Đang tải… {u.progress}%</p>
                </div>
              )}
              {u.status === 'installing' && <p className="text-sm text-muted-foreground">Đang cài bản mới. Tool sẽ tự đóng và mở lại sau ít giây.</p>}
              {u.manual && <p className="text-xs text-muted-foreground">Bản đang chạy không tự cài được (chạy từ mã nguồn, hoặc chưa kéo vào thư mục Applications). Hãy tải bản mới ở trang phát hành.</p>}
            </div>
          ) : u.status === 'error' ? (
            <div className="space-y-2">
              <Pill tone="error">Không kiểm tra được</Pill>
              <p className="break-words text-sm text-muted-foreground">{u.error}</p>
            </div>
          ) : u.status === 'none' ? (
            <EmptyState icon={ArrowUpCircle} text="Bạn đang dùng bản mới nhất." />
          ) : (
            <EmptyState icon={RefreshCw} text={u.status === 'checking' ? 'Đang kiểm tra bản mới…' : 'Bấm nút kiểm tra lại ở góc trên để tìm bản mới.'} />
          )}
        </Card>
      </PageBody>
      <ActionBar>
        {u.status === 'available' && u.manual ? (
          <Button variant="gradient" size="sm" onClick={() => send('update_open')}><ExternalLink /> Mở trang tải về</Button>
        ) : (
          <Button variant="gradient" size="sm" disabled={busy || u.status !== 'available'} onClick={() => send('update_install')}>
            <Download /> {u.status === 'available' ? `Tải và cài bản ${u.latest}` : 'Tải và cài bản mới'}
          </Button>
        )}
        <Button variant="subtle" size="icon-sm" aria-label="Kiểm tra lại" title="Kiểm tra lại" disabled={busy || u.status === 'checking'} onClick={() => send('update_check')}><RefreshCw /></Button>
      </ActionBar>
    </>
  )
}

const WITH_BROWSER = new Set<string>() // trang Cong dong (khung Studio) nay o ui/src/pages

export default function App() {
  const backend = useBackend()
  const [page, setPage] = useState(() => (location.hash.slice(1) || 'videos'))
  const go = (p: string) => { setPage(p); history.replaceState(null, '', `#${p}`) }
  useEffect(() => {
    const onHash = () => setPage(location.hash.slice(1) || 'videos')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const errors = backend.state.logs.some((l) => l.level === 'error')
  const feature = FEATURE_PAGES.find((p) => p.id === page)
  const body =
    feature ? <feature.Page {...backend} go={go} />
    : page === 'videos' ? <VideosPage {...backend} go={go} />
    : page === 'presets' ? <PresetsPage {...backend} />
    : page === 'logs' ? <LogsPage {...backend} />
    : page === 'update' ? <UpdatePage {...backend} />
    : page === 'guide' ? <GuidePage {...backend} go={go} />
    : <SettingsPage {...backend} />
  return (
    <AppShell
      browser={WITH_BROWSER.has(page) || feature?.browser ? <Browser {...backend} /> : undefined}
      dock={page === 'logs' ? undefined : <LogDock logs={backend.state.logs} onOpen={() => go('logs')} />}
      sidebar={
        <Sidebar
          brand="YT Auto Studio"
          items={withFeatures([
            { id: 'videos', label: 'Đăng video', icon: Upload },
            { id: 'presets', label: 'Mẫu mặc định', icon: LayoutTemplate },
          ], false)}
          bottomItems={withFeatures([
            { id: 'guide', label: 'Hướng dẫn', icon: BookOpen },
            { id: 'logs', label: 'Nhật ký', icon: ScrollText, dot: errors },
            { id: 'update', label: 'Cập nhật', icon: ArrowUpCircle, dot: backend.state.update.status === 'available' },
            { id: 'settings', label: 'Cài đặt', icon: Settings },
          ], true)}
          activeId={page}
          onSelect={go}
        />
      }
    >
      {body}
    </AppShell>
  )
}
