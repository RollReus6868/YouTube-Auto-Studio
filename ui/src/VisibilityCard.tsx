// O "Che do hien thi" cua mau, xep giong buoc Che do hien thi trong hop thoai tai len cua Studio:
// "Luu hoac xuat ban" (Rieng tu / Khong cong khai / Cong khai + "Dat o che do Cong chieu ngay")
// va "Len lich" (ngay + gio moc 15 phut + "Mui gio" + "Dat lam video Cong chieu").
// src/flows/upload.js dat dung cac muc nay trong Studio (tieng Viet va tieng Anh).
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, Globe2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Preset, Schedule } from './api'
import { Card, Field, TextInput, cn } from './kit'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseIso = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null)
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
// "30 thg 10, 2026" (giong Studio tieng Viet)
export const fmtDay = (s: string) => { const d = parseIso(s); return d ? `${d.getDate()} thg ${d.getMonth() + 1}, ${d.getFullYear()}` : '' }
// "30 thg 10, 2026" | "30/10/2026" | "2026-10-30" -> "2026-10-30" ('' neu khong phai ngay hop le)
export function parseDay(t: string) {
  const s = t.trim().toLowerCase()
  let m = s.match(/^(\d{1,2})\s*thg\s*(\d{1,2}),?\s*(\d{4})$/) || s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  let y = 0, mo = 0, d = 0
  if (m) [d, mo, y] = [+m[1], +m[2], +m[3]]
  else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, mo, d] = [+m[1], +m[2], +m[3]]
  else return ''
  const x = new Date(y, mo - 1, d)
  return x.getFullYear() === y && x.getMonth() === mo - 1 && x.getDate() === d ? iso(x) : ''
}
// "9:05" | "9h" | "21.30" -> "09:05"...; '' neu sai
export function parseTime(t: string) {
  const m = t.trim().match(/^(\d{1,2})[:h.]?(\d{2})?$/i)
  if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return ''
  return `${pad(+m[1])}:${pad(+(m[2] || 0))}`
}
// Studio chi nhan moc 15 phut: tool lam tron len (09:07 -> 09:15)
export const roundTime = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  const q = Math.ceil((h * 60 + m) / 15) * 15
  return q >= 1440 ? '23:45' : `${pad(Math.floor(q / 60))}:${pad(q % 60)}`
}
const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`)
const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return { open, setOpen, ref }
}

function Month({ y, m, value, onPick }: { y: number; m: number; value: string; onPick: (d: string) => void }) {
  const first = new Date(y, m, 1)
  const blanks = (first.getDay() + 6) % 7 // T2 dau tuan
  const days = new Date(y, m + 1, 0).getDate()
  const min = today()
  return (
    <div role="listitem" aria-label={`thg ${m + 1} ${y}`}>
      <p className="mb-1 px-1 text-[11px] font-bold uppercase text-muted-foreground">THG {m + 1} {y}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: blanks }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = new Date(y, m, i + 1)
          const k = iso(d)
          const past = d < min
          const on = k === value
          return (
            <button
              key={k}
              type="button"
              disabled={past}
              aria-label={fmtDay(k)}
              aria-pressed={on}
              onClick={() => onPick(k)}
              className={cn('h-7 rounded-full text-xs font-semibold transition-colors disabled:cursor-default disabled:opacity-30',
                on ? 'bg-primary text-primary-foreground' : !past && 'hover:bg-muted', +d === +min && !on && 'text-primary')}
            >{i + 1}</button>
          )
        })}
      </div>
    </div>
  )
}

// O ngay kieu Studio: hien "30 thg 10, 2026", bam mo lich (T2..CN, thang "THG 10 2026", mui ten thang truoc / sau, ngay da qua bi khoa)
export function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const { open, setOpen, ref } = usePopover()
  const base = parseIso(value) || today()
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() })
  const [text, setText] = useState(fmtDay(value))
  useEffect(() => setText(fmtDay(value)), [value])
  useEffect(() => { if (open) setView({ y: base.getFullYear(), m: base.getMonth() }) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const shift = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const next = new Date(view.y, view.m + 1, 1)
  const canPrev = new Date(view.y, view.m, 1) > new Date(today().getFullYear(), today().getMonth(), 1)
  const pick = (d: string) => { onChange(d); setOpen(false) }
  const commit = () => { const d = parseDay(text); if (d && parseIso(d)! >= today()) onChange(d); else setText(fmtDay(value)) }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background/50 px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground')}>{fmtDay(value) || 'Chọn ngày'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div role="dialog" aria-label="Chọn ngày" className="absolute left-0 top-10 z-30 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center gap-1">
            <TextInput
              aria-label="Ngày"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); setOpen(false) } }}
              onBlur={commit}
              placeholder="30 thg 10, 2026"
              className="h-8 flex-1"
            />
            <button type="button" aria-label="Tháng trước" disabled={!canPrev} onClick={() => shift(-1)} className="rounded-full p-1.5 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Tháng sau" onClick={() => shift(1)} className="rounded-full p-1.5 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-muted-foreground">
            {WEEK.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div role="list" className="max-h-[300px] space-y-3 overflow-y-auto">
            <Month y={view.y} m={view.m} value={value} onPick={pick} />
            <Month y={next.getFullYear()} m={next.getMonth()} value={value} onPick={pick} />
          </div>
        </div>
      )}
    </div>
  )
}

// O gio: go tu do hoac chon moc 15 phut trong danh sach
export function TimePicker({ value, onChange, label = 'Giờ' }: { value: string; onChange: (t: string) => void; label?: string }) {
  const { open, setOpen, ref } = usePopover()
  const [text, setText] = useState(value)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    if (!open || !list.current) return
    const el = list.current.querySelector<HTMLElement>(`[data-t="${roundTime(value || '09:00')}"]`)
    if (el) list.current.scrollTop = el.offsetTop - 60
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => { const t = parseTime(text); if (t) onChange(t); else setText(value) }
  return (
    <div ref={ref} className="relative">
      <div className="flex h-9 items-center rounded-md border border-input bg-background/50 focus-within:ring-2 focus-within:ring-ring">
        <input
          aria-label={label}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { commit(); setOpen(false) } }}
          placeholder="09:00"
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
        />
        <button type="button" aria-label="Chọn giờ" onClick={() => setOpen(!open)} className="px-2 text-muted-foreground"><Clock className="h-4 w-4" /></button>
      </div>
      {open && (
        <div ref={list} role="listbox" aria-label="Giờ" className="absolute left-0 top-10 z-30 max-h-56 w-full min-w-[110px] overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-xl">
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              data-t={t}
              aria-selected={t === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(t); setOpen(false) }}
              className={cn('block w-full px-3 py-1 text-left text-sm hover:bg-muted', t === value && 'bg-primary/10 font-semibold text-primary')}
            >{t}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function Check({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-start gap-2.5 text-left disabled:opacity-50">
      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2', checked ? 'border-primary bg-primary' : 'border-muted-foreground/50')}>
        {checked && <svg viewBox="0 0 12 12" className="h-3 w-3 text-primary-foreground"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  )
}

function Radio({ on, onClick, label, hint, children }: { on: boolean; onClick: () => void; label: string; hint?: string; children?: ReactNode }) {
  return (
    <div>
      <button type="button" role="radio" aria-checked={on} onClick={onClick} className="flex w-full items-start gap-2.5 text-left">
        <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-primary' : 'border-muted-foreground/50')}>
          {on && <span className="h-2 w-2 rounded-full bg-primary" />}
        </span>
        <span className="min-w-0">
          <span className={cn('block text-sm font-semibold', on && 'text-primary')}>{label}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
      </button>
      {children && <div className="ml-[26px] mt-2">{children}</div>}
    </div>
  )
}

// Hop "Luu hoac xuat ban" / "Len lich": bam tieu de de chon (giong Studio: chi mot hop mo)
function Section({ open, onOpen, title, hint, children }: { open: boolean; onOpen: () => void; title: string; hint: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border transition-colors', open ? 'border-primary/50 bg-primary/5' : 'border-border/60')}>
      <button type="button" aria-expanded={open} onClick={onOpen} className="flex w-full items-start gap-3 p-3 text-left">
        <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
        <span className="min-w-0">
          <span className={cn('block text-sm font-bold', open && 'text-primary')}>{title}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </button>
      {open && <div className="space-y-3 px-3 pb-3 pl-10">{children}</div>}
    </div>
  )
}

// nhan cho o chon ngay / gio (div, khong phai label: label chuyen cu bam vao nut dau tien)
const Lbl = ({ text, children }: { text: string; children: ReactNode }) => (
  <div className="space-y-1.5"><span className="block text-xs font-bold text-muted-foreground">{text}</span>{children}</div>
)

const timeZone = () => {
  const off = -new Date().getTimezoneOffset()
  const name = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '' } })()
  return `GMT${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}${name ? ` ${name}` : ''}`
}
const tomorrow = () => { const d = today(); d.setDate(d.getDate() + 1); return iso(d) }

export function VisibilityCard({ p, set }: { p: Preset; set: (patch: Partial<Preset>) => void }) {
  const s = p.schedule
  const scheduled = s.mode !== 'now'
  const [tz, setTz] = useState(false)
  const setS = (patch: Partial<Schedule>) => set({ schedule: { ...s, ...patch } })
  const date = s.date || ''
  const time = s.time || '09:00'
  const off = time !== roundTime(time)
  const past = s.mode === 'date' && !!date && new Date(`${date}T${time}:00`) <= new Date()
  return (
    <Card title="Chế độ hiển thị" hint="giống bước Chế độ hiển thị trong hộp thoại tải lên">
      <div className="space-y-2">
        <Section open={!scheduled} onOpen={() => setS({ mode: 'now' })} title="Lưu hoặc xuất bản" hint="Đặt video ở chế độ công khai, không công khai hoặc riêng tư">
          <div role="radiogroup" aria-label="Lưu hoặc xuất bản" className="space-y-3">
            <Radio on={p.privacy === 'private'} onClick={() => set({ privacy: 'private' })} label="Riêng tư" hint="Chỉ bạn và những người bạn chọn mới có thể xem video" />
            <Radio on={p.privacy === 'unlisted'} onClick={() => set({ privacy: 'unlisted' })} label="Không công khai" hint="Bất kỳ ai có đường liên kết đến video đều có thể xem video" />
            <Radio on={p.privacy === 'public'} onClick={() => set({ privacy: 'public' })} label="Công khai" hint="Mọi người đều có thể xem video của bạn">
              {p.privacy === 'public' && (
                <Check checked={!!p.premiere} onChange={(premiere) => set({ premiere })} label="Đặt ở chế độ Công chiếu ngay" hint="Video công chiếu ngay khi tải lên xong (kênh phải dùng được tính năng Công chiếu)." />
              )}
            </Radio>
          </div>
        </Section>
        <Section open={scheduled} onOpen={() => scheduled || setS({ mode: 'date', date: date || tomorrow() })} title="Lên lịch" hint="Chọn một ngày để đặt video ở chế độ công khai.">
          <div role="radiogroup" aria-label="Cách xếp lịch" className="flex flex-wrap gap-1.5">
            {([['date', 'Ngày giờ cụ thể'], ['times', 'Khung giờ mỗi ngày'], ['interval', 'Cách đều N giờ']] as const).map(([m, l]) => (
              <button key={m} type="button" role="radio" aria-checked={s.mode === m} onClick={() => setS({ mode: m, date: m === 'date' ? date || tomorrow() : date })}
                className={cn('rounded-lg border px-2.5 py-1 text-xs font-semibold', s.mode === m ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/60 text-muted-foreground hover:bg-muted/50')}>{l}</button>
            ))}
          </div>
          <p className="text-xs font-bold text-muted-foreground">Đặt lịch chuyển sang chế độ công khai</p>
          {s.mode === 'date' && (
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
              <Lbl text="Ngày"><DatePicker value={date} onChange={(d) => setS({ date: d })} /></Lbl>
              <Lbl text="Giờ"><TimePicker value={time} onChange={(t) => setS({ time: t })} /></Lbl>
            </div>
          )}
          {s.mode === 'times' && (
            <Field label="Khung giờ (vd: 07:00, 19:00)" hint="Mỗi video lấy khung giờ trống tiếp theo, từ hôm nay.">
              <TimesInput value={s.times} onChange={(times) => setS({ times })} />
            </Field>
          )}
          {s.mode === 'interval' && (
            <div className="grid grid-cols-2 gap-2">
              <Lbl text="Giờ bắt đầu"><TimePicker value={s.times[0] || '19:00'} onChange={(t) => setS({ times: [t] })} label="Giờ bắt đầu" /></Lbl>
              <Field label="Cách nhau (giờ)">
                <TextInput type="number" min={1} value={s.intervalHours} onChange={(e) => setS({ intervalHours: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
            </div>
          )}
          {s.mode === 'date' && (
            <Field label="Video tiếp theo cách video trước (giờ)" hint="0 = mọi video cùng giờ.">
              <TextInput type="number" min={0} value={s.intervalHours} onChange={(e) => setS({ intervalHours: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
          )}
          {s.mode === 'date' && !date && <p className="text-xs text-amber-600 dark:text-amber-400">Chưa chọn ngày: video sẽ đăng ngay.</p>}
          {past && <p className="text-xs text-amber-600 dark:text-amber-400">Ngày giờ này đã qua: video sẽ đăng ngay khi tải lên.</p>}
          {s.mode === 'date' && off && <p className="text-xs text-muted-foreground">YouTube chỉ nhận mốc 15 phút: tool đặt {roundTime(time)}.</p>}
          <div>
            <button type="button" aria-expanded={tz} onClick={() => setTz(!tz)} className="inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10">
              <Globe2 className="h-3.5 w-3.5" /> Múi giờ
            </button>
            {tz && <p className="mt-1 text-xs text-muted-foreground">Giờ tính theo múi giờ của máy tính: <b>{timeZone()}</b>. Tool không đổi múi giờ trong Studio, chỉ gõ ngày giờ ở trên.</p>}
          </div>
          <Check checked={!!p.schedulePremiere} onChange={(schedulePremiere) => set({ schedulePremiere })} label="Đặt làm video Công chiếu" hint="Đến giờ, video phát dưới dạng Công chiếu thay vì công khai bình thường." />
        </Section>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CalendarDays className="h-3 w-3" />Dòng “Giờ đăng:” trong file .txt cùng tên với video được ưu tiên hơn lịch ở đây.</p>
      </div>
    </Card>
  )
}

function TimesInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const joined = value.join(', ')
  const [text, setText] = useState(joined)
  useEffect(() => setText(joined), [joined])
  const commit = () => {
    const times = text.split(/[,\s]+/).map(parseTime).filter(Boolean)
    onChange(times.length ? times : ['19:00'])
  }
  return <TextInput value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} placeholder="19:00" />
}
