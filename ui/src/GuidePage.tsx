// Huong dan: lay Gemini API key (viet mo ta, tra loi binh luan) va cach tool dang video qua YouTube Studio.
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
  const accounts = state.upload.channels.length > 0
  return (
    <>
      <PageHeader icon={BookOpen} title="Hướng dẫn" description="Gemini API key cho mô tả và trả lời bình luận. Video đăng bằng YouTube Studio, không cần Google Cloud." />
      <PageBody>
        <div className="grid gap-3 xl:grid-cols-2">
          <Card title="Gemini API (viết mô tả, trả lời bình luận)" hint={state.secrets.gemini ? <Pill tone="success">Đã có key</Pill> : undefined}>
            <ol>
              <Step n={1} title="Tạo API key ở Google AI Studio" done={state.secrets.gemini}>
                <p>Đăng nhập Google AI Studio, bấm <b>Create API key</b>, chọn hoặc tạo một dự án rồi sao chép key dạng <code>AIza…</code>.</p>
                <Link send={send} url="https://aistudio.google.com/apikey">Mở AI Studio</Link>
              </Step>
              <Step n={2} title="Dán vào tool">
                <p>Vào <b>Cài đặt → Gemini API</b>, dán key, bấm <b>Lưu key</b>. Key được mã hóa và lưu trên máy bạn. Đừng gửi key cho người khác.</p>
                <Button variant="default" className="mt-1 h-8 px-3 text-xs" onClick={() => go('settings')}>Mở Cài đặt</Button>
              </Step>
              <Step n={3} title="Chọn model">
                <p><b>Gemini 2.5 Flash</b> nhanh, rẻ, đủ dùng cho mô tả và trả lời bình luận. Gói miễn phí có giới hạn số lần gọi mỗi phút và mỗi ngày. Nếu tool báo "hết hạn mức", hãy chờ ít phút hoặc bật thanh toán trong AI Studio.</p>
              </Step>
            </ol>
          </Card>
          <div className="space-y-3">
            <Card title="Đăng video qua YouTube Studio" hint={accounts ? <Pill tone="success">Đã có kênh</Pill> : undefined}>
              <ol>
                <Step n={1} title="Đăng nhập Google và tick kênh" done={accounts}>
                  <p>Vào trang <b>Tài khoản</b>, đăng nhập tài khoản Google sở hữu kênh trong khung Studio, rồi tick các kênh tool được dùng.</p>
                  <Button variant="default" className="mt-1 h-8 px-3 text-xs" onClick={() => go('accounts')}>Mở Tài khoản</Button>
                </Step>
                <Step n={2} title="Chọn thư mục video">
                  <p>Bỏ các video cần đăng vào <b>một thư mục</b>, mỗi video kèm ảnh thumbnail <b>cùng tên</b>: <code>Bí ẩn tập 7.mp4</code> + <code>Bí ẩn tập 7.jpg</code> (hoặc .jpeg, .png, .webp). Không cần thư mục con, không cần info.txt.</p>
                  <p>Ở trang <b>Đăng video</b>, bấm <b>Chọn thư mục</b>. Tiêu đề là tên file; mô tả, thẻ, chế độ hiển thị và lịch lấy theo <b>Mẫu mặc định</b>. Muốn mô tả riêng, bấm <b>Gemini viết mô tả</b> (tùy chọn): mô tả được lưu vào <code>Bí ẩn tập 7.txt</code> cạnh video.</p>
                  <p>Đăng xong, tool chuyển video, ảnh và file kèm theo vào thư mục con <code>da-dang</code> nên không bao giờ đăng lại.</p>
                </Step>
                <Step n={3} title="Chọn kênh và chế độ hiển thị">
                  <p>Chọn kênh ở ô <b>Kênh đăng video</b>. Ở <b>Mẫu mặc định → Chế độ hiển thị</b>, chọn như trong Studio: <b>Lưu hoặc xuất bản</b> (Riêng tư, Không công khai, Công khai, có thể bật <b>Công chiếu ngay</b>) hoặc <b>Lên lịch</b> (ngày, giờ theo mốc 15 phút, <b>Đặt làm video Công chiếu</b>).</p>
                  <p>Tool mở hộp thoại <b>Tải video lên</b> của Studio trong cửa sổ chạy ngầm và điền như bạn tự làm: tiêu đề, mô tả (nối sau mô tả mặc định của kênh), hình thu nhỏ, danh sách phát, các mục trong <b>Hiện thêm</b> theo <b>Mẫu Studio</b> của mẫu mặc định, màn hình kết thúc, chế độ hiển thị hoặc lịch đăng.</p>
                </Step>
                <Step n={4} title="Để tool chạy tới khi tải lên xong">
                  <p>Đừng tắt tool khi video đang tải lên. Bấm <b>Dừng</b> thì tool dừng sau video đang tải; video dở dang nằm trong Studio dưới dạng bản nháp.</p>
                </Step>
              </ol>
            </Card>
            <Card title="Lỗi hay gặp">
              <ul className="space-y-2 text-[13px] text-muted-foreground [&_b]:text-foreground">
                <li><b>Không đặt được hình thu nhỏ:</b> kênh chưa xác minh số điện thoại. Xác minh tại youtube.com/verify.</li>
                <li><b>Đã đạt giới hạn tải lên hằng ngày:</b> YouTube giới hạn số video mỗi ngày. Tool dừng hàng đợi, ngày mai đăng tiếp.</li>
                <li><b>Chưa đăng nhập / phiên hết hạn:</b> đăng nhập lại tài khoản ở trang Tài khoản.</li>
                <li><b>“Bạn đã hoàn tất… Hãy thử làm mới trang”</b> (hay gặp với video dài hơn 15 phút): tool tự bấm <b>Đã hiểu</b>, làm mới Studio và chọn lại file, tối đa 2 lần.</li>
                <li><b>Google yêu cầu xác minh danh tính:</b> tool dừng lại. Mở trang <b>Tài khoản</b>, tự xác minh trong khung Studio rồi bấm đăng lại. Tool không bao giờ tự xác minh thay bạn.</li>
                <li><b>Tool bấm sai chỗ trên Studio:</b> gửi thư mục <code>loi-trang</code> (ảnh + HTML lúc lỗi) để sửa.</li>
              </ul>
              <div className="mt-2"><Link send={send} url="https://youtube.com/verify">Xác minh kênh</Link></div>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  )
}
