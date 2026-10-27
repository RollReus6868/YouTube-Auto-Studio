// Trinh sua "mau toi uu" (src/optimize-template.js), nhom giong trang Chi tiet video cua Studio.
// Dung o trang Toi uu video va o trang Mau mac dinh (moi preset mot mau, preset.optimize).
import { Info, Pin } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { CATEGORIES, defaultOptimizeTemplate, type OptimizeTemplate } from '../api'
import { Card, Field, Select, TextArea, TextInput, ToggleRow, cn } from '../kit'

export type { OptimizeTemplate } from '../api'
export { defaultOptimizeTemplate } from '../api'
export type Templates = Record<string, OptimizeTemplate> // 'default' + key kenh

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
              v === value ? (v === 'keep' || v === '0' ? 'bg-muted text-foreground shadow-sm' : 'bg-primary text-primary-foreground shadow-sm') : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}
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

// hide: an cac muc da dat o noi khac (vd mo ta o trang Mau mac dinh). wide: 2 cot tu man hinh xl.
export function OptimizeTemplateEditor({ value: t, onChange, channelName = 'Dark Bible Study', sample = 'The Tower of Babel: Humanity’s First Rebellion Against God', compact, wide, hide = [] }: {
  value: OptimizeTemplate; onChange: (t: OptimizeTemplate) => void; channelName?: string; sample?: string; compact?: boolean; wide?: boolean; hide?: (keyof OptimizeTemplate)[]
}) {
  const set = (p: Partial<OptimizeTemplate>) => onChange({ ...t, ...p })
  const show = (k: keyof OptimizeTemplate) => !hide.includes(k)
  // hai o canh nhau; an mot o thi o con lai chiem ca hang
  const pair = (a: ReactNode, b: ReactNode) => (a && b ? <div className="grid gap-3 sm:grid-cols-2">{a}{b}</div> : a || b || null)
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
    <div className={cn('grid gap-3', wide ? 'xl:grid-cols-2' : !compact && '2xl:grid-cols-2')}>
      <div className="space-y-3">
        <Group title="Danh sách phát" hint="Tick mọi danh sách phát trùng tên (Studio có thể có nhiều danh sách cùng tên). Để trống tên và tắt tự chọn = giữ nguyên.">
          <ListInput label="Tên danh sách phát" value={t.playlists} onChange={(playlists) => set({ playlists })} placeholder="Tên danh sách phát, cách nhau bằng dấu phẩy" />
          <Seg label="Tự chọn danh sách phát đầu tiên trong hộp thoại" value={String(t.playlistAuto ?? 3)} onChange={(v) => set({ playlistAuto: Number(v) })}
            options={[['0', 'Tắt'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']]} />
          <p className="text-[11px] text-muted-foreground">Tick N danh sách phát đứng đầu trong hộp thoại “Danh sách phát” của Studio (danh sách đã tick sẵn vẫn được tính).</p>
        </Group>
        <Group title="Hiện thêm" hint="Các mục trong phần “Hiện thêm” của trang Chi tiết video.">
          {pair(
            show('paidPromotion') && <Seg label="Quảng cáo trả phí" value={t.paidPromotion} onChange={(paidPromotion) => set({ paidPromotion })} options={[['keep', KEEP], ['no', 'Không có'], ['yes', 'Có']]} />,
            show('ai') && <Seg label="Nội dung bị thay đổi / AI" value={t.ai} onChange={(ai) => set({ ai })} options={[['keep', KEEP], ['yes', 'Có'], ['no', 'Không']]} />,
          )}
          <Seg label="Thẻ" value={t.tagsMode} onChange={(tagsMode) => set({ tagsMode })} options={[['keep', KEEP], ['title', 'Thêm tiêu đề video làm thẻ']]} />
          <Field label="Thẻ thêm (tùy chọn)" hint="Thêm sau thẻ cũ, không xóa thẻ đã có; tối đa 500 ký tự như Studio.">
            <ListInput label="Thẻ thêm" value={t.extraTags} onChange={(extraTags) => set({ extraTags })} placeholder="bible stories, kinh thánh" />
          </Field>
          {pair(
            show('language') && (
              <Field label="Ngôn ngữ video và tiêu đề">
                <Select label="Ngôn ngữ video" value={t.language} onChange={(language) => set({ language })} options={[['', KEEP], ...LANGS.map((l): [string, string] => [l, l])]} />
              </Field>
            ),
            show('category') && (
              <Field label="Danh mục">
                <Select label="Danh mục" value={t.category} onChange={(category) => set({ category })} options={[['keep', KEEP], ...CATEGORIES]} />
              </Field>
            ),
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Seg label="Ngày quay" value={t.recordingDate} onChange={(recordingDate) => set({ recordingDate })} options={[['keep', KEEP], ['today', 'Hôm nay'], ['publish', 'Ngày đăng']]} />
            <Field label="Vị trí video" hint="Để trống = giữ nguyên.">
              <TextInput aria-label="Vị trí video" value={t.location} onChange={(e) => set({ location: e.target.value })} placeholder="United States" />
            </Field>
          </div>
          {pair(
            show('license') && <Seg label="Giấy phép" value={t.license} onChange={(license) => set({ license })} options={[['keep', KEEP], ['youtube', 'YouTube chuẩn'], ['creativeCommon', 'Creative Commons']]} />,
            show('embeddable') && <Seg label="Cho phép nhúng" value={t.embeddable} onChange={(embeddable) => set({ embeddable })} options={[['keep', KEEP], ['yes', 'Bật'], ['no', 'Tắt']]} />,
          )}
          <Seg label="Phối lại Shorts" value={t.remix} onChange={(remix) => set({ remix })} options={[['keep', KEEP], ['all', 'Video và âm thanh'], ['audio', 'Chỉ âm thanh'], ['none', 'Không cho phép']]} />
          <Seg label="Bình luận" value={t.comments} onChange={(comments) => set({ comments })} options={[['keep', KEEP], ['on', 'Bật'], ['pause', 'Tạm dừng'], ['off', 'Tắt']]} />
        </Group>
        <Group title="Màn hình kết thúc">
          <Seg label="Màn hình kết thúc" value={t.endScreen} onChange={(endScreen) => set({ endScreen })} options={[['keep', KEEP], ['latest', 'Dùng mẫu của video gần nhất']]} />
          <p className="text-[11px] text-muted-foreground">Video đã có màn hình kết thúc thì tool để nguyên.</p>
        </Group>
      </div>
      <div className="space-y-3">
        {show('description') && (
          <Group title="Mô tả" hint="Chỉ điền cho video CHƯA có mô tả; video đã có mô tả thì giữ nguyên.">
            <Field label="Mô tả video" hint="Để trống = không đụng tới mô tả. Tối đa 5000 ký tự.">
              <TextArea aria-label="Mô tả video" rows={5} maxLength={5000} value={t.description} onChange={(e) => set({ description: e.target.value })} placeholder={'{tieu_de}\n\nĐăng ký kênh {ten_kenh} để xem thêm video mới.'} />
            </Field>
            {vars((v) => set({ description: join(t.description, v) }))}
          </Group>
        )}
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

// Cac muc trong Studio cua preset (trang Mau mac dinh): preset.optimize, luu cung nut "Lưu mẫu".
// Tool dat cac muc nay ngay trong hop thoai tai len cua Studio (src/flows/upload.js); mo ta lay o phan Chi tiet o tren.
// Cong tac: sau khi dang -> thich / binh luan / ghim (va dat lai muc nao hop thoai chua dat duoc).
export const PRESET_HIDDEN_FIELDS: (keyof OptimizeTemplate)[] = ['description']
export function PresetOptimizeCard({ value, onChange, enabled, onToggle, channelName, className }: {
  value: OptimizeTemplate; onChange: (t: OptimizeTemplate) => void; enabled: boolean; onToggle: (v: boolean) => void; channelName?: string; className?: string
}) {
  return (
    <Card className={className} title="Mẫu Studio" hint="đặt ngay trong hộp thoại tải lên của YouTube Studio">
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p>
            Tool chọn danh sách phát, các mục trong <b>Hiện thêm</b> và màn hình kết thúc theo mẫu này ngay khi tải video lên. Mục nào chưa đặt được
            thì tool báo trong kết quả và đặt lại trong Studio sau khi đăng. Mô tả lấy ở phần <b>Chi tiết</b> ở trên, nối sau mô tả mặc định của kênh.
          </p>
        </div>
        <ToggleRow title="Sau khi đăng: thích, bình luận, ghim" hint="Khi video đã công khai được 15 phút, tool mở trang xem video để thích + bình luận + ghim theo phần “Sau khi lưu” bên dưới." checked={enabled} onChange={onToggle} />
        <OptimizeTemplateEditor value={value} onChange={onChange} channelName={channelName || undefined} hide={PRESET_HIDDEN_FIELDS} wide />
      </div>
    </Card>
  )
}
