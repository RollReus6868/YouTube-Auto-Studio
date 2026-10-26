// Trang "Toi uu video": quet video da dang cua kenh, chon video, toi uu trong Studio theo mau
// (mau rieng cua kenh hoac mau mac dinh), roi thich + binh luan + ghim. Trang thai: state.f.optimize.
import { CheckCheck, ListChecks, LoaderCircle, RefreshCw, RotateCcw, Save, ScanSearch, Sparkles, Square, Undo2, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ActionBar, Button, Card, EmptyState, PageBody, PageHeader, Pill, cn, type Tone } from '../kit'
import { OptimizeTemplateEditor, defaultOptimizeTemplate, templateOf, type OptimizeTemplate, type Templates } from './OptimizeTemplateEditor'
import type { PageProps } from './index'

export type OptVideo = {
  id: string; title: string; visibility: string; date: string; dateNote?: string; views: string | number; comments: string | number
  status: 'new' | 'run' | 'done' | 'error'; step: string; error: string; warnings?: string[]
}
export type OptimizeState = {
  channelKey: string
  channels: { key: string; name: string; handle: string; ucId: string }[]
  videos: OptVideo[]
  busy: boolean
  at: string
  templates: Templates
}

const STATUS: Record<OptVideo['status'], [Tone, string]> = {
  new: ['muted', 'Chưa tối ưu'], run: ['active', 'Đang tối ưu'], done: ['success', 'Đã tối ưu'], error: ['error', 'Lỗi'],
}

function VideoRow({ v, on, toggle, busy }: { v: OptVideo; on: boolean; toggle: () => void; busy: boolean }) {
  const [tone, text] = STATUS[v.status]
  const warn = v.status === 'done' && v.warnings && v.warnings.length > 0
  return (
    <li className={cn('flex items-start gap-3 rounded-lg px-2 py-2', on ? 'bg-primary/5' : 'hover:bg-muted/40')}>
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--primary))]" checked={on} disabled={busy} onChange={toggle} aria-label={`Chọn ${v.title}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={v.title}>{v.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {[v.visibility, [v.date, v.dateNote].filter(Boolean).join(' · '), `${v.views} lượt xem`, `${v.comments} bình luận`].filter(Boolean).join('  •  ')}
        </p>
        {v.status === 'error' && v.error && <p className="mt-0.5 line-clamp-2 text-[11px] text-red-600 dark:text-red-400">{v.error}</p>}
        {warn && <p className="mt-0.5 line-clamp-2 text-[11px] text-amber-600 dark:text-amber-400" title={v.warnings!.join('\n')}>{v.warnings!.join(' · ')}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {v.status === 'run' ? <Pill tone="active">{v.step || text}</Pill> : <Pill tone={warn ? 'warning' : tone}>{warn ? 'Đã tối ưu, có cảnh báo' : text}</Pill>}
      </div>
    </li>
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
  return (
    <>
      <PageHeader
        icon={Wand2}
        title="Tối ưu video"
        description="Quét 10 video mới nhất của kênh, tối ưu trong YouTube Studio theo mẫu, rồi thích + bình luận + ghim."
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
            <Button variant="outline" size="sm" disabled={s.busy || !s.channelKey} onClick={() => send('optimize_list', s.channelKey)}>
              {s.busy && !videos.some((v) => v.status === 'run') ? <LoaderCircle className="animate-spin" /> : <ScanSearch />} Quét video
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
        <Card title="Video đã đăng" hint={s.at ? `${videos.length} video · ${done} đã tối ưu · quét lúc ${new Date(s.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Bấm “Quét video” để đọc 10 video mới nhất trong Studio'}>
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
                {videos.map((v) => <VideoRow key={v.id} v={v} on={sel.has(v.id)} toggle={() => toggle(v.id)} busy={s.busy} />)}
              </ul>
            </>
          ) : (
            <EmptyState icon={ListChecks} text={s.busy ? 'Đang quét video trong Studio…' : 'Chưa có danh sách. Tool mở trang Nội dung của kênh trong Studio và đọc mọi video (cả video mới chỉ có mô tả, thumbnail).'} />
          )}
        </Card>
        <TemplateCard s={s} send={send} />
      </PageBody>
      <ActionBar>
        {s.busy && videos.some((v) => v.status === 'run') ? (
          <Button variant="danger" size="sm" onClick={() => send('stop')}><Square /> Dừng sau video đang tối ưu</Button>
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
  templates: {
    default: { ...defaultOptimizeTemplate(), playlists: ['Dark Bible Study', 'Bible Podcast'] },
  },
  videos: [
    vid('Prem0000001', 'The Prophet Who Ran From God: Jonah’s Untold Story', 'Riêng tư', '27 thg 10, 2026', 'Đang công chiếu', 0, 0),
    vid('vyiSqHByq24', 'The Tower of Babel: Humanity’s First Rebellion Against God', 'Công khai', '25 thg 10, 2026', 'Đã xuất bản', 412, 9),
    vid('kQ1pB7xZt0E', 'Why Did God Harden Pharaoh’s Heart? The Dark Truth', 'Công khai', '24 thg 10, 2026', 'Đã xuất bản', 1280, 31),
    vid('Lm8sN2rTq5Y', 'The Nephilim: Giants of the Bible Explained', 'Công khai', '22 thg 10, 2026', 'Đã xuất bản', 3540, 57, 'done'),
    vid('Zx4cV6bNm1Q', 'Lilith: The Forbidden Story Before Eve', 'Công khai', '20 thg 10, 2026', 'Đã xuất bản', 2210, 44, 'done', { warnings: ['Đã bình luận nhưng chưa ghim được: menu không có “Ghim”.'] }),
    vid('Hj7gF3dSa9W', 'The Book of Enoch: Why It Was Removed', 'Không công khai', '18 thg 10, 2026', 'Đã tải lên', 96, 2, 'error', { error: 'Quá 5 giây vẫn chưa thấy "Lưu".' }),
    vid('Pq2wE8rTy6U', 'Cain’s Mark: What Was It Really?', 'Công khai', '15 thg 10, 2026', 'Đã xuất bản', 5021, 88, 'done'),
  ],
}
