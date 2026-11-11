// Gemini dung cho Dang bai AI va viet mo ta: qua trinh duyet (state.geminiWeb, src/gemini-web.js) hoac API key (src/ai.js).
// Dung chung o Cai dat, trang Dang bai AI va hop thoai "Gemini viết mô tả": chu "dang dung Gemini nao",
// trang thai dang nhap, huong dan khi loi (GEMINI_SIGNIN / BLOCKED / LIMIT...) + nut "Mở Gemini" (lenh gemini_web_open).
import { CircleAlert, ExternalLink, Settings, Sparkles } from 'lucide-react'
import type { GeminiWebStatus, State } from './api'
import { Button, Pill, cn } from './kit'
import type { AccountsState } from './pages/AccountsPage'

type Send = (cmd: string, payload?: unknown) => Promise<unknown>

export const aiProviderOf = (state: State): 'web' | 'api' => (state.settings?.aiProvider === 'api' ? 'api' : 'web')

// tai khoan Google dung cho Gemini tren trinh duyet: da chon o Cai dat, trong = tai khoan dau tien
export function geminiAccountOf(state: State, id = state.geminiWeb?.accountId || state.settings?.geminiAccount || '') {
  const list = (state.f.accounts as AccountsState | undefined)?.list ?? []
  const acc = list.find((a) => a.id === id) ?? (id ? undefined : list[0])
  return { id: acc?.id ?? id, label: acc ? acc.label || acc.email || acc.id : id }
}

// "Gemini trên trình duyệt (tài khoản Nick Thắng)" | "Gemini API (gemini-3.8-flash)"
export function geminiVia(state: State, via: 'web' | 'api' = aiProviderOf(state)) {
  if (via === 'api') return `Gemini API (${state.settings?.geminiModel || 'model mặc định'})`
  const acc = geminiAccountOf(state)
  return acc.label ? `Gemini trên trình duyệt (tài khoản ${acc.label})` : 'Gemini trên trình duyệt (chưa có tài khoản Google: thêm ở trang Tài khoản)'
}

export function GeminiWebPill({ status }: { status?: GeminiWebStatus }) {
  if (!status) return <Pill tone="muted">Chưa sẵn sàng</Pill>
  if (status.busy) return <Pill tone="active">Gemini đang làm</Pill>
  if (status.signedIn === true) return <Pill tone="success">Đã đăng nhập Gemini</Pill>
  if (status.signedIn === false) return <Pill tone="error">Chưa đăng nhập Gemini</Pill>
  return <Pill tone="muted">Chưa kiểm tra đăng nhập</Pill>
}

const HELP: Record<string, string> = {
  GEMINI_SIGNIN: 'Tài khoản Google dùng cho Gemini chưa đăng nhập (vẽ ảnh luôn cần đăng nhập). Bấm “Mở Gemini”, đăng nhập trong cửa sổ Gemini rồi thử lại. Đổi tài khoản ở Cài đặt → Gemini.',
  GEMINI_BLOCKED: 'Gemini đang hiện một hộp thoại (điều khoản, xác minh, chọn quốc gia…). Bấm “Mở Gemini”, tự xử lý hộp thoại trong cửa sổ Gemini rồi thử lại.',
  GEMINI_LIMIT: 'Gemini báo tài khoản này đã hết lượt. Chờ một lúc, chọn tài khoản Google khác ở Cài đặt → Gemini, hoặc bật “Dùng API khi trình duyệt lỗi”.',
  GEMINI_TIMEOUT: 'Gemini trả lời quá lâu. Bấm “Mở Gemini” để xem cửa sổ Gemini rồi thử lại.',
  GEMINI_EMPTY: 'Gemini không trả lời gì. Bấm “Mở Gemini” để xem rồi thử lại.',
  GEMINI_UNAVAILABLE: 'Bản này chưa có Gemini trên trình duyệt. Vào Cài đặt → Gemini, chọn “API key”.',
}
const OPEN = new Set(['GEMINI_SIGNIN', 'GEMINI_BLOCKED', 'GEMINI_LIMIT', 'GEMINI_TIMEOUT', 'GEMINI_EMPTY'])

// Loi Gemini: chu loi + huong dan theo ma + nut "Mở Gemini" / "Cài đặt"
export function GeminiErrorHelp({ code, message, send, go, className }: { code?: string; message: string; send: Send; go?: (p: string) => void; className?: string }) {
  const help = code ? HELP[code] : ''
  return (
    <div role="alert" className={cn('space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm', className)}>
      <p className="flex items-start gap-2 text-red-600 dark:text-red-400"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{message}</span></p>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {(OPEN.has(code || '') || go) && (
        <div className="flex flex-wrap gap-2">
          {OPEN.has(code || '') && <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => send('gemini_web_open')}><ExternalLink /> Mở Gemini</Button>}
          {go && <Button variant="subtle" className="h-8 px-3 text-xs" onClick={() => go('settings')}><Settings /> Cài đặt Gemini</Button>}
        </div>
      )}
    </div>
  )
}

// Dong "Viết bằng: …" (trang Dang bai AI): Gemini nao, trang thai dang nhap, nut "Mở Gemini" / "Đổi"
export function GeminiBar({ state, send, go }: { state: State; send: Send; go: (p: string) => void }) {
  const web = aiProviderOf(state) === 'web'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/30 px-3 py-2">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 basis-56 text-sm"><span className="text-muted-foreground">Viết bằng: </span><b>{geminiVia(state)}</b></span>
      {web && <GeminiWebPill status={state.geminiWeb} />}
      {web && <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => send('gemini_web_open')}><ExternalLink /> Mở Gemini</Button>}
      <Button variant="subtle" className="h-8 px-3 text-xs" onClick={() => go('settings')}><Settings /> Đổi</Button>
    </div>
  )
}
