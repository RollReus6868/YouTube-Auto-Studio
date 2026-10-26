import {
  AlertTriangle, ArrowUpCircle, BookOpen, CalendarClock, Copy, Download, Eraser, ExternalLink, FileVideo, FolderOpen, FolderPlus, Globe, Home,
  ImageIcon, KeyRound, LayoutTemplate, MessageSquareReply, Palette, Plus, RefreshCw, Save, ScrollText, Settings, Sparkles,
  SquarePlay, Square, Subtitles, Trash2, Upload, LogIn, LogOut,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { call, demoState, emptyState, isDemo, newPreset, type Job, type Preset, type Settings as SettingsT, type State, type VideoItem } from './api'
import {
  ActionBar, AppShell, BrowserPane, Button, Card, Choice, Dialog, EmptyState, Field, GradientProgress, PageBody, PageHeader, Pill, Select,
  Sidebar, TextArea, TextInput, ThemeGrid, ToggleRow, cn, useStickToBottom, type Tone,
} from './kit'
import { LogDock, LogLine } from './LogDock'
import { GuidePage } from './GuidePage'
import { CommentCard, FILTERS, isPending } from './CommentCard'
import { FEATURE_PAGES } from './pages'
import { StudioPicker, type AccountsState } from './pages/AccountsPage'
import { PresetOptimizeCard } from './pages/OptimizeTemplateEditor'

const PRIVACY: Record<Preset['privacy'], string> = { public: 'Công khai', unlisted: 'Không công khai', private: 'Riêng tư' }
const LANGS: [string, string][] = [['vi', 'Tiếng Việt'], ['en', 'Tiếng Anh'], ['ja', 'Tiếng Nhật'], ['ko', 'Tiếng Hàn'], ['zh', 'Tiếng Trung'], ['th', 'Tiếng Thái'], ['fr', 'Tiếng Pháp'], ['es', 'Tiếng Tây Ban Nha']]
const MODELS: [string, string][] = [['gemini-2.5-flash', 'Gemini 2.5 Flash (nhanh, rẻ)'], ['gemini-2.5-pro', 'Gemini 2.5 Pro (kỹ hơn)'], ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite (rẻ nhất)']]
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

function FolderBar({ state, send }: Backend) {
  const root = state.scan.root || state.settings?.root || ''
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/30 p-2 pl-3">
      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className={cn('min-w-0 flex-1 basis-40 truncate text-sm', root ? 'font-semibold' : 'text-muted-foreground')} title={root}>
        {root || 'Chưa chọn thư mục gốc'}
      </span>
      <Button variant="outline" className="h-8 px-3" onClick={() => send('choose_root')}>
        <FolderOpen /> {root ? 'Đổi' : 'Chọn thư mục'}
      </Button>
      <Button variant="outline" className="h-8 px-3" disabled={!root} onClick={() => send('scan')}>
        <RefreshCw /> Quét lại
      </Button>
    </div>
  )
}

/* ================= Dang video ================= */
const STEPS: Record<string, string> = { upload: 'Đang tải lên', thumbnail: 'Đang đặt thumbnail', playlist: 'Đang thêm vào playlist', subtitles: 'Đang thêm phụ đề' }

function JobLine({ job, send }: { job: Job; send: Backend['send'] }) {
  if (job.status === 'queued') return <Pill tone="muted">Đang chờ đăng</Pill>
  if (job.status === 'run') {
    return (
      <div className="space-y-1">
        <GradientProgress value={job.progress} />
        <p className="text-[11px] text-muted-foreground">{STEPS[job.step] || 'Đang xử lý'}{job.step === 'upload' ? ` · ${job.progress}%` : '…'}</p>
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
  v: VideoItem; job?: Job; open: boolean; onToggle: () => void; busy: boolean; connected: boolean; send: Backend['send']
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
            {v.video && <Chip icon={FileVideo}>{v.video}</Chip>}
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
            <dt className="text-muted-foreground">Hiển thị</dt><dd className="font-semibold">{v.meta.publishAt ? `Riêng tư → Công khai lúc ${fmtWhen(v.meta.publishAt)}` : PRIVACY[v.meta.privacy]}</dd>
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
  return (
    <Dialog
      open={!!d}
      onClose={() => send('draft_close')}
      title={`Gemini viết mô tả${v ? `: ${v.meta.title}` : ''}`}
      actions={
        <>
          <Button variant="outline" onClick={() => send('draft_close')}>Đóng</Button>
          <Button variant="outline" disabled={d?.loading} onClick={() => d && send('describe', d.id)}><RefreshCw /> Viết lại</Button>
          <Button disabled={!d || d.loading || !text.trim()} onClick={() => d && send('save_description', { id: d.id, text })}><Save /> Lưu vào info.txt</Button>
        </>
      }
    >
      {d?.loading ? <p className="animate-pulse">Gemini đang viết…</p>
        : d?.error ? <p className="text-red-600 dark:text-red-400">{d.error}</p>
        : <>
            <TextArea rows={10} value={text} onChange={(e) => setText(e.target.value)} aria-label="Mô tả Gemini viết" className="text-foreground" />
            <p className="text-[11px]">Sửa lại nếu cần. Bấm lưu sẽ thay phần mô tả (sau dòng ---) trong info.txt của video này.</p>
          </>}
    </Dialog>
  )
}

function VideosPage({ state, send, go }: Backend & { go: (p: string) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const ready = state.scan.videos.filter((v) => !v.errors.length && state.jobs[v.id]?.status !== 'done')
  const connected = !!state.youtube.channel
  const busy = state.status !== 'idle'
  const finished = Object.entries(state.jobs).filter(([id, j]) => j.status === 'done' && !state.scan.videos.some((v) => v.id === id))
  return (
    <>
      <PageHeader
        icon={Upload}
        title="Đăng video"
        description="Mỗi thư mục con trong videos/ là một video. Tool điền sẵn tiêu đề, mô tả, thẻ và lịch theo mẫu mặc định."
        actions={<>
          <UpdateBadge state={state} go={() => go('update')} />
          {connected ? <Pill tone="success" className="max-w-[220px]">{state.youtube.channel!.title}</Pill>
            : <button onClick={() => go('settings')} className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted/70">Chưa đăng nhập kênh</button>}
        </>}
      />
      <div className="shrink-0 space-y-3 px-4 pb-3">
        <FolderBar state={state} send={send} />
        {state.scan.errors.map((e) => (
          <div key={e} className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" /> <span className="min-w-0 flex-1">{e}</span>
            {/chưa có thư mục con/.test(e) && <Button variant="outline" className="h-8 px-3" onClick={() => send('create_skeleton')}><FolderPlus /> Tạo thư mục mẫu</Button>}
          </div>
        ))}
      </div>
      <PageBody>
        {finished.length > 0 && (
          <Card title="Vừa đăng xong" hint="thư mục đã chuyển vào da-dang/">
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
          <EmptyState icon={FileVideo} text={state.scan.root ? 'Chưa có video nào trong thư mục videos/. Mỗi video là một thư mục con chứa file video, thumbnail và info.txt (tùy chọn).' : 'Chọn thư mục gốc để tool quét video và bài viết của bạn.'} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{state.scan.videos.length} video · {ready.length} sẵn sàng · bấm vào một video để xem mô tả, nhờ Gemini viết, hoặc đăng riêng</p>
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
          <Button variant="gradient" size="sm" disabled={!connected || !ready.length} title={connected ? '' : 'Đăng nhập kênh YouTube trong Cài đặt trước'} onClick={() => send('upload')}>
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
                <Field label="Tiêu đề (bắt buộc)" hint={<span className={cn(chars(vars.tieu_de) > 100 && 'text-red-500')}>{chars(vars.tieu_de)}/100 ký tự sau khi điền</span>}>
                  <TextInput value={p.title} onChange={(e) => set({ title: e.target.value })} placeholder="{ten_video}" />
                </Field>
                <Field label="Mô tả" hint={<span className={cn(bytes(previewDesc) > 5000 && 'text-red-500')}>{bytes(previewDesc)}/5000 byte sau khi điền</span>}>
                  <TextArea rows={7} value={p.description} onChange={(e) => set({ description: e.target.value })} placeholder="Giới thiệu video, link mạng xã hội, hashtag…" />
                </Field>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-[11px] text-muted-foreground">Biến dùng được:</span>
                  {VARS.map((v) => <code key={v} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{v}</code>)}
                  <span className="text-[11px] text-muted-foreground">và mọi dòng “Khóa: giá trị” trong info.txt</span>
                </div>
                <Field label="Thẻ (cách nhau bằng dấu phẩy)" hint={<span className={cn(tagLen > 500 && 'text-red-500')}>{tagLen}/500 ký tự</span>}>
                  <TagInput value={tagText} onChange={(tags) => set({ tags })} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Danh mục"><Select label="Danh mục" value={p.categoryId} onChange={(v) => set({ categoryId: v })} options={state.categories} /></Field>
                  <Field label="Ngôn ngữ video"><Select label="Ngôn ngữ video" value={p.language} onChange={(v) => set({ language: v })} options={LANGS} /></Field>
                  <Field label="Playlist (tên)"><TextInput value={p.playlist} onChange={(e) => set({ playlist: e.target.value })} placeholder="Không thêm" /></Field>
                </div>
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
            <Card title="Nội dung thay đổi">
              <ToggleRow title="Có nội dung do AI tạo hoặc chỉnh sửa trông như thật" hint="Mục “Nội dung bị thay đổi” trong Studio. Bật nếu video có người, sự việc hoặc địa điểm thật được tạo/sửa bằng AI." checked={p.syntheticMedia} onChange={(v) => set({ syntheticMedia: v })} />
            </Card>
            <PresetOptimizeCard state={state} send={send} checked={!!p.optimizeAfterUpload} onToggle={(v) => set({ optimizeAfterUpload: v })} />
          </div>
          <div className="space-y-3">
            <Card title="Chế độ hiển thị">
              <Choice
                name="Chế độ hiển thị"
                value={p.privacy}
                onChange={(v) => set({ privacy: v })}
                options={[
                  { value: 'public', label: 'Công khai', hint: 'Mọi người đều xem được.' },
                  { value: 'unlisted', label: 'Không công khai', hint: 'Ai có đường liên kết đều xem được.' },
                  { value: 'private', label: 'Riêng tư', hint: 'Chỉ bạn xem được.' },
                ]}
              />
            </Card>
            <Card title="Lên lịch">
              <div className="space-y-3">
                <Choice
                  name="Lên lịch"
                  value={p.schedule.mode}
                  onChange={(mode) => set({ schedule: { ...p.schedule, mode } })}
                  options={[
                    { value: 'now', label: 'Đăng ngay khi tải lên', hint: 'Trừ khi tên thư mục hoặc info.txt có giờ đăng.' },
                    { value: 'times', label: 'Theo khung giờ cố định', hint: 'Mỗi video lấy khung giờ trống tiếp theo.' },
                    { value: 'interval', label: 'Cách nhau đều N giờ' },
                  ]}
                />
                {p.schedule.mode !== 'now' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={p.schedule.mode === 'times' ? 'Khung giờ (vd: 07:00, 19:00)' : 'Giờ bắt đầu'}>
                      <TimesInput value={p.schedule.times} onChange={(times) => set({ schedule: { ...p.schedule, times } })} single={p.schedule.mode === 'interval'} />
                    </Field>
                    {p.schedule.mode === 'interval' && (
                      <Field label="Cách nhau (giờ)">
                        <TextInput type="number" min={1} value={p.schedule.intervalHours} onChange={(e) => set({ schedule: { ...p.schedule, intervalHours: Math.max(1, Number(e.target.value) || 1) } })} />
                      </Field>
                    )}
                  </div>
                )}
                {p.schedule.mode !== 'now' && <p className="text-[11px] text-muted-foreground">Video lên lịch được tải lên ở chế độ Riêng tư, đến giờ YouTube tự chuyển sang Công khai.</p>}
              </div>
            </Card>
            <Card title="Tùy chọn khác">
              <div className="space-y-3">
                <Field label="Giấy phép">
                  <Select label="Giấy phép" value={p.license} onChange={(v) => set({ license: v as Preset['license'] })} options={[['youtube', 'Giấy phép chuẩn của YouTube'], ['creativeCommon', 'Creative Commons - Ghi công']]} />
                </Field>
                <ToggleRow title="Cho phép nhúng" checked={p.embeddable} onChange={(v) => set({ embeddable: v })} />
                <ToggleRow title="Thông báo cho người đăng ký" hint="Gửi thông báo khi video được đăng." checked={p.notifySubscribers} onChange={(v) => set({ notifySubscribers: v })} />
                <ToggleRow title="Hiện số lượt thích" checked={p.publicStatsViewable} onChange={(v) => set({ publicStatsViewable: v })} />
              </div>
            </Card>
            <Card title="Xem trước" hint="với video mẫu “Bí ẩn rừng sâu”, tập 1">
              <div className="space-y-2">
                <p className="break-words text-sm font-bold">{vars.tieu_de}</p>
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2.5 font-sans text-[13px] text-muted-foreground">{previewDesc}</pre>
              </div>
            </Card>
          </div>
        </div>
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

function TimesInput({ value, onChange, single }: { value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  const joined = (single ? value.slice(0, 1) : value).join(', ')
  const [text, setText] = useState(joined)
  useEffect(() => setText(joined), [joined])
  const commit = () => {
    const times = text.split(/[,\s]+/).map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, '0'))
    onChange(times.length ? times : ['19:00'])
  }
  return <TextInput value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} placeholder="19:00" />
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

/* ================= Binh luan ================= */
function CommentsPage({ state, send, go }: Backend & { go: (p: string) => void }) {
  const s = state.settings
  const [filter, setFilter] = useState('pending')
  const items = state.comments.items.filter((c) => (filter === 'all' ? true : filter === 'pending' ? isPending(c) : c.status === filter))
  const pending = state.comments.items.filter(isPending).length
  const connected = !!state.youtube.channel
  const mode = s?.replyMode === 'auto' ? 'Tự gửi lời khen ngắn' : s?.replyMode === 'off' ? 'Tắt tự động' : 'Duyệt tay'
  return (
    <>
      <PageHeader
        icon={MessageSquareReply}
        title="Bình luận"
        description="Bình luận mới dưới video của kênh. Gemini soạn sẵn câu trả lời, bạn sửa rồi gửi."
        actions={<>
          <button onClick={() => go('settings')} className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted/70">{mode}</button>
          <Pill tone="muted">Đã gửi {state.comments.sentLastHour}/{s?.replyPerHour ?? 20} trong 1 giờ</Pill>
        </>}
      />
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3">
        {FILTERS.map(([id, label]) => (
          <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}
            className={cn('rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all', filter === id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground hover:bg-muted/50')}>
            {label}{id === 'pending' && pending ? ` (${pending})` : ''}
          </button>
        ))}
        <span className="flex-1" />
        {state.comments.at && <span className="text-[11px] text-muted-foreground">Lấy lần cuối {fmtWhen(state.comments.at)}</span>}
      </div>
      <PageBody>
        {!connected ? (
          <EmptyState icon={MessageSquareReply} text="Đăng nhập kênh YouTube trong Cài đặt để tool đọc bình luận dưới video." />
        ) : items.length === 0 ? (
          <EmptyState icon={MessageSquareReply} text={filter === 'pending' ? 'Không có bình luận nào chờ trả lời. Bấm "Lấy bình luận mới" để kiểm tra.' : 'Chưa có bình luận nào ở mục này.'} />
        ) : items.map((c) => (
          <CommentCard key={c.id} c={c} canReply={state.secrets.gemini}
            on={{ send: (text) => send('comment_send', { id: c.id, text }), skip: () => send('comment_skip', c.id), redraft: () => send('comment_redraft', c.id) }} />
        ))}
        <p className="text-[11px] text-muted-foreground">Bình luận dưới bài đăng (và mọi kênh đã tick) có ở trang Cộng đồng, qua hộp thư YouTube Studio. Hai trang dùng chung mã bình luận và giới hạn mỗi giờ nên không trả lời trùng. Tool tự kiểm tra bình luận mới mỗi 10 phút khi đang mở.</p>
      </PageBody>
      <ActionBar>
        <Button variant="gradient" size="sm" disabled={!connected || state.comments.busy} onClick={() => send('comments_fetch')}>
          <RefreshCw className={cn(state.comments.busy && 'animate-spin')} /> {state.comments.busy ? 'Đang lấy và soạn trả lời…' : 'Lấy bình luận mới'}
        </Button>
      </ActionBar>
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
      </ActionBar>
    </>
  )
}

/* ================= Cai dat ================= */
type Draft = Pick<SettingsT, 'channel' | 'geminiModel' | 'replyStyle' | 'replyMode' | 'replyPerHour' | 'skipWords'>
const pickDraft = (s: SettingsT | null): Draft => ({
  channel: s?.channel ?? '', geminiModel: s?.geminiModel ?? 'gemini-2.5-flash', replyStyle: s?.replyStyle ?? '',
  replyMode: s?.replyMode ?? 'review', replyPerHour: s?.replyPerHour ?? 20, skipWords: s?.skipWords ?? '',
})

// Token API theo tung kenh: chon kenh (biet ma UC o trang Tai khoan) -> dang nhap tren trinh duyet ->
// tool chi nhan khi Google tra ve dung kenh do. Kenh dang video = kenh dung cho Dang video / Binh luan.
function ApiChannels({ state, send }: Pick<Backend, 'state' | 'send'>) {
  const [want, setWant] = useState('')
  const accs = (state.f.accounts as AccountsState | undefined)?.list ?? []
  const opts: [string, string][] = [['', 'Kênh bất kỳ (chọn trên Google)'], ...accs.flatMap((a) => a.channels.filter((c) => c.ucId).map((c) => [c.ucId, `${c.name} · ${a.label}`] as [string, string]))]
  const connected = state.settings?.apiChannels ?? []
  const active = state.youtube.channel
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {active ? <Pill tone="success" className="max-w-full">Kênh {active.title}</Pill> : <Pill tone="muted">Chưa đăng nhập kênh</Pill>}
        {active && <span className="text-[11px] text-muted-foreground">kênh đăng video</span>}
      </div>
      {connected.filter((c) => c.id !== active?.id).map((c) => (
        <div key={c.id} className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate font-semibold">{c.title}</span>
          <Button variant="outline" className="h-7 px-2 text-xs" disabled={state.status !== 'idle'} onClick={() => send('yt_use', c.id)}>Dùng để đăng video</Button>
          <Button variant="subtle" className="h-7 px-2 text-xs" disabled={state.status !== 'idle'} onClick={() => send('yt_logout', c.id)}><LogOut /> Ngắt</Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Select label="Kênh cần kết nối API" className="h-8 min-w-0 flex-1 basis-48 text-xs" value={want} onChange={setWant} options={opts} />
        <Button variant="default" className="h-8 px-3" disabled={!state.secrets.oauth || state.youtube.busy} onClick={() => send('yt_login', want ? { ucId: want } : undefined)}><LogIn /> {state.youtube.busy ? 'Đang chờ bạn đăng nhập…' : 'Đăng nhập kênh'}</Button>
        {active && <Button variant="subtle" className="h-8 px-3" disabled={state.status !== 'idle'} onClick={() => send('yt_logout', active.id)}><LogOut /> Ngắt kết nối</Button>}
      </div>
      <p className="text-[11px] text-muted-foreground">Mỗi kênh một lần đăng nhập. Chọn kênh ở trên (danh sách lấy từ trang Tài khoản), trên trang Google chọn đúng kênh đó. Tool từ chối nếu bạn chọn nhầm kênh.</p>
    </div>
  )
}

function SettingsPage({ state, send }: Backend) {
  // so sanh theo noi dung: backend gui state moi lien tuc, khong duoc xoa chu dang go
  const savedKey = JSON.stringify(pickDraft(state.settings))
  const savedDraft = useMemo(() => JSON.parse(savedKey) as Draft, [savedKey])
  const [d, setD] = useState<Draft>(savedDraft)
  useEffect(() => setD(savedDraft), [savedDraft])
  const [key, setKey] = useState('')
  const dirty = JSON.stringify(d) !== JSON.stringify(savedDraft)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const models = MODELS.some(([v]) => v === d.geminiModel) ? MODELS : [[d.geminiModel, d.geminiModel] as [string, string], ...MODELS]
  return (
    <>
      <PageHeader icon={Settings} title="Cài đặt" description="Thư mục làm việc, kết nối YouTube và Gemini, cách trả lời bình luận." actions={dirty ? <Pill tone="warning">Chưa lưu</Pill> : undefined} />
      <PageBody>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-3">
            <Card title="Thư mục làm việc">
              <div className="space-y-3">
                <FolderBar state={state} send={send} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-8 px-3" disabled={!state.scan.root} onClick={() => send('create_skeleton')}><FolderPlus /> Tạo thư mục mẫu</Button>
                  <Button variant="outline" className="h-8 px-3" disabled={!state.scan.root} onClick={() => send('open_path', state.scan.root)}><FolderOpen /> Mở thư mục</Button>
                </div>
                <Field label="Tên kênh" hint="Dùng cho biến {ten_kenh} trong mẫu mô tả.">
                  <TextInput value={d.channel} onChange={(e) => set({ channel: e.target.value })} placeholder="Kênh của tôi" />
                </Field>
              </div>
            </Card>
            <Card title="Kết nối YouTube API" hint={<SquarePlay className="inline h-3.5 w-3.5" />}>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Tạo OAuth client loại <b className="text-foreground">Desktop app</b> trong Google Cloud (bật YouTube Data API v3), tải file JSON rồi nhập vào đây.
                  File chỉ lưu trên máy bạn.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {state.secrets.oauth ? <Pill tone="success" className="max-w-full">Dự án {state.secrets.oauth.project_id || '(không tên)'} · {state.secrets.oauth.client_id}</Pill> : <Pill tone="muted">Chưa nhập OAuth client</Pill>}
                  <span className="flex-1" />
                  <Button variant="outline" className="h-8 px-3" onClick={() => send('oauth_import')}><KeyRound /> {state.secrets.oauth ? 'Nhập lại' : 'Nhập file JSON'}</Button>
                  {state.secrets.oauth && <Button variant="subtle" className="h-8 px-3" onClick={() => send('oauth_clear')}><Trash2 /> Xóa</Button>}
                </div>
                <Button variant="subtle" className="h-8 px-3 text-xs" onClick={() => send('open_url', 'https://console.cloud.google.com/apis/credentials')}><ExternalLink /> Mở Google Cloud Console</Button>
                <hr className="gradient-divider" />
                <ApiChannels state={state} send={send} />
                <p className="text-[11px] text-muted-foreground">Đăng nhập mở trong trình duyệt mặc định. Google có thể cảnh báo “ứng dụng chưa được xác minh”: bấm Nâng cao → Đi tới (không an toàn) vì đây là app của chính bạn.</p>
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
    : page === 'comments' ? <CommentsPage {...backend} go={go} />
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
            { id: 'comments', label: 'Bình luận', icon: MessageSquareReply },
          ], false)}
          bottomItems={withFeatures([
            { id: 'guide', label: 'Hướng dẫn API', icon: BookOpen },
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
