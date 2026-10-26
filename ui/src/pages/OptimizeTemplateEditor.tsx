// Trinh sua "mau toi uu" (src/optimize-template.js), nhom giong trang Chi tiet video cua Studio.
// Dung o trang Toi uu video va o trang Mau mac dinh (sau khi dang: toi uu bang mau).
import { Info, Pin, Save, Undo2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { CATEGORIES } from '../api'
import { Button, Card, Field, Pill, Select, TextArea, TextInput, ToggleRow, cn } from '../kit'
import type { PageProps } from './index'

type K3 = 'keep' | 'yes' | 'no'
export type OptimizeTemplate = {
  playlists: string[]
  paidPromotion: K3
  ai: K3
  tagsMode: 'keep' | 'title'
  extraTags: string[]
  location: string
  recordingDate: 'keep' | 'today' | 'publish'
  remix: 'keep' | 'all' | 'audio' | 'none'
  endScreen: 'keep' | 'latest'
  category: string
  language: string
  comments: 'keep' | 'on' | 'pause' | 'off'
  license: 'keep' | 'youtube' | 'creativeCommon'
  embeddable: K3
  like: boolean
  description: string
  comment: string
  pin: boolean
}
export type Templates = Record<string, OptimizeTemplate> // 'default' + key kenh

// giong defaultTemplate() trong src/optimize-template.js
export const defaultOptimizeTemplate = (): OptimizeTemplate => ({
  playlists: [], paidPromotion: 'no', ai: 'yes', tagsMode: 'title', extraTags: [], location: 'United States',
  recordingDate: 'today', remix: 'none', endScreen: 'latest', category: 'keep', language: '', comments: 'keep',
  license: 'keep', embeddable: 'keep', like: true, description: '', comment: '{tieu_de}', pin: true,
})
export const templateOf = (t: Templates | undefined, key: string): OptimizeTemplate =>
  ({ ...defaultOptimizeTemplate(), ...((t && (t[key] || t.default)) || {}) })

const LANGS = ['Tiếng Việt', 'Tiếng Anh', 'Tiếng Anh (Hoa Kỳ)', 'Tiếng Anh (Vương quốc Anh)', 'Tiếng Tây Ban Nha', 'Tiếng Pháp',
  'Tiếng Bồ Đào Nha (Brazil)', 'Tiếng Đức', 'Tiếng Nhật', 'Tiếng Hàn', 'Tiếng Trung (Giản thể)', 'Tiếng Thái', 'Tiếng Hindi', 'Tiếng Indonesia']
export const COMMENT_VARS: [string, string][] = [['{tieu_de}', 'tiêu đề video'], ['{link}', 'link video'], ['{ten_kenh}', 'tên kênh']]
const KEEP = 'Giữ nguyên'

export const renderComment = (tpl: string, v: { tieu_de: string; link: string; ten_kenh: string }) =>
  tpl.replace(/\{(tieu_de|link|ten_kenh)\}/g, (_, k: keyof typeof v) => v[k]).trim()

// Nut chon kieu "segmented"
function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-bold text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-lg bg-background/50 p-1 ring-1 ring-border/60">
        {options.map(([v, l]) => (
          <button
            key={v}
            role="radio"
            aria-checked={v === value}
            onClick={() => onChange(v)}
            className={cn('min-w-0 flex-1 basis-auto whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
              v === value ? (v === 'keep' ? 'bg-muted text-foreground shadow-sm' : 'bg-primary text-primary-foreground shadow-sm') : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}
          >{l}</button>
        ))}
      </div>
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-3">
      <div>
        <h3 className="text-[13px] font-extrabold">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

// O nhap danh sach (cach nhau bang dau phay hoac xuong dong); tach khi roi o.
function ListInput({ value, onChange, placeholder, label }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; label: string }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value.join('\n')]) // eslint-disable-line react-hooks/exhaustive-deps
  return <TextInput aria-label={label} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
    onBlur={() => onChange([...new Set(text.split(/[,\n]/).map((t) => t.trim()).filter(Boolean))])} />
}

