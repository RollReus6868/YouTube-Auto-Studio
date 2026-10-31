// Trang "Đăng bài tự động": Gemini viet bai Cong dong cho cac kenh da chon (chu, anh, tham do, cau do, tham do anh),
// chia vao cac ngay / gio da chon roi dang hoac len lich tren YouTube. Trang thai: state.f.aiposts (src/features/aiposts.js).
// Lenh: aipost_save(patch), aipost_generate({ post }), aipost_run({ ids }), aipost_update({ id, patch }), aipost_regen({ id }),
//       aipost_remove({ ids }), aipost_clear_done(), aipost_pick_folder({ channelKey }).
import {
  CalendarClock, Check, ChevronDown, CircleAlert, CircleHelp, ExternalLink, FolderOpen, Image as ImageIcon, LayoutGrid,
  ListChecks, LoaderCircle, RefreshCw, Send, Sparkles, Square, Trash2, TriangleAlert, Type, Users, Wand2, type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ActionBar, Button, Card, Choice, EmptyState, Field, PageBody, PageHeader, Pill, Select, TextArea, TextInput, ToggleRow, cn, type Tone } from '../kit'
import type { PageProps } from './index'

type AiType = 'text' | 'image' | 'poll' | 'quiz' | 'image_poll'
type PerChannel = { request?: string; imageStyle?: string; imageFolder?: string; language?: string }
export type AiOpts = {
  channels: string[]; types: AiType[]; count: number; from: string; to: string; times: string; language: string
  hashtags: boolean; emoji: boolean; imageSource: 'gemini' | 'folder' | 'none'; imageModel: string; imageStyle: string; imageFolder: string
  style: string; review: boolean; perChannel: Record<string, PerChannel>
}
export type AiDraft = {
  id: string; channelKey: string; channelName: string; type: AiType; when: string | null; text: string
  options: { text: string; image?: string; imageUrl?: string }[]; answers: { text: string; correct: boolean }[]; explanation: string
  images: string[]; imageUrls: string[]; warnings?: string[]
  status: 'draft' | 'queued' | 'run' | 'done' | 'error'; step?: string; error: string; url: string; line: string; result?: string
}
export type AiPostsState = {
  busy: '' | 'generate' | 'post'; progress: string; drafts: AiDraft[]; warnings: string[]
  imageModels: [string, string][]; langs: [string, string][]
  channels: { key: string; name: string; handle: string; ucId: string }[]
  opts: AiOpts
}

