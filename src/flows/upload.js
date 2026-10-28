// Dang video bang chinh hop thoai "Tai video len" cua YouTube Studio (khong dung YouTube Data API), theo dung cac buoc
// nguoi dung quay (Studio tieng Viet, thg 10/2026):
//   trang tong quan kenh /channel/<UC> -> nut tai len (canh "Trang tong quan cua kenh") hoac Tao -> Tai video len
//   (khong duoc thi /videos/upload?d=ud) -> Chon tep -> Chi tiet: tieu de (thay ten tep), mo ta (giu mo ta co san cua kenh,
//   xuong 2 dong roi them mo ta cua video), Hinh thu nho -> Tai tep len, Danh sach phat, tre em = Khong, Hien them: cac muc
//   cua mau toi uu (quang cao tra tien, AI, the = the co san + tieu de + the cua video, ngay quay, vi tri, giay phep, nhung,
//   thong bao, phoi lai Shorts, danh muc, binh luan) -> Tiep -> Cac thanh phan cua video (phu de, man hinh ket thuc cua
//   video gan nhat) -> Tiep -> Kiem tra ban dau -> Tiep -> Che do hien thi / Len lich -> cho tai len 100% -> Luu
//   -> "Van xuat ban" -> ma video.
// Ham thuan tren mot Page da o dung kenh (ctx.withChannel lo chuyen kenh). Cua so chay ngam duoc hien (trong suot) trong
// luc lam (page.show) de Studio ve trang va tai len khong bi Windows tam dung.
// Muc bat buoc (file, tieu de, tre em, che do hien thi, nut Luu, ma video) loi -> nem loi;
// muc tuy chon loi -> canh bao + luu anh trang, lam tiep (muc cua mau chua dat duoc tra ve trong `missed`).
const path = require('path')
const fs = require('fs')
const { StepError, channelOf, sleep } = require('../studio/driver')
const opt = require('./optimize')
const { chooseFiles, dateText, timeText, scheduleTime } = require('./post')
const { normalizeTemplate, keepAll, renderComment } = require('../optimize-template')

const { pickRadio, pickOption, setCheckbox, openMore, isChecked, isEnabled, markSection, sec, triggerInfo, FIELDS } = opt._t
const O = opt.LABELS
const OS = opt.SEL

