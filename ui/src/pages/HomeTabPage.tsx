// Trang "Trang chu kenh": them kenh moi vao "Kenh noi bat" va them phan "Danh sach phat don"
// vao The Trang chu cua cac kenh cu (tool lam tren YouTube Studio, tung kenh mot).
import { AlertTriangle, CheckCircle2, LayoutPanelTop, ListMusic, LoaderCircle, Play, Square, Star, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ActionBar, Button, Card, EmptyState, Field, PageBody, PageHeader, Pill, TextInput, ToggleRow, cn, type Tone } from '../kit'
import type { AccountsState } from './AccountsPage'
import type { PageProps } from './index'

type Parsed = { ok: boolean; error?: string; skip?: boolean; kind?: 'uc' | 'handle'; ucId?: string; handle?: string; url?: string; id?: string }
type Target = {
  key: string; name: string; status: 'queued' | 'run' | 'done' | 'skipped' | 'error' | 'stopped'
  step: string; error: string; channel: string; playlist: string; moved: boolean | null
}
type Chan = { key: string; name: string; handle: string; ucId: string; accountId: string; account?: string; subs?: string }
export type HomeTabState = {
  channelUrl: string; playlistUrl: string; position: string | number; doChannel: boolean; doPlaylist: boolean; selected: string[]
  check: { channel: Parsed; playlist: Parsed; position: { ok: boolean; value?: number; error?: string }; ok: boolean; errors: string[] }
  channels: Chan[]; newKey: string; targets: Target[]; busy: boolean; at: string
}

const STEP: Record<string, string> = {
  switch: 'Đang chuyển sang kênh', open: 'Đang mở Thẻ Trang chủ', channel: 'Đang thêm vào Kênh nổi bật',
  playlist: 'Đang thêm Danh sách phát đơn', move: 'Đang kéo tới vị trí', publish: 'Đang xuất bản',
}
const STATUS: Record<Target['status'], [Tone, string]> = {
  queued: ['muted', 'Đang chờ'], run: ['active', 'Đang chạy'], done: ['success', 'Đã xuất bản'],
  skipped: ['info', 'Đã có sẵn'], error: ['error', 'Lỗi'], stopped: ['warning', 'Đã dừng'],
}
const PART: Record<string, string> = { added: 'đã thêm', already: 'đã có sẵn', self: 'bỏ qua (kênh mới)', error: 'lỗi' }

const COLORS = ['bg-rose-500', 'bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-fuchsia-500', 'bg-teal-500']
const colorOf = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const Avatar = ({ name }: { name: string }) => (
  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white', colorOf(name))}>{([...name.trim()][0] || '?').toUpperCase()}</span>
)

// Kenh cua nguoi dung: lay truc tiep tu trang Tai khoan (luon moi), du phong danh sach cua tinh nang
function channelsOf(state: PageProps['state'], s: HomeTabState | undefined): Chan[] {
  const acc = state.f.accounts as AccountsState | undefined
  if (acc && acc.list && acc.list.some((a) => a.channels.length)) {
    return acc.list.flatMap((a) => a.channels.map((c) => ({ key: c.key, name: c.name, handle: c.handle, ucId: c.ucId, subs: c.subs, accountId: a.id, account: a.label })))
  }
  return s?.channels ?? []
}

function Hint({ p, text, touched }: { p?: Parsed; text: string; touched: boolean }) {
  if (p && !p.ok && p.error && touched) return <span className="flex items-start gap-1 text-red-600 dark:text-red-400"><AlertTriangle className="mt-px h-3 w-3 shrink-0" />{p.error}</span>
  if (p && p.ok && !p.skip && (p.ucId || p.handle || p.id)) {
    return <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3 shrink-0" />{p.id ? `Danh sách phát ${p.id}` : p.kind === 'uc' ? `Mã kênh ${p.ucId}` : `Handle ${p.handle}`}</span>
  }
  return <>{text}</>
}