export function OptimizeTemplateEditor({ value: t, onChange, channelName = 'Dark Bible Study', sample = 'The Tower of Babel: Humanity’s First Rebellion Against God', compact }: {
  value: OptimizeTemplate; onChange: (t: OptimizeTemplate) => void; channelName?: string; sample?: string; compact?: boolean
}) {
  const set = (p: Partial<OptimizeTemplate>) => onChange({ ...t, ...p })
  const preview = renderComment(t.comment, { tieu_de: sample, link: 'https://youtu.be/vyiSqHByq24', ten_kenh: channelName })
  const join = (cur: string, v: string) => (cur ? `${cur}${/\s$/.test(cur) ? '' : ' '}${v}` : v)
  const addVar = (v: string) => set({ comment: join(t.comment, v) })
  const vars = (add: (v: string) => void) => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[11px] text-muted-foreground">Bấm để chèn:</span>
      {COMMENT_VARS.map(([v, l]) => (
        <button key={v} type="button" onClick={() => add(v)} title={l} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-primary/15 hover:text-primary">{v}</button>
      ))}
    </div>
  )
  return (
    <div className={cn('grid gap-3', !compact && '2xl:grid-cols-2')}>
      <div className="space-y-3">
        <Group title="Danh sách phát" hint="Tick mọi danh sách phát trùng tên (Studio có thể có nhiều danh sách cùng tên). Để trống = giữ nguyên.">
          <ListInput label="Tên danh sách phát" value={t.playlists} onChange={(playlists) => set({ playlists })} placeholder="Tên danh sách phát, cách nhau bằng dấu phẩy" />
        </Group>
        <Group title="Hiện thêm" hint="Các mục trong phần “Hiện thêm” của trang Chi tiết video.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Seg label="Quảng cáo trả phí" value={t.paidPromotion} onChange={(paidPromotion) => set({ paidPromotion })} options={[['keep', KEEP], ['no', 'Không có'], ['yes', 'Có']]} />
            <Seg label="Nội dung bị thay đổi / AI" value={t.ai} onChange={(ai) => set({ ai })} options={[['keep', KEEP], ['yes', 'Có'], ['no', 'Không']]} />
          </div>
          <Seg label="Thẻ" value={t.tagsMode} onChange={(tagsMode) => set({ tagsMode })} options={[['keep', KEEP], ['title', 'Thêm tiêu đề video làm thẻ']]} />
          <Field label="Thẻ thêm (tùy chọn)" hint="Thêm sau thẻ cũ, không xóa thẻ đã có; tối đa 500 ký tự như Studio.">
            <ListInput label="Thẻ thêm" value={t.extraTags} onChange={(extraTags) => set({ extraTags })} placeholder="bible stories, kinh thánh" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngôn ngữ video và tiêu đề">
              <Select label="Ngôn ngữ video" value={t.language} onChange={(language) => set({ language })} options={[['', KEEP], ...LANGS.map((l): [string, string] => [l, l])]} />
            </Field>
            <Field label="Danh mục">
              <Select label="Danh mục" value={t.category} onChange={(category) => set({ category })} options={[['keep', KEEP], ...CATEGORIES]} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Seg label="Ngày quay" value={t.recordingDate} onChange={(recordingDate) => set({ recordingDate })} options={[['keep', KEEP], ['today', 'Hôm nay'], ['publish', 'Ngày đăng']]} />
            <Field label="Vị trí video" hint="Để trống = giữ nguyên.">
              <TextInput aria-label="Vị trí video" value={t.location} onChange={(e) => set({ location: e.target.value })} placeholder="United States" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Seg label="Giấy phép" value={t.license} onChange={(license) => set({ license })} options={[['keep', KEEP], ['youtube', 'YouTube chuẩn'], ['creativeCommon', 'Creative Commons']]} />
            <Seg label="Cho phép nhúng" value={t.embeddable} onChange={(embeddable) => set({ embeddable })} options={[['keep', KEEP], ['yes', 'Bật'], ['no', 'Tắt']]} />
          </div>
          <Seg label="Phối lại Shorts" value={t.remix} onChange={(remix) => set({ remix })} options={[['keep', KEEP], ['all', 'Video và âm thanh'], ['audio', 'Chỉ âm thanh'], ['none', 'Không cho phép']]} />
          <Seg label="Bình luận" value={t.comments} onChange={(comments) => set({ comments })} options={[['keep', KEEP], ['on', 'Bật'], ['pause', 'Tạm dừng'], ['off', 'Tắt']]} />
        </Group>
        <Group title="Màn hình kết thúc">
          <Seg label="Màn hình kết thúc" value={t.endScreen} onChange={(endScreen) => set({ endScreen })} options={[['keep', KEEP], ['latest', 'Dùng mẫu của video gần nhất']]} />
          <p className="text-[11px] text-muted-foreground">Video đã có màn hình kết thúc thì tool để nguyên.</p>
        </Group>
      </div>
      <div className="space-y-3">
        <Group title="Mô tả" hint="Chỉ điền cho video CHƯA có mô tả; video đã có mô tả thì giữ nguyên.">
          <Field label="Mô tả video" hint="Để trống = không đụng tới mô tả. Tối đa 5000 ký tự.">
            <TextArea aria-label="Mô tả video" rows={5} maxLength={5000} value={t.description} onChange={(e) => set({ description: e.target.value })} placeholder={'{tieu_de}\n\nĐăng ký kênh {ten_kenh} để xem thêm video mới.'} />
          </Field>
          {vars((v) => set({ description: join(t.description, v) }))}
        </Group>
        <Group title="Sau khi lưu: trang xem video" hint="Chỉ làm được khi video Công khai / Không công khai.">
          <ToggleRow title="Thích video" hint="Bỏ qua nếu đã thích." checked={t.like} onChange={(like) => set({ like })} />
          <Field label="Bình luận ghim" hint="Để trống = không bình luận. Đã có bình luận này thì tool không đăng lại.">
            <TextArea aria-label="Bình luận ghim" rows={4} value={t.comment} onChange={(e) => set({ comment: e.target.value })} placeholder="{tieu_de}" />
          </Field>
          {vars(addVar)}
          <ToggleRow title="Ghim bình luận" hint="Ghim không được thì vẫn giữ bình luận và báo cảnh báo." checked={t.pin} onChange={(pin) => set({ pin })} />
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
              Xem trước {t.pin && t.comment.trim() && <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 text-primary"><Pin className="h-3 w-3" /> Đã ghim</span>}
            </div>
            {preview
              ? <p className="whitespace-pre-wrap break-words text-[13px]"><b className="mr-1.5 rounded-full bg-muted px-1.5 text-[11px]">{channelName}</b>{preview}</p>
              : <p className="text-[12px] italic text-muted-foreground">Không bình luận.</p>}
          </div>
        </Group>
      </div>
    </div>
  )
}

