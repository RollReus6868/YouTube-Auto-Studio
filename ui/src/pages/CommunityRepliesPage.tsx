// Trang "Cộng đồng": tra loi binh luan cua nguoi xem qua hop thu YouTube Studio (Cong dong → Binh luan),
// gom binh luan duoi video, Shorts va bai dang cua cac kenh da chon. Trang thai: state.f.inbox (src/features/inbox.js).
import { Check, MessagesSquare, RefreshCw, Square, Users } from 'lucide-react'
import { useState } from 'react'
import { CommentCard, FILTERS, isPending, type CommentItem } from '../CommentCard'
import { ActionBar, Button, EmptyState, PageBody, PageHeader, Pill, Select, cn } from '../kit'
import type { PageProps } from './index'

export type InboxOption = { key: string; name: string; handle: string; accountId: string }
export type InboxState = {
  channels: string[] // kenh da chon
  options: InboxOption[] // kenh da tick o trang Tai khoan
  busy: boolean
  current: string // kenh dang doc
  at: string
  items: (CommentItem & { channelKey?: string })[]
  sentLastHour: number
}

const MODE: Record<string, string> = { auto: 'Tự gửi lời khen ngắn', off: 'Tắt tự động', review: 'Duyệt tay' }
const fmt = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}`
}

export function CommunityRepliesPage({ state, send, go }: PageProps) {
  // ?demo gan du lieu mau vao state.f.<id trang> = state.f.community
  const s = (state.f.inbox ?? state.f.community) as InboxState | undefined ?? { channels: [], options: [], busy: false, current: '', at: '', items: [], sentLastHour: 0 }
  const [filter, setFilter] = useState('pending')
  const [only, setOnly] = useState('')
  const sel = new Set(s.channels)
  const toggle = (key: string) => send('inbox_channels', sel.has(key) ? s.channels.filter((k) => k !== key) : [...s.channels, key])
  const items = s.items.filter((c) => (!only || c.channelKey === only) && (filter === 'all' ? true : filter === 'pending' ? isPending(c) : c.status === filter))
  const pending = s.items.filter((c) => (!only || c.channelKey === only) && isPending(c)).length
  const mode = state.settings?.replyMode ?? 'review'
  const named = s.options.filter((o) => sel.has(o.key))
  return (
    <>
      <PageHeader
        icon={MessagesSquare}
        title="Cộng đồng"
        description="Trả lời bình luận dưới video, Shorts và bài đăng qua hộp thư YouTube Studio. Gemini soạn sẵn, bạn duyệt hoặc tool tự gửi lời cảm ơn."
        actions={<>
          <button onClick={() => go('settings')} title="Đổi ở Cài đặt → Trả lời bình luận" className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted/70">{MODE[mode]}</button>
          <Pill tone="muted">Đã gửi {s.sentLastHour}/{state.settings?.replyPerHour ?? 20} trong 1 giờ</Pill>
        </>}
      />
      <div className="shrink-0 space-y-2 px-4 pb-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kênh lấy bình luận">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">Kênh:</span>
          {s.options.length === 0 ? (
            <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => go('accounts')}><Users /> Thêm và tick kênh ở trang Tài khoản</Button>
          ) : s.options.map((o) => (
            <button key={o.key} aria-pressed={sel.has(o.key)} onClick={() => toggle(o.key)} title={o.handle}
              className={cn('inline-flex max-w-[200px] items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-all',
                sel.has(o.key) ? 'border-primary/40 bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground hover:bg-muted/50')}>
              {sel.has(o.key) && <Check className="h-3 w-3 shrink-0" />}<span className="truncate">{o.name}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}
              className={cn('rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all', filter === id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground hover:bg-muted/50')}>
              {label}{id === 'pending' && pending ? ` (${pending})` : ''}
            </button>
          ))}
          {named.length > 1 && (
            <Select label="Lọc theo kênh" className="h-8 w-auto min-w-0 basis-36 text-xs" value={only} onChange={setOnly} options={[['', 'Mọi kênh'], ...named.map((o) => [o.key, o.name] as [string, string])]} />
          )}
          <span className="flex-1" />
          {s.at && <span className="text-[11px] text-muted-foreground">Lấy lần cuối {fmt(s.at)}</span>}
        </div>
      </div>
      <PageBody>
        {items.length === 0 ? (
          <EmptyState icon={MessagesSquare} text={!s.channels.length ? 'Tick kênh ở trên rồi bấm "Lấy bình luận mới". Tool mở Studio → Cộng đồng → Bình luận (lọc "Chưa phản hồi") của từng kênh.'
            : filter === 'pending' ? 'Không có bình luận nào chờ trả lời. Bấm "Lấy bình luận mới" để kiểm tra.' : 'Chưa có bình luận nào ở mục này.'} />
        ) : items.map((c) => (
          <CommentCard key={c.id} c={c} canReply={state.secrets.gemini}
            on={{ send: (text) => send('inbox_send', { id: c.id, text }), skip: () => send('inbox_skip', c.id), redraft: () => send('inbox_redraft', c.id) }} />
        ))}
        <p className="text-[11px] text-muted-foreground">
          Tool tìm lại đúng bình luận theo mã của YouTube trước khi gửi và bỏ qua bình luận kênh đã trả lời, nên không trả lời trùng (kể cả với trang Bình luận).
          {mode !== 'off' && ' Tự kiểm tra bình luận mới mỗi 10 phút khi tool đang mở.'} Khung bên phải là Studio để bạn xem trực tiếp.
        </p>
      </PageBody>
      <ActionBar>
        {s.busy ? (
          <Button variant="danger" size="xl" className="flex-1" onClick={() => send('inbox_stop')}><Square /> Dừng{s.current ? ` (đang đọc "${s.current}")` : ''}</Button>
        ) : (
          <Button variant="gradient" size="xl" className="flex-1" disabled={!s.channels.length} onClick={() => send('inbox_fetch')}>
            <RefreshCw /> {s.channels.length > 1 ? `Lấy bình luận mới (${s.channels.length} kênh)` : 'Lấy bình luận mới'}
          </Button>
        )}
      </ActionBar>
    </>
  )
}

const ago = (m: number) => new Date(Date.now() - m * 60e3).toISOString()
const item = (id: string, channelKey: string, channelName: string, author: string, text: string, min: number, videoTitle: string, contentType: string, extra: Partial<CommentItem> = {}) => ({
  id, channelKey, channelName, author, text, publishedAt: ago(min), videoTitle, contentType, videoId: '', likeCount: 0,
  status: 'new' as const, kind: '', draft: '', error: '', note: '', source: 'studio', ...extra,
})
export const inboxDemo: InboxState = {
  channels: ['UCLBuhr6vMvZQPqZpTTslWaQ', 'UCC0AJ_NoUOq5718yK4_ehBw'],
  options: [
    { key: 'UCLBuhr6vMvZQPqZpTTslWaQ', name: 'Dark Faith 2nd', handle: '@DarkFaith9999', accountId: 'tk1' },
    { key: 'UCC0AJ_NoUOq5718yK4_ehBw', name: 'Dark Bible Stories', handle: '@BibleStoriies', accountId: 'tk1' },
    { key: 'tk1:Dark Bible Room', name: 'Dark Bible Room', handle: '@DarkRoom6868', accountId: 'tk1' },
  ],
  busy: false, current: '', at: ago(3), sentLastHour: 4,
  items: [
    item('Ugx1', 'UCLBuhr6vMvZQPqZpTTslWaQ', 'Dark Faith 2nd', '@ElizabethBade-l7n', 'Excellent presentation brother! God bless your heart for revealing this information. I love it. ❤️ 💜 ✝️', 43, 'Isaiah 61 Is Happening to Black People RIGHT NOW', 'video', { status: 'sent', kind: 'khen', draft: 'Love ❤️ God bless you too!' }),
    item('Ugx2', 'UCLBuhr6vMvZQPqZpTTslWaQ', 'Dark Faith 2nd', '@ruthann-k2', 'Where can I find the full study notes?', 95, 'Why Black People Survive Everything?', 'video', { status: 'ready', kind: 'hoi', draft: 'Thank you for asking! The study notes are in the description of the video 🙏' }),
    item('Ugw3', 'UCC0AJ_NoUOq5718yK4_ehBw', 'Dark Bible Stories', '@SteveWilson9p', "I'm here, i heard it and i believe the truth! Steven Wilson from Washington DC", 660, 'Hôm nay bạn đọc chương nào? Bình luận bên dưới nhé 🙏', 'post', { status: 'ready', kind: 'khen', draft: 'Welcome Steven! Thank you for being here 🙏' }),
    item('Ugx4', 'UCC0AJ_NoUOq5718yK4_ehBw', 'Dark Bible Stories', '@marco.p', 'The narration is too quiet compared to the music.', 1500, 'The UNTOLD Story Behind the Book of Enoch', 'video', { status: 'ready', kind: 'gop_y', draft: 'Thanks for the feedback! We will balance the audio in the next video.' }),
    item('Ugx5', 'UCLBuhr6vMvZQPqZpTTslWaQ', 'Dark Faith 2nd', '@promo-bot', 'Kiếm tiền online tại đây', 2000, 'Why Iran Forms a Prophetic ALLIANCE', 'video', { status: 'skipped', note: 'Chứa từ bỏ qua "kiếm tiền"' }),
  ],
}
