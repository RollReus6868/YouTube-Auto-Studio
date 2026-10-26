// Trang "Tai khoan": tai khoan Google (moi tai khoan mot phien rieng), dang nhap trong khung
// Studio ben phai, cac kenh cua tung tai khoan va kenh tool duoc lam viec.
import { Check, Info, ListRestart, LoaderCircle, LogIn, LogOut, MonitorPlay, Pencil, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Dialog, EmptyState, Field, PageBody, PageHeader, Pill, TextInput, cn, type Tone } from '../kit'
import type { PageProps, Send } from './index'

export type Channel = { key: string; name: string; handle: string; subs: string; ucId: string; avatar?: string; enabled: boolean; active: boolean }
export type Account = {
  id: string; label: string; partition: string; status: 'unchecked' | 'signed-in' | 'needs-sign-in'
  email: string; name: string; checkedAt: string; channels: Channel[]
}
export type AccountsState = {
  list: Account[]
  login: string | null // tai khoan dang dang nhap trong khung
  busy: Record<string, string>
  pane: { accountId: string; channelKey: string }
  paneBusy: boolean
}

const STATUS: Record<Account['status'], [Tone, string]> = {
  'signed-in': ['success', 'Đã đăng nhập'],
  'needs-sign-in': ['error', 'Chưa đăng nhập'],
  unchecked: ['muted', 'Chưa kiểm'],
}
const COLORS = ['bg-rose-500', 'bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-fuchsia-500', 'bg-teal-500']
const colorOf = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const initial = (s: string) => ([...s.trim()][0] || '?').toUpperCase()

function Avatar({ name, big }: { name: string; big?: boolean }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full font-extrabold text-white', colorOf(name), big ? 'h-10 w-10 text-base' : 'h-7 w-7 text-xs')}>
      {initial(name)}
    </span>
  )
}

// Anh dai dien kenh (yt3.ggpht.com, doc tu Studio); khong co anh hoac anh loi -> vong tron chu cai
export function ChannelAvatar({ name, src, className = 'h-8 w-8 text-xs' }: { name: string; src?: string; className?: string }) {
  const [bad, setBad] = useState('')
  if (!src || src === bad) {
    return <span className={cn('flex shrink-0 items-center justify-center rounded-full font-extrabold text-white', colorOf(name), className)} aria-hidden>{initial(name)}</span>
  }
  return <img src={src} alt="" aria-hidden loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBad(src)} className={cn('shrink-0 rounded-full bg-muted object-cover', className)} />
}

function ChannelRow({ c, send, onPane, paneOn }: { c: Channel; send: Send; onPane: () => void; paneOn: boolean }) {
  return (
    <li className={cn('flex items-start gap-2.5 rounded-lg px-2 py-2', c.enabled ? 'bg-primary/5' : 'hover:bg-muted/50')}>
      <input
        type="checkbox"
        className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--primary))]"
        checked={c.enabled}
        aria-label={`Dùng kênh ${c.name}`}
        onChange={(e) => send('accounts_enable', { key: c.key, enabled: e.target.checked })}
      />
      <ChannelAvatar name={c.name} src={c.avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{c.name}</span>
          {c.active && <span title="Kênh Studio đang chọn" className="text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /></span>}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{[c.handle, c.subs].filter(Boolean).join(' · ') || ' '}</div>
        <div className={cn('truncate text-[10.5px]', c.ucId ? 'font-mono text-muted-foreground' : 'italic text-muted-foreground/70')}>
          {c.ucId || 'Mã kênh: tool tự biết sau lần chuyển kênh đầu'}
        </div>
      </div>
      <Button variant="subtle" className={cn('h-7 w-7 shrink-0 rounded-md p-0 [&_svg]:size-3.5', paneOn && 'bg-primary/10 text-primary')} title="Mở kênh này trong khung Studio" aria-label={`Mở ${c.name} trong khung Studio`} onClick={onPane}>
        <MonitorPlay />
      </Button>
    </li>
  )
}