// The cai dat cho trang Mau mac dinh: "Sau khi dang: toi uu bang mau" + mau toi uu mac dinh.
type OptimizeState = { templates?: Templates }
export function PresetOptimizeCard({ state, send, checked, onToggle }: Pick<PageProps, 'state' | 'send'> & { checked: boolean; onToggle: (v: boolean) => void }) {
  const s = state.f.optimize as OptimizeState | undefined
  const saved = templateOf(s?.templates, 'default')
  const savedKey = JSON.stringify(saved)
  const [t, setT] = useState(saved)
  useEffect(() => setT(saved), [savedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(t) !== savedKey
  const own = Object.keys(s?.templates || {}).filter((k) => k !== 'default').length
  return (
    <Card title="Sau khi đăng" hint="các mục chỉ có trong YouTube Studio">
      <div className="space-y-3">
        <ToggleRow title="Sau khi đăng: tối ưu bằng mẫu" hint="Khi video đã công khai được 15 phút, tool tự mở Studio để tối ưu, rồi thích + bình luận + ghim." checked={checked} onChange={onToggle} />
        {checked && (
          <>
            <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <p>Cần đăng nhập kênh ở trang <b>Tài khoản</b>. Dưới đây là <b>mẫu tối ưu mặc định</b>{own ? `; ${own} kênh có mẫu riêng (sửa ở trang Tối ưu video)` : ''}. Bật/tắt ở trên lưu cùng nút “Lưu mẫu”, còn mẫu tối ưu lưu bằng nút riêng.</p>
            </div>
            <OptimizeTemplateEditor value={t} onChange={setT} compact />
            <div className="flex items-center gap-2">
              <Button variant={dirty ? 'default' : 'outline'} className="h-9" disabled={!dirty} onClick={() => send('optimize_template_save', { channelKey: 'default', template: t })}><Save /> Lưu mẫu tối ưu</Button>
              <Button variant="subtle" className="h-9" disabled={!dirty} onClick={() => setT(saved)}><Undo2 /> Bỏ thay đổi</Button>
              <span className="flex-1" />
              {dirty ? <Pill tone="warning">Chưa lưu</Pill> : <Pill tone="success">Đã lưu</Pill>}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