function TargetLine({ t }: { t: Target }) {
  if (t.status === 'run') {
    return <span className="flex items-center gap-1.5 text-[11px] font-semibold text-primary"><LoaderCircle className="h-3 w-3 animate-spin" />{STEP[t.step] || 'Đang chạy'}…</span>
  }
  if (t.status === 'error') return <span className="line-clamp-2 text-[11px] text-red-600 dark:text-red-400">{t.error}</span>
  const parts = [t.channel && `Kênh nổi bật: ${PART[t.channel] || t.channel}`, t.playlist && `Danh sách phát: ${PART[t.playlist] || t.playlist}`, t.moved === false && 'chưa kéo được tới vị trí'].filter(Boolean)
  return parts.length ? <span className="truncate text-[11px] text-muted-foreground">{parts.join(' · ')}</span> : null
}

export function HomeTabPage({ state, send, go }: PageProps) {
  const s = state.f.hometab as HomeTabState | undefined
  const [channelUrl, setChannelUrl] = useState(s?.channelUrl ?? '')
  const [playlistUrl, setPlaylistUrl] = useState(s?.playlistUrl ?? '')
  const [position, setPosition] = useState(String(s?.position ?? ''))
  const [selected, setSelected] = useState<string[]>(s?.selected ?? [])
  const [touched, setTouched] = useState({ channel: !!s?.channelUrl, playlist: !!s?.playlistUrl })
  const loaded = useRef(!!s)
  // lan dau nhan trang thai tu may: lay gia tri da luu
  useEffect(() => {
    if (!s || loaded.current) return
    loaded.current = true
    setChannelUrl(s.channelUrl); setPlaylistUrl(s.playlistUrl); setPosition(String(s.position ?? '')); setSelected(s.selected)
    setTouched({ channel: !!s.channelUrl, playlist: !!s.playlistUrl })
  }, [s])
  useEffect(() => { send('hometab_refresh') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // luu + kiem tra (o may) sau khi ngung go 300 ms
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => send('hometab_save_input', { channelUrl, playlistUrl, position }), 300)
    return () => clearTimeout(t)
  }, [channelUrl, playlistUrl, position]) // eslint-disable-line react-hooks/exhaustive-deps

  const channels = channelsOf(state, s)
  const targets = new Map((s?.targets ?? []).map((t) => [t.key, t]))
  const busy = !!s?.busy
  const appBusy = state.status !== 'idle'
  const check = s?.check
  const doChannel = s?.doChannel ?? true
  const doPlaylist = s?.doPlaylist ?? true
  const newKey = s?.newKey ?? ''
  const pick = selected.filter((k) => channels.some((c) => c.key === k) && !(doChannel && k === newKey))
  const atEnd = position === '' || position === '0'
  const setSel = (next: string[]) => { setSelected(next); send('hometab_save_input', { selected: next }) }
  const toggle = (k: string) => setSel(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k])
  const done = (s?.targets ?? []).filter((t) => ['done', 'skipped'].includes(t.status)).length
  const failed = (s?.targets ?? []).filter((t) => t.status === 'error').length
  const groups = channels.reduce<Record<string, Chan[]>>((m, c) => { (m[c.account || ''] ||= []).push(c); return m }, {})
  const run = () => send('hometab_run', { targets: pick, channelUrl, playlistUrl, position, doChannel, doPlaylist })

  return (
    <>
      <PageHeader
        icon={LayoutPanelTop}
        title="Trang chủ kênh"
        description="Thêm kênh mới vào mục Kênh nổi bật và thêm Danh sách phát đơn vào Thẻ Trang chủ của các kênh cũ, rồi Xuất bản."
        actions={busy ? <Pill tone="active">Đang chạy {done + failed}/{s?.targets.length ?? 0} kênh</Pill> : s?.at ? <Pill tone={failed ? 'warning' : 'success'}>Lần trước: xong {done}, lỗi {failed}</Pill> : undefined}
      />
      <PageBody>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-3">
            <Card title="Kênh mới và danh sách phát">
              <div className="space-y-3">
                <Field label="Link kênh mới" hint={<Hint p={check?.channel} touched={touched.channel} text="Tùy chỉnh → Hồ sơ → URL của kênh, dạng youtube.com/channel/UC… (hoặc @handle)." />}>
                  <TextInput value={channelUrl} disabled={busy} placeholder="https://www.youtube.com/channel/UC…" aria-label="Link kênh mới"
                    onChange={(e) => setChannelUrl(e.target.value)} onBlur={() => setTouched((x) => ({ ...x, channel: true }))}
                    className={cn(touched.channel && check?.channel && !check.channel.ok && doChannel && 'border-red-500/60')} />
                </Field>
                <Field label="Link danh sách phát" hint={<Hint p={check?.playlist} touched={touched.playlist} text="Nội dung → Danh sách phát → ⋮ → Lấy đường liên kết có thể chia sẻ." />}>
                  <TextInput value={playlistUrl} disabled={busy} placeholder="https://www.youtube.com/playlist?list=PL…" aria-label="Link danh sách phát"
                    onChange={(e) => setPlaylistUrl(e.target.value)} onBlur={() => setTouched((x) => ({ ...x, playlist: true }))}
                    className={cn(touched.playlist && check?.playlist && !check.playlist.ok && doPlaylist && 'border-red-500/60')} />
                </Field>
              </div>
            </Card>
            <Card title="Việc cần làm trên mỗi kênh cũ">
              <div className="space-y-4">
                <ToggleRow title="Thêm vào Kênh nổi bật" hint="Thêm kênh mới vào mục Kênh nổi bật có sẵn. Chưa có mục này thì tool tạo mới. Kênh đã có thì bỏ qua."
                  checked={doChannel} onChange={(v) => send('hometab_save_input', { doChannel: v })} />
                <ToggleRow title="Thêm Danh sách phát đơn" hint="Thêm một phần Danh sách phát đơn với link ở trên. Đã có phần này thì bỏ qua."
                  checked={doPlaylist} onChange={(v) => send('hometab_save_input', { doPlaylist: v })} />
                <div className={cn('space-y-2 rounded-lg bg-muted/40 p-3', !doPlaylist && 'opacity-50')}>
                  <p className="text-xs font-bold text-muted-foreground">Vị trí phần Danh sách phát đơn</p>
                  <div role="radiogroup" aria-label="Vị trí" className="flex flex-wrap items-center gap-2">
                    {[['', 'Cuối trang chủ'], ['n', 'Vị trí thứ']].map(([v, label]) => {
                      const on = v === '' ? atEnd : !atEnd
                      return (
                        <button key={v} role="radio" aria-checked={on} disabled={!doPlaylist || busy}
                          onClick={() => setPosition(v === '' ? '' : atEnd ? '4' : position)}
                          className={cn('rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all', on ? 'border-primary/40 bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground hover:bg-muted/50')}>
                          {label}
                        </button>
                      )
                    })}
                    {!atEnd && (
                      <span className="w-20"><TextInput type="number" min={1} max={12} value={position} disabled={!doPlaylist || busy} aria-label="Số thứ tự vị trí"
                        onChange={(e) => setPosition(e.target.value)} className="h-8" /></span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {check?.position && !check.position.ok ? <span className="text-red-600 dark:text-red-400">{check.position.error}</span>
                      : atEnd ? 'Studio thêm phần mới ở cuối, tool để nguyên.' : `Sau khi thêm, tool kéo phần này lên vị trí ${position} (đếm từ trên xuống, tính cả Kênh nổi bật).`}
                  </p>
                </div>
              </div>
            </Card>
          </div>
          <Card title="Kênh cũ cần thêm" hint={channels.length ? `đã chọn ${pick.length}/${channels.length}` : undefined}>
            {channels.length === 0 ? (
              <div>
                <EmptyState icon={Users} text='Chưa có kênh nào. Thêm tài khoản Google ở trang "Tài khoản" và bấm "Làm mới kênh", danh sách kênh sẽ hiện ở đây.' />
                <div className="flex justify-center"><Button variant="outline" onClick={() => go('accounts')}><Users /> Mở trang Tài khoản</Button></div>
              </div>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Button variant="outline" className="h-8 px-3 text-xs" disabled={busy} onClick={() => setSel(channels.map((c) => c.key).filter((k) => k !== newKey))}>Chọn tất cả</Button>
                  <Button variant="subtle" className="h-8 px-3 text-xs" disabled={busy || !selected.length} onClick={() => setSel([])}>Bỏ chọn</Button>
                </div>
                <div className="space-y-3">
                  {Object.entries(groups).map(([account, list]) => (
                    <div key={account}>
                      {account && <p className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{account}</p>}
                      <ul className="space-y-0.5">
                        {list.map((c) => {
                          const isNew = c.key === newKey
                          const t = targets.get(c.key)
                          const on = selected.includes(c.key) && !(isNew && doChannel)
                          return (
                            <li key={c.key} className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5', on ? 'bg-primary/5' : 'hover:bg-muted/50', isNew && 'opacity-70')}>
                              <input type="checkbox" className="h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--primary))]" checked={on}
                                disabled={busy || (isNew && doChannel)} aria-label={`Chọn kênh ${c.name}`} onChange={() => toggle(c.key)} />
                              <Avatar name={c.name} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-semibold">{c.name}</span>
                                  {isNew && <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-500/10 px-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"><Star className="h-2.5 w-2.5" />Kênh mới</span>}
                                </div>
                                {t ? <TargetLine t={t} /> : <div className="truncate text-[11px] text-muted-foreground">{[c.handle, c.subs].filter(Boolean).join(' · ') || ' '}</div>}
                              </div>
                              {t && <Pill tone={STATUS[t.status][0]} className="shrink-0">{STATUS[t.status][1]}</Pill>}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ListMusic className="mt-px h-3 w-3 shrink-0" />
          Tool mở YouTube Studio của từng kênh trong cửa sổ chạy ngầm (Tùy chỉnh → Thẻ Trang chủ), làm giống thao tác tay, rồi bấm Xuất bản. Trang chủ có tối đa 12 phần; kênh đã đủ 12 phần sẽ báo lỗi riêng cho kênh đó.
        </p>
      </PageBody>
      <ActionBar>
        {busy ? (
          <Button variant="danger" size="xl" className="flex-1" onClick={() => send('stop')}><Square /> Dừng sau kênh đang làm</Button>
        ) : (
          <Button variant="gradient" size="xl" className="flex-1" disabled={appBusy || !check?.ok || !pick.length} onClick={run}>
            <Play /> {pick.length ? `Chạy cho ${pick.length} kênh` : 'Chọn kênh cũ để chạy'}
          </Button>
        )}
      </ActionBar>
    </>
  )
}

const DEMO_CH = 'https://www.youtube.com/channel/UCLBuhr6vMvZQPqZpTTslWaQ'
const DEMO_PL = 'https://www.youtube.com/playlist?list=PLcWuSJdVMhk4xYz0123456789abcdEF'
// Du lieu mau cho ?demo#hometab (kenh lay tu du lieu mau cua trang Tai khoan)
export const hometabDemo: HomeTabState = {
  channelUrl: DEMO_CH, playlistUrl: DEMO_PL, position: '4', doChannel: true, doPlaylist: true,
  selected: ['thang:Dark Bible Room', 'UCPEy_NwKFmc3R1FzCv806pQ', 'thang:28k s', 'thang:Dark Bible Study', 'UCC0AJ_NoUOq5718yK4_ehBw', 'thang:Simple Bible Animation'],
  check: {
    ok: true, errors: [],
    channel: { ok: true, kind: 'uc', ucId: 'UCLBuhr6vMvZQPqZpTTslWaQ', url: DEMO_CH },
    playlist: { ok: true, id: 'PLcWuSJdVMhk4xYz0123456789abcdEF', url: DEMO_PL },
    position: { ok: true, value: 4 },
  },
  channels: [], newKey: 'UCLBuhr6vMvZQPqZpTTslWaQ', busy: true, at: '',
  targets: [
    { key: 'thang:Dark Bible Room', name: 'Dark Bible Room', status: 'done', step: '', error: '', channel: 'added', playlist: 'added', moved: true },
    { key: 'UCPEy_NwKFmc3R1FzCv806pQ', name: 'Dark Bible - in a Nutshell', status: 'skipped', step: '', error: '', channel: 'already', playlist: 'already', moved: null },
    { key: 'thang:28k s', name: '28k s', status: 'error', step: '', error: 'Trang chủ đã có 12/12 phần kênh (giới hạn của YouTube). Xóa bớt một phần rồi chạy lại.', channel: 'added', playlist: 'error', moved: null },
    { key: 'thang:Dark Bible Study', name: 'Dark Bible Study', status: 'run', step: 'playlist', error: '', channel: 'added', playlist: '', moved: null },
    { key: 'UCC0AJ_NoUOq5718yK4_ehBw', name: 'Dark Bible Stories', status: 'queued', step: '', error: '', channel: '', playlist: '', moved: null },
    { key: 'thang:Simple Bible Animation', name: 'Simple Bible Animation', status: 'queued', step: '', error: '', channel: '', playlist: '', moved: null },
  ],
}
