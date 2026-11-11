// Tool co "ranh han" khong: viec tu chay ngam (tu toi uu hang cho sau khi dang, src/features/optimize.js)
// chi duoc chay khi khong chen ngang viec nao khac. Ham thuan (main.js gom so lieu, bai kiem goi thang).
//   - khong tinh nang nao dang ban (dang video / cap nhat o main.js, state.f.<ten>.busy ...)
//   - khung Studio khong co viec nao dang chay (state.studio.job) va paneChain / cua so an khong con viec xep hang
//   - nguoi dung khong vua ra lenh / bam / go o giao dien trong QUIET_MS gan day
const QUIET_MS = 5 * 60e3

// ten tinh nang (state.f.<ten>) -> chu hien thi
const FEATURE_LABELS = {
  accounts: 'Tài khoản', inbox: 'Cộng đồng', optimize: 'Tối ưu video', posts: 'Đăng bài', aiposts: 'Đăng bài AI', hometab: 'Trang chủ kênh',
}

// trang thai rieng cua mot tinh nang -> dang ban khong
function featureBusy(name, f) {
  if (!f || typeof f !== 'object') return false
  if (name === 'accounts') return !!(f.login || f.paneBusy || (f.busy && Object.keys(f.busy).length) || (f.debug && f.debug.busy))
  if (f.busy && (typeof f.busy !== 'object' || Object.keys(f.busy).length)) return true // boolean hoac chuoi ('generate' | 'post')
  if (f.sending > 0 || f.hearting) return true
  if (f.all && f.all.running) return true
  return false
}

const minutes = (ms) => Math.max(1, Math.ceil(ms / 60e3))

// -> '' khi ranh han; khong thi ly do (tieng Viet, ghi vao nhat ky / hien o trang Toi uu video)
// o: { now, lastActive, quietMs, mainBusy, status, studioJob, jobs (viec withChannel dang chay + xep hang), features (state.f) }
function busyReason(o = {}) {
  const now = o.now || Date.now()
  const quiet = o.quietMs === undefined ? QUIET_MS : o.quietMs
  if (o.mainBusy) return o.status === 'update' ? 'tool đang cập nhật' : 'đang đăng video'
  if (o.studioJob) return `khung Studio đang chạy "${o.studioJob}"`
  if (o.jobs > 0) return `còn ${o.jobs} việc đang chờ chạy trên YouTube Studio`
  for (const [name, f] of Object.entries(o.features || {})) {
    if (featureBusy(name, f)) return `${FEATURE_LABELS[name] || name} đang chạy`
  }
  const since = now - (o.lastActive || 0)
  if (o.lastActive && since < quiet) return `bạn vừa dùng tool (chờ ${minutes(quiet)} phút không thao tác, còn khoảng ${minutes(quiet - since)} phút)`
  return ''
}

module.exports = { busyReason, featureBusy, QUIET_MS, FEATURE_LABELS }