function AccountCard({ a, s, send, ask }: { a: Account; s: AccountsState; send: Send; ask: (d: Ask) => void }) {
  const busy = s.busy[a.id]
  const [tone, text] = STATUS[a.status]
  const loggingIn = s.login === a.id
  const enabled = a.channels.filter((c) => c.enabled).length
  return (
    <article className={cn('rounded-xl border bg-card/40 p-3', loggingIn ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border/50')} aria-label={`Tài khoản ${a.label}`}>
      <div className="flex items-start gap-3">
        <Avatar name={a.label} big />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-extrabold">{a.label}</h3>
            <span className="flex-1" />
            {busy ? <Pill tone="active">{busy}</Pill> : <Pill tone={tone}>{text}</Pill>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {a.email || (a.status === 'signed-in' ? 'Đã đăng nhập Google' : 'Chưa biết email')}
            {a.channels.length > 0 && ` · ${a.channels.length} kênh, dùng ${enabled}`}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button variant={a.status === 'signed-in' ? 'outline' : 'default'} className="h-8 px-2.5 text-xs" disabled={loggingIn} onClick={() => send('accounts_login', a.id)}><LogIn /> Đăng nhập</Button>
        <Button variant="outline" className="h-8 px-2.5 text-xs" disabled={!!busy} onClick={() => send('accounts_check', a.id)}><RefreshCw /> Kiểm tra</Button>
        <Button variant="outline" className="h-8 px-2.5 text-xs" disabled={!!busy || a.status === 'needs-sign-in'} onClick={() => send('accounts_channels', a.id)}><ListRestart /> Làm mới kênh</Button>
        <span className="flex-1" />
        <Button variant="subtle" className="h-8 w-8 p-0" title="Đổi tên" aria-label={`Đổi tên ${a.label}`} onClick={() => ask({ kind: 'rename', a })}><Pencil /></Button>
        <Button variant="subtle" className="h-8 w-8 p-0" title="Đăng xuất" aria-label={`Đăng xuất ${a.label}`} onClick={() => ask({ kind: 'signout', a })}><LogOut /></Button>
        <Button variant="danger" className="h-8 w-8 p-0" title="Xóa tài khoản" aria-label={`Xóa ${a.label}`} disabled={s.list.length <= 1} onClick={() => ask({ kind: 'remove', a })}><Trash2 /></Button>
      </div>
      {loggingIn && (
        <div className="mt-3 rounded-lg bg-primary/10 p-3 text-xs leading-relaxed">
          <p>Đăng nhập Google trong khung <b>YouTube Studio</b> bên phải, như trên trình duyệt (kể cả xác minh 2 bước). Tool không thấy và không lưu mật khẩu.</p>
          <Button variant="gradient" className="mt-2 h-9 px-4" onClick={() => send('accounts_login_done')}><Check /> Xong, đóng lại</Button>
        </div>
      )}
      <div className="mt-3">
        {a.channels.length ? (
          <ul className="space-y-0.5">
            {a.channels.map((c) => (
              <ChannelRow key={c.key} c={c} send={send} paneOn={s.pane.channelKey === c.key} onPane={() => send('accounts_pane', { accountId: a.id, channelKey: c.key })} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            {a.status === 'signed-in' ? 'Chưa đọc danh sách kênh. Bấm "Làm mới kênh".' : 'Đăng nhập xong, tool tự đọc các kênh của tài khoản này.'}
          </p>
        )}
      </div>
    </article>
  )
}

type Ask = { kind: 'add' } | { kind: 'rename'; a: Account } | { kind: 'signout'; a: Account } | { kind: 'remove'; a: Account }

function AskDialog({ d, close, send }: { d: Ask | null; close: () => void; send: Send }) {
  const [text, setText] = useState('')
  const [shown, setShown] = useState<Ask | null>(null)
  if (d !== shown) { setShown(d); setText(d && d.kind === 'rename' ? d.a.label : '') }
  if (!d) return null
  const done = (cmd: string, payload: unknown) => { send(cmd, payload); close() }
  if (d.kind === 'add' || d.kind === 'rename') {
    const add = d.kind === 'add'
    return (
      <Dialog open onClose={close} title={add ? 'Thêm tài khoản Google' : `Đổi tên "${d.a.label}"`} actions={
        <>
          <Button variant="subtle" onClick={close}>Hủy</Button>
          {add
            ? <Button variant="gradient" className="px-4" onClick={() => done('accounts_add', { label: text, login: true })}><LogIn /> Thêm và đăng nhập</Button>
            : <Button disabled={!text.trim()} onClick={() => done('accounts_rename', { id: d.a.id, label: text })}>Lưu</Button>}
        </>
      }>
        <Field label="Tên gợi nhớ" hint={add ? 'Ví dụ: Nick Thắng, Kênh Kinh Thánh. Mỗi tài khoản Google một mục.' : undefined}>
          <TextInput autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Tài khoản 2" aria-label="Tên gợi nhớ" />
        </Field>
      </Dialog>
    )
  }
  const out = d.kind === 'signout'
  return (
    <Dialog open onClose={close} title={out ? `Đăng xuất "${d.a.label}"?` : `Xóa "${d.a.label}"?`} actions={
      <>
        <Button variant="subtle" onClick={close}>Hủy</Button>
        <Button variant="danger" className="px-4" onClick={() => done(out ? 'accounts_signout' : 'accounts_remove', d.a.id)}>{out ? <><LogOut /> Đăng xuất</> : <><Trash2 /> Xóa</>}</Button>
      </>
    }>
      <p>{out
        ? 'Tool xóa phiên đăng nhập Google của tài khoản này (trong tool). Danh sách kênh và các kênh đã tick được giữ lại để đăng nhập lại sau.'
        : 'Tool xóa tài khoản này, các kênh của nó và phiên đăng nhập trong tool. Tài khoản Google và kênh YouTube của bạn không bị ảnh hưởng.'}</p>
    </Dialog>
  )
}

export function AccountsPage({ state, send }: PageProps) {
  const s = state.f.accounts as AccountsState | undefined
  const [ask, setAsk] = useState<Ask | null>(null)
  const list = s?.list ?? []
  const enabled = list.reduce((n, a) => n + a.channels.filter((c) => c.enabled).length, 0)
  return (
    <>
      <PageHeader
        icon={Users}
        title="Tài khoản"
        description="Bước 1: đăng nhập tài khoản Google và chọn kênh tool được làm việc."
        actions={<Button variant="gradient" className="h-9 px-3" onClick={() => setAsk({ kind: 'add' })}><UserPlus /> Thêm tài khoản</Button>}
      />
      <PageBody>
        {!s ? (
          <EmptyState icon={Users} text="Đang tải danh sách tài khoản…" />
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-xl bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>Mỗi tài khoản Google có phiên đăng nhập riêng trong tool. Tick các kênh tool được tự động làm việc ({enabled} kênh đang dùng). Tool không bao giờ hỏi hay lưu mật khẩu.</p>
            </div>
            {list.map((a) => <AccountCard key={a.id} a={a} s={s} send={send} ask={setAsk} />)}
          </>
        )}
      </PageBody>
      <AskDialog d={ask} close={() => setAsk(null)} send={send} />
    </>
  )
}

// O chon tai khoan / kenh cho khung Studio (dat tren dau khung, trang nao co khung cung dung)
export function StudioPicker({ state, send }: { state: PageProps['state']; send: Send }) {
  const s = state.f.accounts as AccountsState | undefined
  if (!s || !s.list.length) return null
  const value = s.pane.channelKey ? `c:${s.pane.channelKey}` : `a:${s.pane.accountId}`
  const cur = s.pane.channelKey ? s.list.flatMap((a) => a.channels).find((c) => c.key === s.pane.channelKey) : undefined
  const pick = (v: string) => {
    if (v.startsWith('a:')) return send('accounts_pane', { accountId: v.slice(2) })
    const key = v.slice(2)
    const a = s.list.find((x) => x.channels.some((c) => c.key === key))
    if (a) send('accounts_pane', { accountId: a.id, channelKey: key })
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {s.paneBusy && <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-label="Đang chuyển kênh" />}
      {cur && !s.paneBusy && <ChannelAvatar key={cur.key} name={cur.name} src={cur.avatar} className="h-5 w-5 text-[10px]" />}
      <select
        aria-label="Tài khoản / kênh trong khung Studio"
        value={value}
        disabled={s.paneBusy || !!s.login}
        onChange={(e) => pick(e.target.value)}
        className="h-7 max-w-[260px] truncate rounded-md border border-input bg-background/50 px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {s.list.map((a) => (
          <optgroup key={a.id} label={a.label}>
            <option value={`a:${a.id}`}>{a.label} · Studio</option>
            {a.channels.filter((c) => c.enabled || c.key === s.pane.channelKey).map((c) => <option key={c.key} value={`c:${c.key}`}>↳ {c.name}</option>)}
          </optgroup>
        ))}
      </select>
    </span>
  )
}

const ch = (name: string, handle: string, subs: string, avatar: string, ucId = '', enabled = false, active = false): Channel => ({ key: ucId || `thang:${name}`, name, handle, subs, avatar, ucId, enabled, active })
// anh dai dien mau cho ?demo: SVG nhung (khong ra mang)
const GLYPH = {
  cross: '<rect x="39" y="18" width="10" height="52" rx="2"/><rect x="24" y="32" width="40" height="10" rx="2"/>',
  book: '<path d="M18 26c10-4 19-3 26 3v38c-7-6-16-7-26-3zM70 26c-10-4-19-3-26 3v38c7-6 16-7 26-3z"/>',
  flame: '<path d="M44 16c4 14 18 20 18 36a18 18 0 0 1-36 0c0-9 5-14 9-18 0 7 3 11 7 12-3-10-1-21 2-30z"/>',
  play: '<path d="M34 24l30 20-30 20z"/>',
}
const demoImg = (bg: string, glyph: keyof typeof GLYPH, fg = '#f5e6c8') =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="88" height="88" fill="url(#g)"/><g fill="${fg}">${GLYPH[glyph]}</g></svg>`)}`
export const accountsDemo: AccountsState = {
  login: null,
  busy: {},
  paneBusy: false,
  pane: { accountId: 'thang', channelKey: 'UCLBuhr6vMvZQPqZpTTslWaQ' },
  list: [
    {
      id: 'thang', label: 'Nick Thắng', partition: 'persist:youtube', status: 'signed-in', email: 'athang@versee.net', name: 'Thắng A', checkedAt: '2026-10-26T12:00:00Z',
      channels: [
        ch('Dark Bible Room', '@DarkRoom6868', '415 người đăng ký', demoImg('#7c2d12', 'book')),
        ch('Dark Bible - in a Nutshell', '@Bible-inaNutshell999', '220 người đăng ký', demoImg('#1e3a8a', 'book', '#fde68a'), 'UCPEy_NwKFmc3R1FzCv806pQ', true),
        ch('28k s', '@28ks-p5n', 'Không có người đăng ký', ''), // khong co anh: chu cai
        ch('Dark Faith 2nd', '@DarkFaith9999', '49.300 người đăng ký', demoImg('#991b1b', 'cross'), 'UCLBuhr6vMvZQPqZpTTslWaQ', true, true),
        ch('Dark Bible Study', '@DarkBibleStudy999', '362 người đăng ký', 'data:image/png;base64,AAAA'), // anh loi: chu cai
        ch('Dark Bible Stories', '@BibleStoriies', '207.000 người đăng ký', demoImg('#4c1d95', 'flame', '#fdba74'), 'UCC0AJ_NoUOq5718yK4_ehBw', true),
        ch('Simple Bible Animation', '@BibleSimpleAnimation68', '579 người đăng ký', demoImg('#065f46', 'play', '#ecfccb'), '', true),
      ],
    },
    { id: 'leo', label: 'Leo Nguyen', partition: 'persist:yt-leo', status: 'needs-sign-in', email: 'rollreus94@gmail.com', name: '', checkedAt: '', channels: [] },
  ],
}
