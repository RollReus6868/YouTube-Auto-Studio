// The tra loi mot binh luan: dung chung cho trang "Bình luận" (API) va "Cộng đồng" (hop thu Studio).
import { FileVideo, Megaphone, RefreshCw, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Comment } from './api'
import { Button, Pill, TextArea, cn, type Tone } from './kit'

export const KIND: Record<string, { label: string; tone: Tone }> = {
  khen: { label: 'Khen', tone: 'success' }, hoi: { label: 'Câu hỏi', tone: 'info' }, gop_y: { label: 'Góp ý', tone: 'warning' },
  nhay_cam: { label: 'Nhạy cảm', tone: 'error' }, spam: { label: 'Spam', tone: 'muted' },
}
export const FILTERS: [string, string][] = [['pending', 'Chờ duyệt'], ['sent', 'Đã gửi'], ['skipped', 'Bỏ qua'], ['all', 'Tất cả']]
export const isPending = (c: Comment) => ['new', 'ready', 'error'].includes(c.status)
export const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`
}

// Binh luan tu hop thu Studio co them kenh va loai noi dung
export type CommentItem = Comment & { channelName?: string; contentType?: string; ago?: string }
type Actions = { send: (text: string) => void; skip: () => void; redraft: () => void }

function Tag({ icon: Icon, children, tone }: { icon?: typeof FileVideo; children: string; tone?: 'active' }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', tone ? 'bg-primary/10 text-primary' : 'bg-muted/70 text-muted-foreground')}>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  )
}

// onEdit: bao chu dang sua len trang (nut "Gui het" gui dung chu da sua)
export function CommentCard({ c, canReply, on, onEdit }: { c: CommentItem; canReply: boolean; on: Actions; onEdit?: (text: string) => void }) {
  const [text, setText] = useState(c.draft)
  useEffect(() => setText(c.draft), [c.draft])
  useEffect(() => { if (onEdit) onEdit(text) }, [text]) // eslint-disable-line react-hooks/exhaustive-deps
  const k = KIND[c.kind]
  return (
    <article className="space-y-2 rounded-xl border border-border/50 bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 truncate text-sm font-bold">{c.author}</span>
        <span className="text-[11px] text-muted-foreground">{c.ago || (c.publishedAt ? ago(c.publishedAt) : '')}</span>
        {k && <Pill tone={k.tone}>{k.label}</Pill>}
        <span className="flex-1" />
        {c.channelName && <Tag tone="active">{c.channelName}</Tag>}
        {c.videoTitle && <Tag icon={c.contentType === 'post' ? Megaphone : FileVideo}>{c.videoTitle}</Tag>}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{c.text}</p>
      {c.status === 'sent' ? (
        <p className="rounded-lg bg-emerald-500/10 p-2.5 text-sm"><span className="font-semibold text-emerald-600 dark:text-emerald-400">Đã trả lời:</span> {c.draft}</p>
      ) : c.status === 'skipped' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="muted" className="max-w-full">Bỏ qua{c.note ? `: ${c.note}` : ''}</Pill>
          <span className="flex-1" />
          <Button variant="subtle" className="h-7 px-2 text-xs" onClick={on.redraft} disabled={!canReply}><Sparkles /> Soạn trả lời</Button>
        </div>
      ) : (
        <>
          {c.error && <Pill tone="error" className="max-w-full">{c.error}</Pill>}
          <TextArea rows={2} className="min-h-[60px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={c.status === 'new' ? 'Gemini chưa soạn. Bấm "Viết lại" hoặc tự gõ trả lời…' : ''} aria-label={`Trả lời ${c.author}`} />
          <div className="flex flex-wrap items-center gap-2">
            {c.kind === 'nhay_cam' && <span className="text-[11px] text-red-600 dark:text-red-400">Bình luận nhạy cảm, hãy đọc kỹ trước khi gửi.</span>}
            <span className="flex-1" />
            <Button variant="subtle" className="h-8 px-3 text-xs" onClick={on.skip}><X /> Bỏ qua</Button>
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={on.redraft} disabled={!canReply}><RefreshCw /> Viết lại</Button>
            <Button variant="default" className="h-8 px-3 text-xs" onClick={() => on.send(text)} disabled={!text.trim()}><Send /> Gửi</Button>
          </div>
        </>
      )}
    </article>
  )
}
