// Huong dan lay API day du: Google Cloud (YouTube Data API v3 + OAuth client) va Gemini.
import { BookOpen, CheckCircle2, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import type { State } from './api'
import { Button, Card, PageBody, PageHeader, Pill, cn } from './kit'

type Send = (cmd: string, payload?: unknown) => Promise<unknown>

function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold', done ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary')}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5 pb-4">
        <h3 className="text-sm font-bold">{title}</h3>
        <div className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground [&_b]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-foreground">{children}</div>
      </div>
    </li>
  )
}

const Link = ({ send, url, children }: { send: Send; url: string; children: ReactNode }) => (
  <Button variant="outline" className="mr-2 mt-1 h-8 px-3 text-xs" onClick={() => send('open_url', url)}><ExternalLink /> {children}</Button>
)

export function GuidePage({ state, send, go }: { state: State; send: Send; go: (p: string) => void }) {
  const hasClient = !!state.secrets.oauth
  const hasChannel = !!state.youtube.channel
  return (
    <>
      <PageHeader icon={BookOpen} title="Hướng dẫn lấy API" description="Làm một lần, khoảng 10 phút. Mọi khóa chỉ lưu trên máy bạn." />
      <PageBody>
        <div className="grid gap-3 xl:grid-cols-2">
          <Card title="Phần 1 · YouTube Data API (đăng video, bình luận)" hint={hasChannel ? <Pill tone="success">Đã kết nối</Pill> : undefined}>
            <ol>
              <Step n={1} title="Tạo dự án Google Cloud">
                <p>Mở Google Cloud Console bằng tài khoản Google sở hữu kênh. Bấm ô chọn dự án ở góc trên → <b>New Project</b> → đặt tên (ví dụ <code>tool-dang-youtube</code>) → <b>Create</b>. Nhớ chọn đúng dự án vừa tạo trước khi làm bước tiếp theo.</p>
                <Link send={send} url="https://console.cloud.google.com/projectcreate">Tạo dự án</Link>
              </Step>
              <Step n={2} title="Bật YouTube Data API v3">
                <p>Vào <b>APIs &amp; Services → Library</b>, tìm <b>YouTube Data API v3</b>, bấm <b>Enable</b>.</p>
                <Link send={send} url="https://console.cloud.google.com/apis/library/youtube.googleapis.com">Mở trang API</Link>
              </Step>
              <Step n={3} title="Cấu hình màn hình xin quyền (OAuth consent screen)">
                <p>Vào <b>Google Auth Platform → Branding</b> (hoặc <b>OAuth consent screen</b>), bấm <b>Get started</b>: điền tên app (ví dụ <code>YT Auto Studio</code>), email hỗ trợ, chọn <b>External</b>, điền email liên hệ, đồng ý điều khoản → <b>Create</b>.</p>
                <p>Mục <b>Audience</b>: thêm email Google của bạn (và các tài khoản quản lý kênh khác) vào <b>Test users</b>.</p>
                <p>Rồi bấm <b>Publish app</b> để chuyển sang <b>In production</b>. Nếu để chế độ Testing, đăng nhập sẽ hết hạn sau 7 ngày.</p>
                <Link send={send} url="https://console.cloud.google.com/auth/overview">Mở OAuth consent</Link>
              </Step>
              <Step n={4} title="Tạo OAuth client loại Desktop app" done={hasClient}>
                <p>Vào <b>Clients</b> (hoặc <b>Credentials → Create credentials → OAuth client ID</b>), chọn <b>Application type: Desktop app</b>, đặt tên bất kỳ → <b>Create</b> → <b>Download JSON</b>.</p>
                <p>Không chọn loại "Web application", tool sẽ báo sai loại.</p>
                <Link send={send} url="https://console.cloud.google.com/auth/clients">Mở trang Clients</Link>
              </Step>
              <Step n={5} title="Nhập vào tool và đăng nhập kênh" done={hasChannel}>
                <p>Vào <b>Cài đặt → Kết nối YouTube API → Nhập file JSON</b>, chọn file vừa tải. Bấm <b>Đăng nhập kênh</b>, chọn tài khoản/kênh trong trình duyệt.</p>
                <p>Google báo <b>"Google hasn't verified this app"</b>: bấm <b>Advanced → Go to … (unsafe)</b>. Đây là app của chính bạn nên an toàn. Tích đủ các ô quyền rồi bấm <b>Continue</b>.</p>
                <Button variant="default" className="mt-1 h-8 px-3 text-xs" onClick={() => go('settings')}>Mở Cài đặt</Button>
              </Step>
              <Step n={6} title="(Nên làm) Xin kiểm duyệt để video được Công khai">
                <p>Dự án chưa kiểm duyệt thì YouTube <b>khóa video tải lên qua API ở chế độ Riêng tư</b>. Nộp đơn <b>YouTube API Services – Audit and Quota Extension</b> (miễn phí): mô tả đây là tool cá nhân đăng video lên kênh của chính bạn. Đơn này cũng giúp xin tăng hạn mức.</p>
                <Link send={send} url="https://support.google.com/youtube/contact/yt_api_form">Mở đơn kiểm duyệt</Link>
              </Step>
            </ol>
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <b className="text-foreground">Hạn mức mặc định:</b> 10.000 đơn vị/ngày cho mỗi dự án. Mỗi lần tải video khoảng 1.600 đơn vị, mỗi lần trả lời hoặc cập nhật video khoảng 50, mỗi lần đọc danh sách khoảng 1. Hạn mức đặt lại lúc 0h giờ Thái Bình Dương, tức khoảng 14–15h giờ Việt Nam.
            </div>
          </Card>
          <div className="space-y-3">
            <Card title="Phần 2 · Gemini API (viết mô tả, trả lời bình luận)" hint={state.secrets.gemini ? <Pill tone="success">Đã có key</Pill> : undefined}>
              <ol>
                <Step n={1} title="Tạo API key ở Google AI Studio" done={state.secrets.gemini}>
                  <p>Đăng nhập Google AI Studio, bấm <b>Create API key</b>, chọn dự án (dùng chung dự án ở Phần 1 cũng được) rồi sao chép key dạng <code>AIza…</code>.</p>
                  <Link send={send} url="https://aistudio.google.com/apikey">Mở AI Studio</Link>
                </Step>
                <Step n={2} title="Dán vào tool">
                  <p>Vào <b>Cài đặt → Gemini API</b>, dán key, bấm <b>Lưu key</b>. Key được mã hóa và lưu trên máy bạn. Đừng gửi key cho người khác.</p>
                </Step>
                <Step n={3} title="Chọn model">
                  <p><b>Gemini 2.5 Flash</b> nhanh, rẻ, đủ dùng cho mô tả và trả lời bình luận. Gói miễn phí có giới hạn số lần gọi mỗi phút và mỗi ngày. Nếu tool báo "hết hạn mức", hãy chờ ít phút hoặc bật thanh toán trong AI Studio.</p>
                </Step>
              </ol>
            </Card>
            <Card title="Lỗi hay gặp">
              <ul className="space-y-2 text-[13px] text-muted-foreground [&_b]:text-foreground">
                <li><b>access_denied / 403 khi đăng nhập:</b> email chưa có trong Test users, hoặc app chưa Publish.</li>
                <li><b>Phiên đăng nhập hết hạn:</b> app đang ở chế độ Testing (7 ngày). Hãy Publish app rồi đăng nhập lại.</li>
                <li><b>Không đặt được thumbnail:</b> kênh chưa xác minh số điện thoại. Xác minh tại youtube.com/verify.</li>
                <li><b>accessNotConfigured:</b> dự án chưa bật YouTube Data API v3 (Phần 1, bước 2).</li>
                <li><b>quotaExceeded:</b> đã hết 10.000 đơn vị trong ngày. Chờ tới khoảng 14–15h, hoặc xin tăng hạn mức.</li>
                <li><b>Video bị khóa Riêng tư:</b> dự án chưa qua kiểm duyệt (Phần 1, bước 6).</li>
              </ul>
              <div className="mt-2"><Link send={send} url="https://youtube.com/verify">Xác minh kênh</Link></div>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  )
}
