// Khung nhat ky luon nam o day cua so (moi trang tru trang Nhat ky): dong moi nhat o cuoi.
import { ChevronDown, ChevronUp, ScrollText } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Level, State } from './api'
import { LevelTag, cn, load, save, useStickToBottom, type Tone } from './kit'

export const LEVELS: Record<Level, { tone: Tone; label: string }> = {
  info: { tone: 'info', label: 'TIN' },
  ok: { tone: 'success', label: 'XONG' },
  warn: { tone: 'warning', label: 'LƯU Ý' },
  error: { tone: 'error', label: 'LỖI' },
}
const SHOW = 200 // chi ve 200 dong cuoi, du xem nhanh

// Trong khung duoi cung, chu ve bang CSS (attr): loi/tin nhan da hien tren trang thi khung nay
// khong lap lai no trong DOM, nen tim theo noi dung (getByText, bai e2e) van chi ra mot cho.
const Css = ({ text, className }: { text: string; className?: string }) => (
  <span data-text={text} className={cn('after:content-[attr(data-text)]', className)} />
)

export function LogLine({ l, small }: { l: State['logs'][number]; small?: boolean }) {
  const t = (text: string, className?: string) => (small ? <Css text={text} className={className} /> : <span className={className}>{text}</span>)
  return (
    <li className={cn('flex items-start gap-2', small ? 'text-xs leading-5' : 'text-sm')}>
      <LevelTag tone={LEVELS[l.level].tone}>{t(LEVELS[l.level].label)}</LevelTag>
      {t(l.t, cn('shrink-0 text-[11px] tabular-nums text-muted-foreground', !small && 'pt-0.5'))}
      {t(l.msg, 'min-w-0 break-words')}
    </li>
  )
}

export function LogDock({ logs, onOpen }: { logs: State['logs']; onOpen: () => void }) {
  const [open, setOpen] = useState(() => load('logdock', true))
  useEffect(() => save('logdock', open), [open])
  const { ref, onScroll } = useStickToBottom(open ? logs : null)
  const start = Math.max(0, logs.length - SHOW)
  const errors = logs.filter((l) => l.level === 'error').length
  return (
    <section aria-label="Khung nhật ký" data-logdock className="glass-panel flex shrink-0 flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-2 px-3">
        <ScrollText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-bold">Nhật ký</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          <Css text={`${logs.length} dòng`} />{errors > 0 && <Css text={` · ${errors} lỗi`} className="font-bold text-red-600 dark:text-red-400" />}
        </span>
        {/* thu gon: van hien dong moi nhat tren thanh tieu de */}
        <Css text={!open && logs.length > 0 ? `· ${logs[logs.length - 1].msg}` : ''} className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" />
        <button onClick={onOpen} title="Mở trang Nhật ký" className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10">
          Xem tất cả
        </button>
        <button onClick={() => setOpen(!open)} aria-label={open ? 'Ẩn nhật ký' : 'Hiện nhật ký'} title={open ? 'Ẩn nhật ký' : 'Hiện nhật ký'} aria-expanded={open}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div ref={ref} onScroll={onScroll} className="h-[120px] overflow-y-auto border-t border-border/50 px-3 py-1.5">
          {logs.length === 0 ? <p className="text-xs text-muted-foreground">Chưa có gì.</p> : (
            <ul className="space-y-0.5">
              {logs.slice(start).map((l, i) => <LogLine key={start + i} l={l} small />)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