// Chu tren man hinh (Studio tieng Viet + tieng Anh). any: bo chon theo ma co dinh cua Studio, tim truoc chu.
// Da kiem tren HTML that:
//  - trang tong quan: nut tai len #upload-icon, nut Tao (ytcp-button icon video_call) (tests/mock-yt/upload/that-chon-tep.html);
//  - hop thoai tai len o buoc chon tep (that-chon-tep.html, loi-trang 28/10/2026): ytcp-uploads-dialog[workflow-step],
//    ytcp-uploads-file-picker > ytcp-button#select-files-button "Chọn tệp" + input[type=file][name=Filedata], nut
//    #ytcp-uploads-dialog-close-button, ytcp-video-upload-progress span.progress-label, .error-short / .error-details#error-message,
//    nut #back-button / #next-button / #done-button ("Lưu"); hop thoai yt-trust-tiers-wizard-dialog ("Bạn đã hoàn tất" ... [Đã hiểu]
//    = ytcp-button#close-button);
//  - cac o cua trang Chi tiet video (dung chung voi hop thoai tai len): tieu de, mo ta, tre em, thumbnail #file-loader /
//    #select-button, danh sach phat (ytcp-playlist-dialog), Hien them, cac muc nang cao; lich chon ngay ytcp-date-picker
//    (form#form input, #prev-month / #next-month, [role=listitem][aria-label] > .calendar-day).
//  - Che do hien thi: chi co ten the / id lay tu CSS that cua Studio (khong co HTML luc mo): ytcp-uploads-review >
//    ytcp-video-visibility-select > #first-container (tp-yt-paper-radio-group, #private-radio-button, .instant-premiere-container
//    ytcp-checkbox-lit) + #second-container (#second-container-expand-button, #schedule-container > ytcp-visibility-scheduler >
//    ytcp-datetime-picker: #time-of-day-trigger, #time-of-day-container, #timezone-select-button; ytcp-checkbox-lit#schedule-type-checkbox).
// Con lai (cac buoc sau Chi tiet, o nhap gio ben trong #time-of-day-container, phu de, nut man hinh ket thuc trong hop thoai,
// hop thoai xac minh danh tinh): theo cau truc Studio quen biet + video quay: sai thi sua o day + trang gia tests/mock-yt/upload.
const L = (text, regex, any) => (any ? { text, regex, any } : { text, regex })
const DLG = { selector: 'ytcp-uploads-dialog', hidden: true }
const inD = (t) => ({ ...t, within: DLG })
const TRUST = 'yt-trust-tiers-wizard-dialog'
const LABELS = {
  // trang tong quan kenh: nut tai len (that: ytcp-quick-actions ytcp-icon-button#upload-icon aria-label "Tải video lên")
  uploadIcon: L('Tải video lên', '^(tải video lên|upload videos?)$', 'ytcp-icon-button#upload-icon, ytcp-upload-video-button #upload-button'),
  // nut "Tao" tren thanh tren cung (that: ytcp-button.ytcpAppHeaderCreateIcon icon="yt-sys-icons:video_call" aria-label "Tạo")
  create: L('Tạo', '^(tạo|create)$', 'ytcp-button#create-icon, ytcp-button[icon="yt-sys-icons:video_call"]'),
  createUpload: L('Tải video lên', '^(tải video lên|upload videos?)$', 'tp-yt-paper-item#text-item-0'),
  // that: ytcp-uploads-file-picker > ytcp-button#select-files-button > button[aria-label="Chọn tệp"]
  selectFiles: L('Chọn tệp', '^(chọn tệp|chọn tệp để tải lên|select files)$', 'ytcp-uploads-file-picker #select-files-button'),
  closeDialog: L('Đóng', '^(đóng|close)$', 'ytcp-button#ytcp-uploads-dialog-close-button'),
  // hop thoai "Ban da hoan tat - Ban da co quyen su dung tinh nang nay roi. Hay thu lam moi trang." [Da hieu] (that)
  trustClose: L('Đã hiểu', '^(đã hiểu|got it|ok)$', `${TRUST} ytcp-button#close-button`),
  // dong y khi hop thoai "Ban da hoan tat" can lam moi trang (Viet / Anh)
  trustStale: '(bạn đã hoàn tất|đã có quyền sử dụng tính năng này|làm mới trang|you.re all set|already have access to this feature|refresh the page)',
  // Google bat xac minh danh tinh: tool khong bao gio tu lam
  verify: '(xác minh danh tính|xác minh rằng đó là bạn|xác minh đó là bạn|verify it.s you|verify your identity|confirm it.s you)',
  thumbUpload: L('Tải tệp lên', '^(tải tệp lên|upload file|upload thumbnail)$', 'ytcp-thumbnail-uploader #select-button, ytcp-thumbnail-editor #select-button'),
  next: L('Tiếp', '^(tiếp|tiếp theo|next)$', 'ytcp-button#next-button'),
  done: L('Lưu', '^(xuất bản|lưu|lên lịch|publish|save|schedule)$', 'ytcp-button#done-button'),
  kidsYes: L('Có, nội dung này dành cho trẻ em', '^(có, nội dung này dành cho trẻ em|yes, it.s made for kids)', 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_MFK"]'),
  kidsNo: L('Không, nội dung này không dành cho trẻ em', '^(không, nội dung này không dành cho trẻ em|no, it.s not made for kids)', 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]'),
  // buoc Che do hien thi: "Luu hoac xuat ban" (#first-container) - Rieng tu / Khong cong khai / Cong khai
  //   [ ] Dat o che do Cong chieu ngay (duoi Cong khai); "Len lich" (#second-container, mo bang nut mui ten):
  //   "Dat lich chuyen sang che do cong khai" [ngay] [gio] [Mui gio] [ ] Dat lam video Cong chieu
  public: L('Công khai', '^(công khai|public)$', 'ytcp-video-visibility-select tp-yt-paper-radio-button[name="PUBLIC"], tp-yt-paper-radio-button[name="PUBLIC"]'),
  unlisted: L('Không công khai', '^(không công khai|unlisted)$', 'ytcp-video-visibility-select tp-yt-paper-radio-button[name="UNLISTED"], tp-yt-paper-radio-button[name="UNLISTED"]'),
  private: L('Riêng tư', '^(riêng tư|private)$', '#private-radio-button, tp-yt-paper-radio-button[name="PRIVATE"]'),
  instantPremiere: L('Đặt ở chế độ Công chiếu ngay', '^(đặt ở chế độ công chiếu ngay|set as instant premiere)$', '.instant-premiere-container ytcp-checkbox-lit #checkbox, ytcp-checkbox-lit#enable-premiere-checkbox #checkbox'),
  scheduleOpen: L('Lên lịch', '^(lên lịch|schedule)$', '#second-container-expand-button'),
  scheduleRadio: { selector: '#schedule-radio-button, tp-yt-paper-radio-button[name="SCHEDULE"]' }, // khong tim theo chu: "Lên lịch" con la nhan nut mo
  dateTrigger: L('Ngày', '^(ngày|date)$', '#datepicker-trigger ytcp-dropdown-trigger, ytcp-dropdown-trigger#datepicker-trigger, #datepicker-trigger'),
  schedulePremiere: L('Đặt làm video Công chiếu', '^(đặt làm video công chiếu|set as premiere)$', 'ytcp-checkbox-lit#schedule-type-checkbox #checkbox, #schedule-type-checkbox #checkbox'),
  timezone: L('Múi giờ', '^(múi giờ|time ?zone)$', '#timezone-select-button'),
  notify: L('Xuất bản lên trang Kênh đăng ký và thông báo đến người đăng ký', '^(xuất bản lên trang kênh đăng ký và thông báo đến người đăng ký|publish to subscriptions feed and notify subscribers)$', 'ytcp-checkbox-lit#notify-subscribers #checkbox'),
  // buoc "Cac thanh phan cua video": Phu de [Them], Man hinh ket thuc [Nhap tu video][Them], The, Bai kiem tra
  subsAdd: L('Thêm phụ đề', '^(thêm phụ đề|add subtitles)$', 'ytcp-uploads-video-elements #subtitles-button'),
  subsUpload: L('Tải tệp lên', '^(tải tệp lên|upload file)$', '#choose-upload-file'),
  subsTiming: L('Có thời gian', '^(có thời gian|with timing)$', 'tp-yt-paper-radio-button[name="UPLOAD_TIMED"]'),
  subsContinue: L('Tiếp tục', '^(tiếp tục|continue)$', '#confirm-button'),
  subsDone: L('Xong', '^(xong|done)$', '#done-button'),
  endScreenRow: L('Màn hình kết thúc', '^(màn hình kết thúc|thêm màn hình kết thúc|end screen|add an end screen)$'),
  endScreenAdd: L('Thêm', '^(thêm|add)$', 'ytcp-uploads-video-elements #endscreens-button'),
  cancel: L('Hủy', '^(hủy|huỷ|hủy thay đổi|huỷ thay đổi|cancel|discard changes|discard)$'),
  // danh sach phat
  plNew: L('Danh sách phát mới', '^(danh sách phát mới|tạo danh sách phát mới|new playlist|create new playlist)$', '.new-playlist-button'),
  plNewItem: L('Danh sách phát mới', '^(danh sách phát mới|new playlist)$'),
  plCreate: L('Tạo', '^(tạo|create)$', '#create-button'),
  // sau khi bam Luu: "Chung toi van dang kiem tra noi dung cua ban" [Quay lai] [Van xuat ban], roi hop thoai chia se
  publishAnyway: L('Vẫn xuất bản', '^(vẫn xuất bản|publish anyway)$'),
  shareClose: L('Đóng', '^(đóng|close|đã hiểu|got it)$', 'ytcp-video-share-dialog #close-button, ytcp-uploads-still-processing-dialog #close-button'),
}
const SEL = {
  picker: 'ytcp-uploads-file-picker',
  // that: <input type="file" name="Filedata" multiple aria-hidden="true"> ngay sau #select-files-button
  fileInput: 'ytcp-uploads-file-picker input[type=file][name=Filedata], ytcp-uploads-file-picker input[type=file], input[type=file][name=Filedata]',
  // hop thoai phu che hop thoai tai len: "Ban da hoan tat" (that) va cac hop thoai xac minh (doan)
  // (bo chinh hop thoai tai len: xem blocker())
  blockers: `${TRUST} tp-yt-paper-dialog, tp-yt-paper-dialog[role=dialog], [role=alertdialog]`,
  trust: TRUST,
  dateInput: 'ytcp-date-picker #textbox input, ytcp-date-picker input',
  calMonth: 'ytcp-date-picker [role=listitem][aria-label]',
  calPrev: 'ytcp-date-picker #prev-month',
  calNext: 'ytcp-date-picker #next-month',
  listbox: '[role=listbox], tp-yt-paper-listbox',
  option: '[role=option], tp-yt-paper-item',
  scheduler: 'ytcp-visibility-scheduler, #schedule-container',
  title: '#title-textarea #textbox',
  desc: '#description-textarea #textbox',
  thumbInput: 'ytcp-uploads-dialog ytcp-thumbnail-uploader input#file-loader, ytcp-uploads-dialog ytcp-thumbnails-compact-editor-uploader input[type=file]',
  thumbHost: 'ytcp-thumbnail-uploader, ytcp-thumbnails-compact-editor-uploader',
  plDialog: { selector: 'ytcp-playlist-dialog', hidden: true },
  plBox: '#checkbox[role=checkbox], [role=checkbox]',
  plTitle: 'ytcp-playlist-metadata-editor #title-textarea #textbox, ytcp-playlist-creation-dialog #title-textarea #textbox, ytcp-playlist-creation-dialog textarea, ytcp-playlist-metadata-editor textarea',
  vis: 'tp-yt-paper-radio-button[name="PUBLIC"], tp-yt-paper-radio-button[name="UNLISTED"], tp-yt-paper-radio-button[name="PRIVATE"]',
  elements: 'ytcp-uploads-video-elements',
  timeInput: '#time-of-day-container input, #time-of-day-container #textbox input',
  timeTrigger: '#time-of-day-trigger',
  // chu tien do o chan hop thoai ("Đã tải được 5% ... Còn 4 phút"); sau khi hop thoai dong: o tien do o goc trang
  progress: 'ytcp-video-upload-progress .progress-label, ytcp-video-upload-progress span.progress-label, ytcp-uploads-dialog .progress-label',
  progressOut: 'ytcp-multi-progress-monitor, ytcp-uploads-mini-indicator, ytcp-video-upload-progress',
  error: 'ytcp-uploads-dialog .error-short, ytcp-uploads-dialog #error-message, ytcp-uploads-dialog .error-details, ytcp-uploads-dialog [role=alert]',
  // the ngoai co kich thuoc 0 (hop thoai ben trong position: fixed): xem hop thoai ben trong co hien khong
  share: 'ytcp-video-share-dialog tp-yt-paper-dialog, ytcp-uploads-still-processing-dialog tp-yt-paper-dialog, ytcp-video-share-dialog [role=dialog], ytcp-uploads-still-processing-dialog [role=dialog]',
  // trinh chinh man hinh ket thuc (giong trang Chi tiet video, html/yt-5)
  esDialog: 'tp-yt-paper-dialog:has(#video-editor-modal-host-title), tp-yt-paper-dialog:has(ytve-editor)',
  // phu de: hop thoai rieng (khong phai hop thoai tai len)
  subsDialog: 'ytve-captions-editor-modal, ytgn-captions-upload-dialog, ytcp-captions-upload-dialog, ytve-modal-host',
}

const norm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
const UP_ERROR = /(giới hạn tải lên|upload limit|rất tiếc, đã xảy ra lỗi|oops, something went wrong|tải lên không thành công|upload failed|không thể tải lên|couldn.t upload|can.t upload|lỗi khi tải lên|upload error|tệp không hợp lệ|invalid file|định dạng tệp không hợp lệ|đã hủy tải lên|upload canceled|upload cancelled)/
const UP_DONE = /(tải lên hoàn tất|đã tải lên xong|upload complete|đang xử lý|processing|đã xử lý|processed|kiểm tra|checks? complete|checking|no issues found)/
const UP_RUNNING = /(đang tải lên|đã tải được|uploading|uploaded \d|đang chờ tải lên|waiting to upload)/

// Nhan tien do: { phase: 'error'|'uploaded'|'uploading'|'', pct }
function uploadPhase(label) {
  const l = norm(label)
  if (!l) return { phase: '', pct: null }
  if (UP_ERROR.test(l)) return { phase: 'error', pct: null, text: String(label).trim() }
  const m = /(\d{1,3})\s*%/.exec(l)
  const pct = m ? Math.min(100, Number(m[1])) : null
  if (pct === 100) return { phase: 'uploaded', pct: 100 }
  if (UP_RUNNING.test(l) && pct !== null) return { phase: 'uploading', pct }
  if (UP_DONE.test(l)) return { phase: 'uploaded', pct: 100 }
  if (UP_RUNNING.test(l) || pct !== null) return { phase: 'uploading', pct }
  return { phase: 'uploaded', pct: null } // chu khac (vd "Đã kiểm tra xong") = khong con tai len
}

// Ma video (11 ky tu) trong cac duong lien ket cua hop thoai ("Đường liên kết của video https://youtu.be/<id>")
const ID_RE = /(?:youtu\.be\/|\/video\/|[?&]v=|\/shorts\/)([\w-]{11})(?![\w-])/
const readId = (page) => page.eval((sel, re) => {
  const r = new RegExp(re)
  const els = window.__ya.all(document, sel)
  for (const el of els) {
    for (const v of [el.getAttribute('href'), el.textContent]) { const m = r.exec(String(v || '')); if (m) return m[1] }
  }
  return ''
}, 'ytcp-uploads-dialog a[href], a.ytcp-video-info, ytcp-video-info a[href], span.video-url-fadeable a, .video-url-fadeable, ytcp-video-share-dialog a[href], #share-url', ID_RE.source).catch(() => '')

const readLabel = (page, s) => page.eval((s) => {
  const el = window.__ya.find({ selector: s }, true)[0] || window.__ya.find({ selector: s, hidden: true }, true)[0]
  return el ? String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : ''
}, s).catch(() => '')
const readProgress = (page) => readLabel(page, SEL.progress)

const readError = (page) => page.eval((s, re) => {
  const r = new RegExp(re, 'i')
  for (const el of window.__ya.find({ selector: s }, true)) {
    const t = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
    if (t && r.test(window.__ya.norm(t))) return t
  }
  return ''
}, SEL.error, UP_ERROR.source).catch(() => '')

// Buoc dang hien cua hop thoai: ten the cac buoc (ytcp-uploads-details, -video-elements, -checks, -review...) dang hien
const stepPrint = (page) => page.eval(() => {
  const d = window.__ya.all(document, 'ytcp-uploads-dialog')[0]
  if (!d) return ''
  const seen = window.__ya.all(d, '*').filter((el) => /^YTCP-UPLOADS-/.test(el.tagName) && !/^YTCP-UPLOADS-(DIALOG|FILE-PICKER)/.test(el.tagName) && window.__ya.visible(el)).map((el) => el.tagName.toLowerCase())
  return seen.join(',')
}).catch(() => '')

// Ten buoc dang chon tren thanh buoc (de bao loi)
const stepName = (page) => page.eval(() => {
  const b = window.__ya.all(document, 'ytcp-uploads-dialog [id^="step-badge-"]').find((x) => x.hasAttribute('active') || x.getAttribute('state') === 'active' || x.getAttribute('aria-selected') === 'true')
  return b ? String(b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim() : ''
}).catch(() => '')

// Hop thoai tai len co dang mo (o chon file hoac trang Chi tiet)?
const pickerReady = (page) => page.eval((s) => !!(window.__ya.count({ selector: s.fileInput, hidden: true }) || window.__ya.count({ selector: '#select-files-button' }) || window.__ya.count({ selector: s.title })), SEL).catch(() => false)

// Hop thoai phu dang che hop thoai tai len: { kind: 'stale' | 'verify' | 'trust', text } | null
//   stale: "Ban da hoan tat - Ban da co quyen su dung tinh nang nay roi. Hay thu lam moi trang." (that, yt-trust-tiers-wizard-dialog)
//   verify: Google / YouTube doi xac minh danh tinh; trust: hop thoai tinh nang khac (vd can xac minh de tai video dai)
// Chay trong trang (page.until / page.eval).
function findBlocker(s, reStale, reVerify) {
  const ya = window.__ya
  const stale = new RegExp(reStale, 'i')
  const verify = new RegExp(reVerify, 'i')
  for (const d of ya.find({ selector: s.blockers }, true)) {
    if (d.closest('ytcp-uploads-dialog')) continue
    const text = String(d.innerText || '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const t = ya.norm(text)
    const inTrust = !!d.closest(s.trust)
    if (verify.test(t)) return { kind: 'verify', text }
    if (inTrust) return { kind: stale.test(t) ? 'stale' : 'trust', text }
  }
  if (/accounts\.google\.com\/.*(challenge|speedbump)/.test(location.href)) return { kind: 'verify', text: location.href }
  return null
}
const blocker = (page) => page.eval(findBlocker, SEL, LABELS.trustStale, LABELS.verify).catch(() => null)
// Ham chay trong trang co dung findBlocker: page.eval chen ma nguon ham (`(${fn})(...)`), nen gop ca findBlocker vao
// (khong dung eval trong trang: Studio co CSP / Trusted Types)
const withBlocker = (fn) => ({ toString: () => `(...a) => { ${findBlocker}; return (${fn})(...a) }` })

const VERIFY_MSG = 'YouTube yêu cầu xác minh danh tính ("Xác minh danh tính của bạn" / "Verify it\'s you") trước khi cho tải video này lên (video dài hơn 15 phút chỉ tải được khi tài khoản đã xác minh). Hãy mở trang Tài khoản, vào YouTube Studio của kênh ở khung bên phải và tự làm theo hướng dẫn xác minh của Google, rồi đăng lại. Tool không tự xác minh thay bạn.'

async function poll(page, fn, ms, every = 250) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn().catch(() => null)
    if (v) return v
    if (Date.now() > end) return null
    await sleep(every)
  }
}

// Cac muc cua mau toi uu dat trong hop thoai (sau "Hien them"), theo thu tu trong video quay
const DIALOG_FIELDS = ['paidPromotion', 'ai', 'tags', 'language', 'recordingDate', 'location', 'license', 'embeddable', 'notify', 'remix', 'category', 'comments']

// job: { uc, file, title, description, tags, playlists (ten / ID PL... cua preset), madeForKids, thumbnail,
//        subtitles: [{file, lang}], privacy: public|unlisted|private, premiere (Cong khai: "Dat o che do Cong chieu ngay"),
//        publishAt (ISO|null: "Len lich"), schedulePremiere ("Dat lam video Cong chieu" khi len lich), notifySubscribers,
//        template (mau toi uu cua preset, src/optimize-template.js: cac muc chi co trong Studio), channelName }
// Tra ve { id, url, warnings, missed, applied, schedule, visibility: private|unlisted|public|schedule, premiere }
//   missed: muc cua mau (playlists, paidPromotion, ai, tags, ..., endScreen) + 'notify' chua dat duoc trong hop thoai
//   applied: muc cua mau da dung toi trong hop thoai (dat moi hoac da dung san)
async function uploadVideo(page, job, o = {}) {
  // cua so chay ngam phai duoc ve (Windows tam dung trang an): hien trong suot trong luc tai len
  const hide = page.show ? await page.show() : null
  try { return await upload(page, job, o) } finally { if (hide) await hide() }
}

async function upload(page, job, { urls, log = () => {}, onStep = () => {}, onProgress = () => {}, now = () => new Date() } = {}) {
  const warnings = []
  const missed = new Set()
  const applied = new Set()
  const warn = (m) => { warnings.push(m); log('warn', m) }
  const step = (key, name, fn) => { onStep(key); return page.run(name, fn) }
  const shot = (name) => (page.snapshot ? page.snapshot(`dang-video-${name}`).catch(() => '') : '')
  // muc tuy chon: loi -> canh bao + anh trang, dong menu / hop thoai dang mo, lam tiep
  const soft = async (key, name, fn, what) => {
    try { await step(key, name, fn); return true } catch (e) {
      if (page.shouldStop()) throw e
      await shot(name.replace(/[^\p{L}\w]+/gu, '-'))
      await page.press('Escape').catch(() => {})
      await sleep(300)
      // trinh chinh man hinh ket thuc con mo: Huy thay doi
      const es = { ...O.esCancel, within: { selector: SEL.esDialog, hidden: true } }
      if (await page.has(es).catch(() => false)) await page.click(es).catch(() => {})
      warn(`${what || `Bỏ qua mục "${name}"`}: ${e.message}`)
      return false
    }
  }

  if (!job || !job.file || !fs.existsSync(job.file)) throw new StepError(`Không thấy file video ${job && job.file ? path.basename(job.file) : ''}.`, 'Chọn file')
  const uc = job.uc && /^UC[\w-]{10,}$/.test(job.uc) ? job.uc : channelOf(page.url())
  if (!uc) throw new StepError('Không biết UC ID của kênh để mở trang tải video lên.', 'Mở hộp thoại tải lên')
  const size = fs.statSync(job.file).size
  const t = job.template ? normalizeTemplate(job.template) : keepAll()

  // ---- 1. mo hop thoai tai len: trang tong quan kenh -> nut tai len / Tao -> Tai video len; khong duoc thi ?d=ud ----
  const openDialog = (name) => step('open', name, async () => {
    const clickOpen = async (wait) => {
      // nut tai len canh "Trang tong quan cua kenh"; trang tai cham: thay nut Tao truoc thi cho them chut nua
      let seenCreate = 0
      const how = await poll(page, async () => {
        if (await page.has(LABELS.uploadIcon)) return 'icon'
        if (await page.has(LABELS.create)) { seenCreate = seenCreate || Date.now(); if (Date.now() - seenCreate > 1500) return 'create' }
        return null
      }, wait)
      if (how === 'icon') await page.click(LABELS.uploadIcon)
      else if (how === 'create' || (seenCreate && (await page.has(LABELS.create)))) {
        await page.click(LABELS.create)
        await page.click({ ...LABELS.createUpload, selector: 'tp-yt-paper-item, [role=menuitem], [role=option]' })
      } else return false
      return !!(await poll(page, () => pickerReady(page), Math.max(page.timeout, 15000)))
    }
    await page.goto(`${urls.studio}/channel/${uc}`)
    if (channelOf(page.url()) === uc && (await clickOpen(Math.max(page.timeout, 15000)))) return
    log('info', 'Không mở được hộp thoại tải lên từ trang tổng quan kênh: mở bằng đường dẫn tải lên của Studio.')
    await page.goto(`${urls.studio}/channel/${uc}/videos/upload?d=ud`)
    if (await poll(page, () => pickerReady(page), Math.max(page.timeout, 15000))) return
    if (await clickOpen(5000)) return
    throw new StepError('Không mở được hộp thoại tải video lên của YouTube Studio.', page.step)
  })

  // ---- 2. chon file video ----
  const chooseFile = () => step('file', `Chọn file ${path.basename(job.file)}`, async () => {
    if (await page.has({ selector: SEL.title })) throw new StepError('Hộp thoại tải lên đang mở một video khác (chưa xong). Hãy đóng nó trong Studio rồi chạy lại.', page.step)
    try {
      await chooseFiles(page, { input: SEL.fileInput, button: LABELS.selectFiles }, [job.file])
    } catch (e) {
      throw new StepError(`Không thấy ô chọn file video trong hộp thoại tải lên (${e.message}).`, page.step)
    }
  })

  // ---- 3. cho trang Chi tiet; hop thoai "Ban da hoan tat ... Hay thu lam moi trang" -> Da hieu, tai lai Studio, chon lai file
  //         (toi da 2 lan); Google doi xac minh danh tinh -> dung, nguoi dung tu xac minh ----
  const waitDetails = () => step('details', 'Chờ trang Chi tiết', () => page.until(withBlocker((s, re, reStale, reVerify) => {
    const ya = window.__ya
    const r = new RegExp(re, 'i')
    const b = findBlocker(s, reStale, reVerify)
    if (b) return `${b.kind}:${b.text}`
    for (const el of ya.find({ selector: s.error }, true)) {
      const t = String(el.innerText || '').replace(/\s+/g, ' ').trim()
      if (t && r.test(ya.norm(t))) return 'err:' + t
    }
    const pr = ya.find({ selector: s.progress }, true)[0]
    if (pr && r.test(ya.norm(pr.innerText))) return 'err:' + String(pr.innerText).trim()
    return ya.count({ selector: s.title }) ? 'ok' : ''
  }), [SEL, UP_ERROR.source, LABELS.trustStale, LABELS.verify], { timeout: Math.max(page.timeout, 60000), what: 'trang Chi tiết của video vừa chọn (Studio chưa nhận file)' }))
  const noDraft = (e) => { e.noDraft = true; return e }

  await openDialog('Mở hộp thoại tải video lên')
  // sau khi chon file video da nam trong Studio (ban nhap): loi bat buoc thi bao them de nguoi dung kiem tra truoc khi dang lai
  let chosen = false
  let stopProgress = false
  let lastPct = -1
  let progressText = ''
  const report = (pct) => { if (pct !== null && pct !== lastPct) { lastPct = pct; onProgress(pct) } }
  const ticker = (async () => {
    while (!stopProgress) {
      const label = await readProgress(page)
      if (label) progressText = label
      const p = uploadPhase(label)
      report(p.phase === 'uploaded' ? 100 : p.pct)
      await sleep(1000)
    }
  })()
  let reached = false // da thay tai len 100%
  try {
    // ---- 3. trang Chi tiet (lam moi Studio khi gap "Ban da hoan tat") ----
    for (let attempt = 0; ; attempt++) {
      await chooseFile()
      chosen = true
      const r = await waitDetails()
      if (r === 'ok') break
      const [kind] = r.split(':', 1)
      const text = r.slice(kind.length + 1)
      if (kind === 'err') throw new StepError(`YouTube báo: ${text}`, page.step)
      if (kind === 'verify' || kind === 'trust') {
        await shot('xac-minh')
        throw noDraft(new StepError(`${VERIFY_MSG}${kind === 'trust' ? ` (Studio hiện: "${text.slice(0, 200)}")` : ''}`, page.step))
      }
      // stale: Studio da nhan file nhung trang cu chua biet tai khoan da co quyen (video dai hon 15 phut)
      await shot('ban-da-hoan-tat')
      if (attempt >= 2) throw noDraft(new StepError('YouTube vẫn báo "Bạn đã có quyền sử dụng tính năng này rồi. Hãy thử làm mới trang" sau 2 lần làm mới Studio. Hãy mở YouTube Studio của kênh ở trang Tài khoản, làm mới trang (F5) và thử tải video lên bằng tay một lần, rồi chạy lại.', page.step))
      log('warn', `Studio báo "${text.slice(0, 120)}": bấm "Đã hiểu", làm mới Studio rồi chọn lại file (lần ${attempt + 1}/2).`)
      await step('file', 'Đóng hộp thoại "Bạn đã hoàn tất"', async () => {
        const close = { ...LABELS.trustClose, any: undefined, selector: 'ytcp-button, button', within: { selector: SEL.trust, hidden: true } }
        if (await page.has({ selector: LABELS.trustClose.any })) await page.click({ selector: LABELS.trustClose.any })
        else if (await page.has(close)) await page.click(close)
        else await page.press('Escape')
        await poll(page, async () => !(await blocker(page)), 5000)
      })
      await openDialog(`Làm mới Studio và mở lại hộp thoại tải lên (lần ${attempt + 1}/2)`)
    }

    // tieu de: Studio dien san ten tep (hoi tre) -> chon het roi thay
    await step('details', 'Tiêu đề', async () => {
      const box = inD({ selector: SEL.title })
      await page.until((t) => String((window.__ya.one(t) || {}).textContent || '').trim(), [box], { timeout: 4000 }).catch(() => {})
      await sleep(300)
      for (let i = 0; i < 2; i++) {
        await page.type(box, job.title)
        await sleep(200)
        if (norm(await page.text(box)) === norm(job.title)) return
      }
      throw new StepError(`Không điền được tiêu đề (ô tiêu đề đang là "${String(await page.text(box) || '').slice(0, 60)}").`, page.step)
    })

    // mo ta: giu mo ta mac dinh cua kenh Studio dien san, xuong 2 dong roi them mo ta cua video.
    // job.replaceDescription (co phan mo ta mac dinh trong Cai dat): thay het mo ta Studio dien san bang mo ta da ghep
    const desc = String(job.description || '').trim() ||
      (t.description ? renderComment(t.description, { tieu_de: job.title, link: '', ten_kenh: job.channelName || '' }).trim() : '')
    if (desc) {
      await soft('details', 'Mô tả', async () => {
        const box = inD({ selector: SEL.desc })
        await page.waitFor(box)
        await page.until((t) => String((window.__ya.one(t) || {}).textContent || '').trim(), [box], { timeout: 2500 }).catch(() => {})
        const cur = String((await page.text(box)) || '').replace(/\s+$/, '')
        if (job.replaceDescription) {
          if (norm(cur) === norm(desc)) return log('info', 'Mô tả đã đúng: giữ nguyên.')
          let full = desc
          if (Buffer.byteLength(full) > 5000) {
            full = Buffer.from(full).subarray(0, 5000).toString().replace(/\uFFFD+$/, '')
            warn('Mô tả bị cắt bớt vì dài quá 5000 byte.')
          }
          await page.type(box, full)
          await page.until((t, w) => window.__ya.norm((window.__ya.one(t) || {}).innerText) === w, [box, norm(full)], { what: 'mô tả được thay', timeout: 5000 })
          if (cur.trim()) log('info', 'Đã thay mô tả Studio điền sẵn bằng mô tả của video + phần mô tả mặc định (Cài đặt).')
          return
        }
        if (norm(cur).includes(norm(desc))) return log('info', 'Mô tả đã có nội dung của video: giữ nguyên.')
        let add = cur.trim() ? `\n\n${desc}` : desc
        const room = 5000 - Buffer.byteLength(cur)
        if (Buffer.byteLength(add) > room) {
          add = Buffer.from(add).subarray(0, Math.max(0, room)).toString().replace(/�+$/, '')
          warn('Mô tả của video bị cắt bớt vì mô tả có sẵn của kênh + mô tả video dài quá 5000 byte.')
        }
        if (!add.trim()) return
        await page.type(box, add, { clear: false, end: true })
        const first = norm(desc.split('\n').find((l) => l.trim()) || '')
        await page.until((t, w) => window.__ya.norm((window.__ya.one(t) || {}).innerText).includes(w), [box, first.slice(0, 80)], { what: 'mô tả được điền', timeout: 5000 })
      })
    }

    if (job.thumbnail) {
      await soft('thumbnail', 'Hình thu nhỏ', async () => {
        const btn = inD(LABELS.thumbUpload)
        const input = { selector: SEL.thumbInput, hidden: true }
        if (!(await page.has(input)) && (!(await page.has(btn)) || !(await isEnabled(page, btn)))) throw new StepError('Không có nút "Tải tệp lên" cho hình thu nhỏ (kênh có thể cần xác minh số điện thoại tại youtube.com/verify để dùng hình thu nhỏ tùy chỉnh).', page.step)
        await chooseFiles(page, { input: SEL.thumbInput, button: btn }, [job.thumbnail])
        const r = await page.until((s) => {
          for (const h of window.__ya.find({ selector: s.thumbHost, hidden: true }, true)) {
            const err = h.querySelector('.error, #error-message, [role=alert]')
            if (err && window.__ya.visible(err) && String(err.innerText || '').trim()) return 'err:' + String(err.innerText).trim()
            if ([...h.querySelectorAll('img')].some((i) => /^(blob|data):/.test(i.getAttribute('src') || ''))) return 'ok'
          }
          return ''
        }, [SEL], { timeout: 20000, what: 'ảnh xem trước của hình thu nhỏ' })
        if (r.startsWith('err:')) throw new StepError(`Studio báo: ${r.slice(4)}`, page.step)
      }, 'Không đặt được hình thu nhỏ')
    }

    // ---- cac muc cua mau: dung chung ham voi trang Chi tiet video (src/flows/optimize.js) ----
    const c = {
      t, title: job.title, videoId: '', channelName: job.channelName || '', video: {}, now: now(), lang: 'vi', log, warn, changed: [],
      playlists: [].concat(job.playlists || []).map((x) => String(x).trim()).filter(Boolean),
      createPlaylist: (name) => createPlaylist(page, name), plWithin: SEL.plDialog,
      // o nhap ngay quay: chi trong lich (o '[role=dialog] input' cua trang Chi tiet se trung o nhap cua hop thoai tai len)
      dateInput: 'ytcp-date-picker #textbox input, ytcp-date-picker input',
      extraTags: [].concat(job.tags || []).map((x) => String(x).replace(/,/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean),
    }
    const field = async (key, uiKey) => {
      let ok = true
      c.soft = async (name, fn) => { if (!(await soft(uiKey, name, fn))) ok = false }
      await FIELDS[key](page, c)
      if (!ok) missed.add(key)
      else if (touches(t, key, c)) applied.add(key)
    }
    if (c.playlists.length || t.playlists.length || t.playlistAuto) await field('playlists', 'playlist')

    await step('details', 'Đối tượng người xem (trẻ em)', async () => {
      const k = inD(job.madeForKids ? LABELS.kidsYes : LABELS.kidsNo)
      try {
        await pickRadio(page, k)
      } catch (e) {
        throw new StepError(`Không chọn được mục "${k.text}" (bắt buộc): ${e.message}`, page.step)
      }
    })

    // ---- Hien them -> cac muc nang cao theo mau ----
    const more = await soft('more', 'Hiện thêm', () => openMore(page))
    if (more) {
      c.lang = (await page.has(inD(O.english))) ? 'en' : 'vi'
      if (c.lang === 'en') log('info', 'YouTube Studio của tài khoản này đang dùng tiếng Anh.')
    }
    // ngay quay "ngay dang": video chua dang -> ngay len lich (khong co thi hom nay)
    const at = job.publishAt ? scheduleTime(job.publishAt, (l, m) => warn(m)) : null
    if (t.recordingDate === 'publish') { const d = at || now(); c.recDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
    for (const key of DIALOG_FIELDS) {
      if (key === 'notify') {
        if (job.notifySubscribers === false) {
          const ok = more && (await soft('more', 'Thông báo cho người đăng ký', () => setCheckbox(page, inD(LABELS.notify), false)))
          if (!ok) { missed.add('notify'); warn('Chưa tắt được "thông báo đến người đăng ký": YouTube sẽ thông báo video này.') }
        }
        continue
      }
      if (more) await field(key, 'more')
      else if (touches(t, key, c)) missed.add(key)
    }
    if (!more && [...missed].length) warn('Chưa đặt được các mục nâng cao (không mở được "Hiện thêm"): tool sẽ đặt lại trong Studio sau khi đăng.')

    // ---- 4. Tiep qua cac buoc toi Che do hien thi (phu de + man hinh ket thuc o "Cac thanh phan cua video") ----
    const subs = (job.subtitles || []).filter((s) => s && s.file)
    let elementsDone = false
    const atElements = async () => {
      if (elementsDone || !(await page.has(inD({ selector: SEL.elements })))) return
      elementsDone = true
      if (subs.length) {
        const [first, ...rest] = subs
        const ok = await soft('subtitles', `Phụ đề ${path.basename(first.file)}`, () => addSubtitles(page, first.file), `Chưa thêm phụ đề ${path.basename(first.file)}`)
        if (!ok) await closeExtraDialogs(page)
        for (const s of rest) warn(`Chưa thêm phụ đề ${path.basename(s.file)}: hộp thoại tải lên chỉ thêm một phụ đề. Thêm ở Studio → Phụ đề.`)
      }
      if (t.endScreen === 'latest') {
        c.openEndScreen = () => openEndScreen(page)
        await field('endScreen', 'endscreen')
        await closeExtraDialogs(page)
      }
    }
    await step('visibility', 'Tới bước Chế độ hiển thị', async () => {
      const vis = inD({ selector: SEL.vis })
      for (let i = 0; i < 8 && !(await page.has(vis)); i++) {
        await atElements()
        const before = await stepPrint(page)
        const next = inD(LABELS.next)
        await page.waitFor(next)
        const enabled = await poll(page, () => isEnabled(page, next), 90000, 500)
        if (!enabled) throw new StepError(`Nút "Tiếp" bị khóa ở bước "${(await stepName(page)) || before || '?'}"${progressText ? ` (${progressText})` : ''}.`, page.step)
        await page.click(next)
        const moved = await poll(page, async () => (await page.has(vis)) || (await stepPrint(page)) !== before, 15000)
        if (!moved) throw new StepError(`Bấm "Tiếp" nhưng hộp thoại không sang bước sau (đang ở "${(await stepName(page)) || before || '?'}").`, page.step)
      }
      if (!(await page.has(vis))) throw new StepError('Không tới được bước "Chế độ hiển thị".', page.step)
    })
    if (!elementsDone) {
      if (subs.length) warn(`Chưa thêm phụ đề ${subs.map((s) => path.basename(s.file)).join(', ')}: không thấy bước "Các thành phần của video".`)
      if (t.endScreen === 'latest') missed.add('endScreen')
    }

    // ---- 5. che do hien thi / len lich ----
    // o Cong chieu: muon bat ma khong co o -> chi canh bao (khong bam Esc: co the dong hop thoai tai len); co o -> dat theo job
    const premiereBox = async (label, want, key) => {
      const box = inD(label)
      const has = await poll(page, () => page.has(box), want ? 4000 : 300)
      if (!has) {
        if (want) warn(`Chưa đặt được "${label.text}": không thấy ô này (kênh có thể chưa dùng được tính năng Công chiếu).`)
        return false
      }
      const ok = await soft(key, label.text, () => setCheckbox(page, box, want), `Chưa ${want ? 'đặt' : 'bỏ'} được "${label.text}"`)
      return want && ok
    }
    let premiere = false
    if (at) {
      await step('schedule', `Lên lịch ${at.toLocaleString('vi-VN')}`, () => setSchedule(page, at))
      // "Dat lam video Cong chieu" trong khung Len lich
      premiere = await premiereBox(LABELS.schedulePremiere, !!job.schedulePremiere, 'schedule')
      // doc lai ngay gio dang hien truoc khi bam Len lich: sai thi bao loi, khong luu
      await step('schedule', 'Kiểm tra ngày giờ lên lịch', () => checkSchedule(page, at))
    } else {
      const lab = { public: LABELS.public, unlisted: LABELS.unlisted, private: LABELS.private }[job.privacy] || LABELS.private
      await step('visibility', `Chế độ hiển thị: ${lab.text}`, async () => {
        try { await pickRadio(page, inD(lab)) } catch (e) { throw new StepError(`Không chọn được chế độ hiển thị "${lab.text}": ${e.message}`, page.step) }
      })
      // "Dat o che do Cong chieu ngay" (chi co duoi Cong khai)
      if (job.premiere && job.privacy !== 'public') warn(`Bỏ qua "${LABELS.instantPremiere.text}": chỉ dùng được với chế độ Công khai.`)
      else if (job.privacy === 'public') premiere = await premiereBox(LABELS.instantPremiere, !!job.premiere, 'visibility')
    }

    // ---- 6. cho tai len 100% (Studio cho bam Luu som, nhung dong hop thoai khi dang tai thi kho theo doi) ----
    await step('wait', 'Chờ tải video lên xong', async () => {
      const limit = Date.now() + 15 * 60e3 + Math.ceil(size / (200 * 1024)) * 1000
      let last = -1
      let lastChange = Date.now()
      let noLabelSince = 0
      for (;;) {
        const label = await readProgress(page)
        const err = await readError(page)
        if (err) throw new StepError(`YouTube báo: ${err}`, page.step)
        const p = uploadPhase(label)
        if (p.phase === 'error') throw new StepError(`YouTube báo: ${p.text}`, page.step)
        if (p.phase === 'uploaded') { reached = true; break }
        if (!label) {
          noLabelSince = noLabelSince || Date.now()
          if (Date.now() - noLabelSince > 8000) { log('warn', 'Không đọc được tiến độ tải lên trong hộp thoại: bấm Lưu rồi theo dõi tiến độ ở trang.'); break }
        } else noLabelSince = 0
        if (p.pct !== null && p.pct !== last) { last = p.pct; lastChange = Date.now() }
        if (Date.now() - lastChange > 10 * 60e3) throw new StepError(`Tải lên đứng yên quá 10 phút ở ${last}%.`, page.step)
        if (Date.now() > limit) throw new StepError(`Tải lên quá lâu (đang ${last}%).`, page.step)
        await sleep(1000)
      }
      if (reached) report(100)
    })

    // ---- 7. ma video, Luu -> "Van xuat ban" ----
    let id = await poll(page, () => readId(page), 10000)
    await step('publish', 'Bấm Lưu', async () => {
      const done = inD(LABELS.done)
      await page.waitFor(done)
      if (!(await poll(page, () => isEnabled(page, done), 60000, 500))) throw new StepError(`Nút "${(await page.text(done)) || 'Lưu'}" bị khóa.`, page.step)
      await page.click(done)
      let anyway = false
      const btn = { ...LABELS.publishAnyway, selector: 'button, ytcp-button, [role=button]' }
      const r = await poll(page, async () => {
        if (!anyway && (await page.has(btn))) {
          anyway = true
          log('info', 'Studio vẫn đang kiểm tra video: bấm "Vẫn xuất bản".')
          await page.click(btn)
          return null
        }
        if (await page.has({ selector: SEL.share })) return 'share'
        return (await page.has(inD({ selector: '#done-button' }))) ? null : 'closed'
      }, 60000)
      if (!r) throw new StepError('Đã bấm Lưu nhưng hộp thoại tải lên không đóng.', page.step)
      if (!id) id = await poll(page, () => readId(page), 5000)
      // hop thoai chia se ("Da xuat ban video") hien ngay sau khi hop thoai tai len dong: dong lai
      if (r === 'share' || (await poll(page, () => page.has({ selector: SEL.share }), 3000))) {
        await sleep(300)
        if (await page.has(LABELS.shareClose)) await page.click(LABELS.shareClose).catch(() => {})
      }
    })
    if (!id) throw new StepError('Đã lưu nhưng không đọc được mã video. Hãy xem trang Nội dung của kênh trước khi đăng lại.', 'Đọc mã video')

    // ---- 8. hop thoai da dong ma video con dang tai: giu trang toi khi tai xong (dong / chuyen trang la mat video) ----
    if (!reached) {
      await step('wait', 'Chờ tải video lên xong (sau khi lưu)', async () => {
        const limit = Date.now() + 30 * 60e3 + Math.ceil(size / (200 * 1024)) * 1000
        let seen = false
        for (;;) {
          const label = await readLabel(page, SEL.progressOut)
          const p = uploadPhase(label)
          if (p.phase === 'error') throw new StepError(`YouTube báo: ${p.text}`, page.step)
          if (p.phase === 'uploading') { seen = true; report(p.pct) }
          if (p.phase === 'uploaded') break
          if (!label && (seen || Date.now() > limit - 30 * 60e3 + 20000)) break // het o tien do (hoac khong co trong 20 giay dau) = xong
          if (Date.now() > limit) throw new StepError(`Tải lên quá lâu (đang ${lastPct}%). Đừng tắt tool khi video đang tải lên.`, page.step)
          await sleep(1000)
        }
        report(100)
      })
    }
    const visibility = at ? 'schedule' : ({ public: 'public', unlisted: 'unlisted' }[job.privacy] || 'private')
    return { id, url: `https://youtu.be/${id}`, warnings, missed: [...missed], applied: [...applied], schedule: at ? at.toISOString() : null, visibility, premiere }
  } catch (e) {
    if (!(e instanceof StepError)) throw e
    await shot((e.step || 'loi').replace(/[^\p{L}\w]+/gu, '-').slice(0, 40))
    if (chosen && !e.noDraft && !/trước khi đăng lại/.test(e.message)) e.message += ' (Video có thể đã nằm trong Studio dạng bản nháp: xem trang Nội dung trước khi đăng lại.)'
    throw e
  } finally {
    stopProgress = true
    await ticker.catch(() => {})
  }
}

// Muc `key` cua mau co can dung toi khong (khi khong mo duoc "Hien them" -> tinh la chua dat)
function touches(t, key, c = {}) {
  if (key === 'playlists') return t.playlists.length > 0 || t.playlistAuto > 0 || (c.playlists || []).length > 0
  if (key === 'tags') return t.tagsMode !== 'keep' || t.extraTags.length > 0 || (c.extraTags || []).length > 0
  if (key === 'location' || key === 'language') return !!t[key]
  return t[key] !== undefined && t[key] !== 'keep'
}

// Buoc "Cac thanh phan cua video" -> dong "Man hinh ket thuc" -> [Them] -> cho trinh chinh mo
async function openEndScreen(page) {
  const add = inD(LABELS.endScreenAdd)
  if (await page.has({ selector: LABELS.endScreenAdd.any })) await page.click({ selector: LABELS.endScreenAdd.any })
  else {
    await markSection(page, inD(LABELS.endScreenRow), 'upes', 'ytcp-button, button')
    await page.click({ ...add, any: undefined, selector: 'ytcp-button, button', within: sec('upes') })
  }
  await page.waitFor({ selector: SEL.esDialog }, { timeout: Math.max(page.timeout, 20000) })
}

// ---- danh sach phat ----
// Tao danh sach phat moi ngay trong hop thoai chon danh sach phat (cau truc doan theo Studio, chua co HTML that)
async function createPlaylist(page, name) {
  await page.click({ ...LABELS.plNew, within: SEL.plDialog })
  await sleep(300)
  const item = { ...LABELS.plNewItem, selector: 'tp-yt-paper-item, [role=menuitem], [role=option]' }
  if (await page.has(item)) await page.click(item)
  await page.type({ selector: SEL.plTitle }, name)
  await page.click({ ...LABELS.plCreate, selector: 'ytcp-button, button' })
  await page.until((b, want) => window.__ya.find(b, true).some((cb) => {
    const it = cb.closest('li, [role=listitem], ytcp-ve') || cb.parentElement
    const lab = it.querySelector('.label-text, .checkbox-label, #checkbox-label')
    return window.__ya.norm(cb.getAttribute('aria-label') || (lab ? lab.innerText : it.innerText)) === want
  }), [{ selector: SEL.plBox, within: SEL.plDialog }, norm(name)], { what: `danh sách phát mới "${name}"`, timeout: 15000 })
}

// ---- phu de (buoc Cac thanh phan cua video -> Them phu de -> Tai tep len -> Co thoi gian -> Tiep tuc -> file -> Xong) ----
async function addSubtitles(page, file) {
  await page.click(inD(LABELS.subsAdd))
  await page.click({ ...LABELS.subsUpload, selector: 'ytcp-button, button, tp-yt-paper-item, [role=button], [role=menuitem]' })
  const timing = { ...LABELS.subsTiming, selector: 'tp-yt-paper-radio-button, [role=radio]' }
  if (await poll(page, () => page.has(timing), 3000)) await pickRadio(page, timing)
  // "Tiep tuc" mo hop thoai chon file cua he dieu hanh: chan qua CDP va dat file
  try {
    await chooseFiles(page, { button: { ...LABELS.subsContinue, selector: 'ytcp-button, button' } }, [file])
  } catch (e) {
    const input = { selector: SEL.subsDialog.split(', ').map((s) => `${s} input[type=file]`).join(', '), hidden: true }
    if (!(await page.has(input))) throw e
    await page.setFiles(input, [file])
  }
  const done = { ...LABELS.subsDone, selector: 'ytcp-button, button', within: { selector: SEL.subsDialog, hidden: true } }
  await page.waitFor(done, { timeout: 20000 })
  await poll(page, () => isEnabled(page, done), 15000, 300)
  await page.click(done)
  await page.waitGone({ selector: SEL.subsDialog }, { timeout: 15000 })
}

// Dong hop thoai phu (phu de...) con mo sau khi loi, de nut "Tiep" cua hop thoai tai len bam duoc
async function closeExtraDialogs(page) {
  for (let i = 0; i < 3; i++) {
    if (!(await page.has({ selector: SEL.subsDialog }).catch(() => false))) return
    const cancel = { ...LABELS.cancel, selector: 'ytcp-button, button', within: { selector: SEL.subsDialog, hidden: true } }
    if (await page.has(cancel)) await page.click(cancel).catch(() => {})
    else await page.press('Escape').catch(() => {})
    await sleep(500)
  }
}

// ---- len lich: "Len lich" (#second-container, nut mui ten) -> "Dat lich chuyen sang che do cong khai":
//      ngay (o ngay "30 thg 10, 2026" | "Oct 30, 2026" -> lich ytcp-date-picker) + gio (o gio "09:00" | "9:00 AM", danh sach moc 15 phut).
//      Gio theo mui gio dang dat trong Studio (nut "Mui gio": tool khong doi). ----
const reEsc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Cac dong chu co so cua o ngay (gia tri dang chon)
async function dateLines(page) {
  const info = await triggerInfo(page, inD(LABELS.dateTrigger)).catch(() => null)
  return info ? info.lines.filter((l) => /\d/.test(l)) : []
}
// O ngay dang hien dung ngay `at` (so theo dung kieu chu dang hien)
const dateIs = async (page, at) => (await dateLines(page)).some((l) => norm(l) === norm(dateText(at, l)))
const timeValue = async (page) => {
  const tIn = inD({ selector: SEL.timeInput })
  if (await page.has(tIn)) return String((await page.value(tIn)) || '').trim()
  const info = await triggerInfo(page, inD({ selector: SEL.timeTrigger })).catch(() => null)
  return info ? (info.lines.find((l) => /\d/.test(l)) || '') : ''
}
const normT = (s) => norm(s).replace(/^0(\d:)/, '$1') // "09:00" = "9:00"
const timeIs = async (page, at) => { const v = await timeValue(page); return !!v && normT(v) === normT(timeText(at, v)) }

async function setSchedule(page, at) {
  const radio = inD(LABELS.scheduleRadio)
  const trig = inD(LABELS.dateTrigger)
  if (!(await page.has(trig))) {
    if (await page.has(inD(LABELS.scheduleOpen))) await page.click(inD(LABELS.scheduleOpen))
    else if (await page.has(radio)) await page.click(radio)
    else throw new StepError('Không thấy mục "Lên lịch".', page.step)
  }
  await page.waitFor(trig, { timeout: 8000 })
  if ((await page.has(radio)) && !(await isChecked(page, radio, OS.radio))) await page.click(radio)
  await setScheduleDate(page, at)
  await setScheduleTime(page, at)
}

// Ngay: bam o ngay -> go vao o nhap o dau lich theo kieu dang hien -> Enter; khong nhan thi bam o ngay trong lich
async function setScheduleDate(page, at) {
  if (await dateIs(page, at)) return
  const sample = (await dateLines(page))[0] || ''
  const want = dateText(at, sample || 'thg')
  const input = { selector: SEL.dateInput }
  const open = async () => {
    if (await page.has(input)) return
    await page.click(inD(LABELS.dateTrigger))
    await page.waitFor(input, { timeout: 8000 })
  }
  await open()
  const cur = String((await page.value(input)) || '')
  await page.type(input, dateText(at, /\d/.test(cur) ? cur : sample || 'thg'))
  await page.press('Enter')
  let ok = await poll(page, () => dateIs(page, at), 1500)
  if (!ok && (await page.has(input))) {
    await page.eval((s) => { const f = window.__ya.one({ selector: s + ' form', hidden: true }); if (f && f.requestSubmit) f.requestSubmit() }, 'ytcp-date-picker')
    ok = await poll(page, () => dateIs(page, at), 2000)
  }
  if (!ok) {
    await open()
    if (await pickScheduleDay(page, at)) ok = await poll(page, () => dateIs(page, at), 3000)
  }
  if (!ok) {
    if (await page.has(input)) await page.press('Escape')
    throw new StepError(`Không đặt được ngày lên lịch ${want} (ô ngày đang là "${(await dateLines(page))[0] || ''}").`, page.step)
  }
}

// Lich cua Studio: cac thang [role=listitem][aria-label="thg 10 2026" | "Oct 2026"] > .calendar-day (ngay da qua bi khoa);
// lui / toi bang #prev-month / #next-month toi khi thay thang can tim. true neu da bam dung ngay.
async function pickScheduleDay(page, date) {
  const ym = date.getFullYear() * 12 + date.getMonth()
  for (let i = 0; i < 36; i++) {
    const r = await page.eval((s, ym, day) => {
      const ya = window.__ya
      const EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      const parse = (l) => {
        l = ya.norm(l)
        const e = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(l)
        if (e && EN.includes(e[1])) return +e[2] * 12 + EN.indexOf(e[1])
        const m = /(\d{1,2})\D+(\d{4})/.exec(l) // "thg 10 2026", "tháng 10 năm 2026"
        return m ? +m[2] * 12 + (+m[1] - 1) : null
      }
      const seen = []
      for (const m of ya.find({ selector: s.calMonth, hidden: true }, true)) {
        const v = parse(m.getAttribute('aria-label') || '')
        if (v === null) continue
        seen.push(v)
        if (v !== ym) continue
        m.scrollIntoView({ block: 'center' })
        const d = [...m.querySelectorAll('.calendar-day')].find((x) => !x.classList.contains('invisible') && ya.norm(x.textContent) === String(day))
        if (!d) return { err: 'không thấy ngày' }
        if (d.classList.contains('disabled') || d.hasAttribute('disabled') || d.getAttribute('aria-disabled') === 'true') return { err: 'ngày bị khóa' }
        for (const x of document.querySelectorAll('[data-ya-day]')) x.removeAttribute('data-ya-day')
        d.setAttribute('data-ya-day', '1')
        return { ok: true }
      }
      // lich that con giu 1 thang gia "Jan 1900": bo qua
      const real = seen.filter((v) => v > 1970 * 12)
      return { dir: real.length ? (Math.min(...real) > ym ? 'prev' : 'next') : '' }
    }, SEL, ym, date.getDate())
    if (r.ok) { await page.click({ selector: '[data-ya-day="1"]' }); return true }
    if (r.err || !r.dir) return false
    await page.click({ selector: r.dir === 'prev' ? SEL.calPrev : SEL.calNext })
  }
  return false
}

// Gio: go vao o gio roi bam dung moc trong danh sach (hoac Enter); khong nhan thi mo danh sach va bam
async function setScheduleTime(page, at) {
  const tIn = inD({ selector: SEL.timeInput })
  const tTrig = inD({ selector: SEL.timeTrigger })
  if (await page.has(tIn)) {
    if (await timeIs(page, at)) return
    const want = timeText(at, await timeValue(page))
    const choice = { regex: `^0?${reEsc(normT(want))}$`, selector: SEL.option, within: { selector: SEL.listbox } }
    await page.type(tIn, want)
    if (await poll(page, () => page.has(choice), 1000)) await page.click(choice)
    else await page.press('Enter')
    let ok = await poll(page, () => timeIs(page, at), 2000)
    if (!ok) {
      await page.click(tIn)
      if (await poll(page, () => page.has(choice), 2500)) { await page.click(choice); ok = await poll(page, () => timeIs(page, at), 2000) }
    }
    if (!ok) throw new StepError(`Không đặt được giờ lên lịch ${want} (ô giờ đang là "${await timeValue(page)}").`, page.step)
  } else if (await page.has(tTrig)) {
    const want = timeText(at, await timeValue(page))
    if (!(await timeIs(page, at))) await pickOption(page, tTrig, [want])
  } else throw new StepError('Không thấy ô giờ lên lịch.', page.step)
}

// Doc lai o ngay + o gio sau khi dat xong (truoc khi bam Len lich)
async function checkSchedule(page, at) {
  const d = (await dateLines(page))[0] || ''
  const tm = await timeValue(page)
  if (!(await dateIs(page, at)) || !(await timeIs(page, at))) {
    throw new StepError(`Ngày giờ lên lịch đang hiện "${d} ${tm}", không phải ${dateText(at, d || 'thg')} ${timeText(at, tm)}.`, page.step)
  }
  return { date: d, time: tm }
}

module.exports = { LABELS, SEL, uploadVideo, uploadPhase, ID_RE, DIALOG_FIELDS, _t: { setSchedule, checkSchedule, pickScheduleDay, findBlocker, addSubtitles, readId, openEndScreen, touches } }