const TYPES: Record<AiType, { label: string; icon: LucideIcon; hint: string; cls: string }> = {
  text: { label: 'Chữ', icon: Type, hint: 'Bài viết ngắn', cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  image: { label: 'Ảnh', icon: ImageIcon, hint: 'Chữ + 1 ảnh', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  poll: { label: 'Thăm dò', icon: ListChecks, hint: '2–4 lựa chọn', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  quiz: { label: 'Câu đố', icon: CircleHelp, hint: 'Có đáp án đúng', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  image_poll: { label: 'Thăm dò ảnh', icon: LayoutGrid, hint: 'Mỗi lựa chọn 1 ảnh', cls: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400' },
}
const STATUS: Record<AiDraft['status'], [Tone, string]> = { draft: ['muted', 'Bản nháp'], queued: ['info', 'Chờ đăng'], run: ['info', 'Đang đăng'], done: ['success', 'Xong'], error: ['error', 'Lỗi'] }
const STEP: Record<string, string> = { open: 'Mở tab Bài đăng', check: 'Kiểm tra trùng', compose: 'Soạn chữ', attach: 'Gắn nội dung', publish: 'Đăng / lên lịch', verify: 'Chờ xác nhận' }
const RESULT: Record<string, string> = { posted: 'Đã đăng', scheduled: 'Đã lên lịch', duplicate: 'Đã có sẵn, bỏ qua' }

const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const local = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${ymd(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}` }
const fmtWhen = (iso: string | null) => { if (!iso) return 'Đăng ngay'; const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}` }
const timesOf = (s: string) => [...new Set((s.match(/\d{1,2}\s*[:hg.]\s*\d{0,2}|\b\d{1,2}\b/g) || []))].length

// O nhap giu chu dang go; gui khi roi o (khong bi state moi ghi de luc dang go)
function Saved({ value, onSave, area, ...p }: { value: string; onSave: (v: string) => void; area?: boolean } & Record<string, unknown>) {
  const [v, setV] = useState(value)
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setV(value) }, [value, focus])
  const common = { value: v, onFocus: () => setFocus(true), onBlur: () => { setFocus(false); if (v !== value) onSave(v) }, ...p }
  return area
    ? <TextArea {...common} onChange={(e) => setV(e.target.value)} />
    : <TextInput {...common} onChange={(e) => setV(e.target.value)} />
}

const TypeBadge = ({ type }: { type: AiType }) => {
  const t = TYPES[type] || TYPES.text
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold', t.cls)}><t.icon className="h-3.5 w-3.5" /> {t.label}</span>
}
const Thumb = ({ src }: { src?: string }) => src
  ? <img src={src} alt="" className="h-16 w-16 shrink-0 rounded-md bg-muted object-cover" />
  : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><ImageIcon className="h-4 w-4 opacity-50" /></span>

function DraftCard({ d, busy, send }: { d: AiDraft; busy: boolean; send: PageProps['send'] }) {
  const locked = ['run', 'queued', 'done'].includes(d.status)
  const upd = (patch: Record<string, unknown>) => send('aipost_update', { id: d.id, patch })
  const [tone, label] = STATUS[d.status] || STATUS.draft
  return (
    <article className={cn('rounded-xl border bg-card p-3.5 shadow-sm', d.status === 'error' ? 'border-red-500/40' : d.status === 'done' ? 'border-emerald-500/30' : 'border-border/60')} aria-label={`Bài ${TYPES[d.type]?.label} ${d.channelName}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <TypeBadge type={d.type} />
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"><Users className="h-3 w-3" />{d.channelName}</span>
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"><CalendarClock className="h-3 w-3" />{fmtWhen(d.when)}</span>
        ) : (
          <input type="datetime-local" step={900} aria-label="Giờ đăng" value={local(d.when)} onChange={(e) => upd({ when: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="h-7 rounded-md border border-input bg-background/50 px-2 text-xs" />
        )}
        <span className="flex-1" />
        <Pill tone={tone}>{d.status === 'run' && d.step ? STEP[d.step] || label : d.status === 'done' && d.result ? RESULT[d.result] || label : label}</Pill>
      </div>
      <div className="mt-2.5 space-y-2">
        {locked ? <p className="whitespace-pre-wrap break-words text-sm">{d.text}</p>
          : <Saved area value={d.text} onSave={(text) => upd({ text })} aria-label="Nội dung bài" className="min-h-[88px] text-sm" />}
        {d.type === 'image' && d.imageUrls.length > 0 && <div className="flex gap-1.5">{d.imageUrls.map((u, i) => <Thumb key={i} src={u} />)}</div>}
        {(d.type === 'poll' || d.type === 'image_poll') && (
          <div className={cn(d.type === 'image_poll' ? 'flex flex-wrap gap-2' : 'space-y-1')}>
            {d.options.map((o, i) => (
              <div key={i} className={cn('flex items-center gap-2', d.type === 'image_poll' && 'w-40 flex-col items-stretch')}>
                {d.type === 'image_poll' && <Thumb src={o.imageUrl} />}
                {locked ? <span className="rounded-lg border border-border/60 px-3 py-1.5 text-sm">{o.text}</span>
                  : <Saved value={o.text} aria-label={`Lựa chọn ${i + 1}`} className="h-8 text-sm" maxLength={d.type === 'image_poll' ? 36 : 65}
                    onSave={(t) => upd({ options: d.options.map((x, j) => (j === i ? t : x.text)) })} />}
              </div>
            ))}
          </div>
        )}
        {d.type === 'quiz' && (
          <div className="space-y-1">
            {d.answers.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <button disabled={locked} aria-pressed={a.correct} aria-label={`Đáp án đúng: ${a.text}`} title="Đánh dấu đáp án đúng"
                  onClick={() => upd({ answers: d.answers.map((x, j) => ({ text: x.text, correct: j === i })) })}
                  className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', a.correct ? 'bg-emerald-500 text-white' : 'border-2 border-muted-foreground/40')}>
                  {a.correct && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>
                {locked ? <span className="text-sm">{a.text}</span>
                  : <Saved value={a.text} aria-label={`Đáp án ${i + 1}`} className="h-8 text-sm" maxLength={100} onSave={(t) => upd({ answers: d.answers.map((x, j) => ({ text: j === i ? t : x.text, correct: x.correct })) })} />}
              </div>
            ))}
            {locked ? (d.explanation && <p className="text-xs text-muted-foreground">Giải thích: {d.explanation}</p>)
              : <Saved value={d.explanation} aria-label="Giải thích đáp án" placeholder="Giải thích (tuỳ chọn)" className="h-8 text-xs" onSave={(explanation) => upd({ explanation })} />}
          </div>
        )}
        {((d.warnings && d.warnings.length > 0) || d.error) && (
          <ul className="space-y-0.5 text-xs">
            {d.error && <li className="flex gap-1.5 text-red-600 dark:text-red-400"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{d.error}</li>}
            {(d.warnings || []).map((w, i) => <li key={i} className="flex gap-1.5 text-amber-700 dark:text-amber-400"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {d.status === 'done' && d.line && <span className="text-xs text-muted-foreground">YouTube: {d.line}</span>}
          <span className="flex-1" />
          {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Xem bài</a>}
          {!locked && <Button variant="subtle" className="h-7 px-2 text-xs" disabled={busy} onClick={() => send('aipost_regen', { id: d.id })}><RefreshCw /> Viết lại</Button>}
          {!['run', 'queued'].includes(d.status) && <Button variant="subtle" className="h-7 px-2 text-xs" aria-label="Xoá bài" onClick={() => send('aipost_remove', { ids: [d.id] })}><Trash2 /></Button>}
        </div>
      </div>
    </article>
  )
}

function Section({ title, hint, children, open: start = true }: { title: string; hint?: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(start)
  return (
    <Card>
      <button className="flex w-full items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="flex-1"><span className="block text-sm font-bold">{title}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </Card>
  )
}

export function AiPostsPage({ state, send, go }: PageProps) {
  const s = state.f.aiposts as AiPostsState | undefined
  if (!s) return null
  const o = s.opts
  const save = (patch: Partial<AiOpts>) => send('aipost_save', patch)
  const savePc = (key: string, patch: PerChannel) => send('aipost_save', { perChannel: { [key]: patch } })
  const sel = new Set(o.channels)
  const picked = s.channels.filter((c) => sel.has(c.key))
  const toggleCh = (key: string) => save({ channels: sel.has(key) ? o.channels.filter((k) => k !== key) : [...o.channels, key] })
  const toggleType = (t: AiType) => save({ types: o.types.includes(t) ? o.types.filter((x) => x !== t) : [...o.types, t] })
  const drafts = s.drafts
  const waiting = drafts.filter((d) => d.status === 'draft' || d.status === 'error')
  const done = drafts.filter((d) => d.status === 'done').length
  const noKey = !state.secrets?.gemini
  const canWrite = !s.busy && picked.length > 0 && o.types.length > 0 && !noKey
  const today = ymd(new Date())
  const from = o.from && o.from >= today ? o.from : today
  const to = o.to && o.to >= from ? o.to : ymd(new Date(new Date(from + 'T00:00').getTime() + 6 * 864e5))
  const setRange = (days: number) => { const a = new Date(); const b = new Date(); b.setDate(a.getDate() + days - 1); save({ from: ymd(a), to: ymd(b) }) }
  const perDay = timesOf(o.times)
  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Đăng bài tự động"
        description="Gemini viết bài Cộng đồng theo nội dung từng kênh: chữ, ảnh, thăm dò, câu đố. Chọn kênh, loại bài, số bài, ngày giờ: tool lên lịch sẵn trên YouTube."
        actions={<Pill tone="muted">{drafts.length ? `${waiting.length} chờ đăng · ${done} xong` : 'Chưa có bài'}</Pill>}
      />
      <PageBody>
        {noKey && (
          <Card><div className="flex flex-wrap items-center gap-3"><CircleAlert className="h-5 w-5 text-amber-500" /><p className="min-w-0 flex-1 text-sm">Cần Gemini API key để viết bài.</p><Button variant="outline" className="h-8 px-3 text-xs" onClick={() => go('settings')}>Mở Cài đặt</Button></div></Card>
        )}
        <Section title="1. Kênh và yêu cầu cho Gemini" hint="Mỗi kênh một khung yêu cầu: chủ đề, đối tượng, giọng văn. Gemini viết theo đó.">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kênh đăng bài tự động">
            {s.channels.length === 0 ? (
              <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => go('accounts')}><Users /> Thêm và tick kênh ở trang Tài khoản</Button>
            ) : s.channels.map((c) => (
              <button key={c.key} aria-pressed={sel.has(c.key)} onClick={() => toggleCh(c.key)} title={c.handle}
                className={cn('inline-flex max-w-[220px] items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all',
                  sel.has(c.key) ? 'border-primary/40 bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground hover:bg-muted/50')}>
                {sel.has(c.key) && <Check className="h-3 w-3 shrink-0" />}<span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
          {picked.map((c) => {
            const pc = o.perChannel[c.key] || {}
            return (
              <div key={c.key} className="space-y-2 rounded-xl border border-border/60 p-3">
                <div className="text-sm font-bold">{c.name} <span className="font-normal text-muted-foreground">{c.handle}</span></div>
                <Field label="Yêu cầu cho Gemini (nội dung kênh, đối tượng, giọng văn, chủ đề nên viết / tránh)">
                  <Saved area value={pc.request || ''} aria-label={`Yêu cầu cho Gemini: ${c.name}`} className="min-h-[72px]"
                    placeholder="Ví dụ: Kênh kể chuyện Kinh Thánh cho người lớn, giọng trầm và bí ẩn. Viết về các nhân vật Cựu Ước, đặt câu hỏi gợi suy ngẫm, mời người xem bình luận suy nghĩ của họ."
                    onSave={(request) => savePc(c.key, { request })} />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  {o.imageSource !== 'none' && (o.imageSource === 'folder' ? (
                    <Field label="Thư mục ảnh của kênh" hint="Tool lấy ảnh chưa dùng trong thư mục này.">
                      <div className="flex gap-1.5">
                        <TextInput readOnly value={pc.imageFolder || o.imageFolder || ''} placeholder="Chưa chọn" className="text-xs" />
                        <Button variant="outline" className="h-9 shrink-0 px-2 text-xs" onClick={() => send('aipost_pick_folder', { channelKey: c.key })}><FolderOpen /> Chọn</Button>
                      </div>
                    </Field>
                  ) : (
                    <Field label="Phong cách ảnh (Gemini vẽ)">
                      <Saved value={pc.imageStyle || ''} aria-label={`Phong cách ảnh: ${c.name}`} placeholder={o.imageStyle || 'vd: tranh sơn dầu tối, ánh nến, điện ảnh'} onSave={(imageStyle) => savePc(c.key, { imageStyle })} />
                    </Field>
                  ))}
                  <Field label="Ngôn ngữ bài viết">
                    <Select label={`Ngôn ngữ: ${c.name}`} value={pc.language || ''} onChange={(language) => savePc(c.key, { language })} options={[['', `Như mặc định (${(s.langs.find(([k]) => k === o.language) || ['', o.language])[1]})`], ...s.langs]} />
                  </Field>
                </div>
              </div>
            )
          })}
        </Section>

        <Section title="2. Loại bài, số bài, ngày giờ đăng" hint={`${o.count} bài mỗi kênh, ${perDay || 0} giờ đăng mỗi ngày. YouTube lên lịch sẵn, không cần mở tool lúc tới giờ.`}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Loại bài">
            {(Object.keys(TYPES) as AiType[]).map((t) => {
              const on = o.types.includes(t)
              const T = TYPES[t]
              return (
                <button key={t} aria-pressed={on} onClick={() => toggleType(t)}
                  className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all', on ? 'border-primary/50 bg-primary/10' : 'border-dashed border-border hover:bg-muted/50')}>
                  <T.icon className={cn('h-4 w-4', on ? 'text-primary' : 'text-muted-foreground')} />
                  <span><span className={cn('block text-sm font-semibold', on && 'text-primary')}>{T.label}</span><span className="block text-[11px] text-muted-foreground">{T.hint}</span></span>
                </button>
              )
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="Số bài mỗi kênh">
              <Saved value={String(o.count)} type="number" min={1} max={60} aria-label="Số bài mỗi kênh" onSave={(v) => save({ count: Number(v) || 1 })} />
            </Field>
            <Field label="Từ ngày">
              <TextInput type="date" aria-label="Từ ngày" min={today} value={from} onChange={(e) => save({ from: e.target.value })} />
            </Field>
            <Field label="Đến ngày">
              <TextInput type="date" aria-label="Đến ngày" min={from} value={to} onChange={(e) => save({ to: e.target.value })} />
            </Field>
            <Field label="Giờ đăng mỗi ngày" hint="Mốc 15 phút, cách nhau dấu phẩy">
              <Saved value={o.times} aria-label="Giờ đăng mỗi ngày" placeholder="09:00, 20:00" onSave={(times) => save({ times })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-muted-foreground">Nhanh:</span>
            {[[1, 'Hôm nay'], [7, '7 ngày tới'], [14, '14 ngày'], [30, '30 ngày']].map(([n, l]) => (
              <button key={n} onClick={() => setRange(n as number)} className="rounded-lg border border-dashed border-border px-2 py-1 font-semibold text-muted-foreground hover:bg-muted/50">{l}</button>
            ))}
            {[['09:00, 20:00', '2 lần/ngày'], ['08:00, 13:00, 20:00', '3 lần/ngày'], ['19:00', 'Tối 19h']].map(([t, l]) => (
              <button key={t} onClick={() => save({ times: t })} className="rounded-lg border border-dashed border-border px-2 py-1 font-semibold text-muted-foreground hover:bg-muted/50">{l}</button>
            ))}
          </div>
        </Section>

        <Section title="3. Tuỳ chọn" hint="Ngôn ngữ, hashtag, nguồn ảnh, duyệt trước khi đăng." open={false}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3">
              <Field label="Ngôn ngữ mặc định"><Select label="Ngôn ngữ mặc định" value={o.language} onChange={(language) => save({ language })} options={s.langs} /></Field>
              <Field label="Giọng văn chung (mọi kênh)"><Saved value={o.style} aria-label="Giọng văn chung" placeholder="vd: ấm áp, truyền cảm hứng, câu ngắn" onSave={(style) => save({ style })} /></Field>
              <ToggleRow title="Thêm 2–3 hashtag" checked={o.hashtags} onChange={(hashtags) => save({ hashtags })} />
              <ToggleRow title="Dùng emoji" checked={o.emoji} onChange={(emoji) => save({ emoji })} />
              <ToggleRow title="Duyệt trước khi đăng" hint="Tắt: bấm một nút là Gemini viết và tool đăng luôn." checked={o.review} onChange={(review) => save({ review })} />
            </div>
            <div className="space-y-3">
              <Choice name="Nguồn ảnh" value={o.imageSource} onChange={(imageSource) => save({ imageSource })} options={[
                { value: 'gemini', label: 'Gemini vẽ ảnh', hint: 'Cần key có quyền tạo ảnh (tài khoản trả phí).' },
                { value: 'folder', label: 'Lấy ảnh trong thư mục', hint: 'Mỗi kênh một thư mục, không dùng lại ảnh đã đăng.' },
                { value: 'none', label: 'Không dùng ảnh', hint: 'Bài ảnh thành bài chữ, thăm dò ảnh thành thăm dò chữ.' },
              ]} />
              {o.imageSource === 'gemini' && <>
                <Field label="Model vẽ ảnh"><Select label="Model vẽ ảnh" value={o.imageModel} onChange={(imageModel) => save({ imageModel })} options={s.imageModels} /></Field>
                <Field label="Phong cách ảnh chung"><Saved value={o.imageStyle} aria-label="Phong cách ảnh chung" placeholder="vd: cinematic, dark biblical oil painting" onSave={(imageStyle) => save({ imageStyle })} /></Field>
              </>}
            </div>
          </div>
        </Section>

        {(s.progress || s.warnings.length > 0) && (
          <div className="space-y-1 px-1 text-xs">
            {s.progress && <div className="flex items-center gap-2 font-semibold text-primary"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />{s.progress}</div>}
            {s.warnings.map((w, i) => <div key={i} className="flex gap-1.5 text-amber-700 dark:text-amber-400"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</div>)}
          </div>
        )}

        {drafts.length === 0 ? (
          <EmptyState icon={Wand2} text="Chưa có bài. Chọn kênh, viết yêu cầu cho Gemini rồi bấm “Viết bài”." />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1 text-sm font-semibold">
              <span className="flex-1">Bài Gemini đã viết ({drafts.length})</span>
              {done > 0 && <Button variant="subtle" className="h-7 px-2 text-xs" onClick={() => send('aipost_clear_done')}>Ẩn bài đã đăng</Button>}
            </div>
            {drafts.map((d) => <DraftCard key={d.id} d={d} busy={!!s.busy} send={send} />)}
          </div>
        )}
      </PageBody>
      <ActionBar>
        {o.review ? (
          <Button variant="gradient" size="sm" disabled={!canWrite} onClick={() => send('aipost_generate', { post: false })}>
            {s.busy === 'generate' ? <><LoaderCircle className="animate-spin" /> Gemini đang viết…</> : <><Sparkles /> Viết bài ({picked.length} kênh × {o.count})</>}
          </Button>
        ) : (
          <Button variant="gradient" size="sm" disabled={!canWrite} onClick={() => send('aipost_generate', { post: true })}>
            {s.busy ? <><LoaderCircle className="animate-spin" /> {s.busy === 'post' ? 'Đang đăng…' : 'Gemini đang viết…'}</> : <><Sparkles /> Viết và đăng luôn ({picked.length} kênh × {o.count})</>}
          </Button>
        )}
        {waiting.length > 0 && (
          <Button variant={o.review ? 'gradient' : 'outline'} size="sm" disabled={!!s.busy} onClick={() => send('aipost_run', { ids: waiting.map((d) => d.id) })}>
            {s.busy === 'post' ? <><LoaderCircle className="animate-spin" /> Đang đăng…</> : <><Send /> Đăng {waiting.length} bài</>}
          </Button>
        )}
        {s.busy && <Button variant="outline" size="sm" onClick={() => send('stop')}><Square /> Dừng</Button>}
      </ActionBar>
    </>
  )
}

// ---- du lieu mau cho ?demo#aiposts ----
const svg = (h: number, label: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},60%,40%)"/><stop offset="1" stop-color="hsl(${h + 40},60%,18%)"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><text x="80" y="92" font-family="serif" font-size="24" fill="white" text-anchor="middle">${label}</text></svg>`,
)}`
const inDays = (d: number, h: number) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0); return t.toISOString() }
const dd = { options: [], answers: [], explanation: '', images: [], imageUrls: [], error: '', url: '', line: '' }
export const aipostsDemo: AiPostsState = {
  busy: '', progress: '', warnings: [],
  imageModels: [['gemini-2.5-flash-image', 'Gemini 2.5 Flash Image (nhanh, rẻ)'], ['gemini-3-pro-image-preview', 'Gemini 3 Pro Image (đẹp hơn, chậm hơn)']],
  langs: [['en', 'English'], ['vi', 'Vietnamese (tiếng Việt)'], ['es', 'Spanish']],
  channels: [
    { key: 'k1', name: 'Dark Bible Stories', handle: '@BibleStoriies', ucId: 'UC1' },
    { key: 'k2', name: 'Dark Faith', handle: '@DarkFaith', ucId: 'UC2' },
    { key: 'k3', name: 'Dark Bible - in a Nutshell', handle: '@nutshell', ucId: 'UC3' },
  ],
  opts: {
    channels: ['k1', 'k2'], types: ['text', 'image', 'poll', 'quiz'], count: 7, from: '', to: '', times: '09:00, 20:00', language: 'en',
    hashtags: true, emoji: true, imageSource: 'gemini', imageModel: 'gemini-2.5-flash-image', imageStyle: '', imageFolder: '', style: '', review: true,
    perChannel: { k1: { request: 'Bible stories for adults, dark and mysterious tone. Old Testament characters, thought-provoking questions.' } },
  },
  drafts: [
    { ...dd, id: 'a1', channelKey: 'k1', channelName: 'Dark Bible Stories', type: 'image', when: inDays(1, 9), status: 'draft', text: 'Before the flood, one man kept building while the world laughed. 🌧️ What would it take for you to keep going when no one believes you?\n\n#Noah #Genesis #Faith', imageUrls: [svg(210, 'Ark')], images: ['x'] },
    { ...dd, id: 'a2', channelKey: 'k1', channelName: 'Dark Bible Stories', type: 'poll', when: inDays(1, 20), status: 'draft', text: 'Which Old Testament story should we tell next?', options: [{ text: 'Samson and Delilah' }, { text: 'The witch of Endor' }, { text: 'Jonah and the great fish' }] },
    { ...dd, id: 'a3', channelKey: 'k2', channelName: 'Dark Faith', type: 'quiz', when: inDays(2, 9), status: 'done', result: 'scheduled', line: 'Đã lên lịch đăng vào 09:00', url: 'https://www.youtube.com/post/UgkxDemo', text: 'Who was taken up to heaven in a whirlwind?', answers: [{ text: 'Elijah', correct: true }, { text: 'Moses', correct: false }, { text: 'Enoch', correct: false }], explanation: '2 Kings 2:11.' },
    { ...dd, id: 'a4', channelKey: 'k2', channelName: 'Dark Faith', type: 'text', when: inDays(2, 20), status: 'error', error: 'Quá 20 giây vẫn chưa thấy "Đăng".', text: 'Faith is not the absence of doubt. It is the decision to walk anyway. 🙏 #Faith', warnings: ['Chưa có ảnh (Gemini tạo ảnh báo hết hạn mức): đăng thành bài chữ.'] },
  ],
}
