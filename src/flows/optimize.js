// Toi uu video da dang (theo video quay "toi uu video - mau mac dinh"):
//   listVideos     Studio "Noi dung cua kenh" -> tab Video: doc cac hang
//   optimizeVideo  /video/<id>/edit: danh sach phat, Hien them, quang cao tra tien, AI, the, ngon ngu,
//                  ngay quay, vi tri, giay phep, nhung, phoi lai Shorts, danh muc, binh luan,
//                  man hinh ket thuc (luu rieng) -> Luu -> "Da luu thay doi"
//   inspectVideo   /video/<id>/edit: CHI DOC gia tri hien tai, so voi mau -> muc nao con thieu (khong bam Luu)
//   commentAndPin  trang xem video: Thich, binh luan, ⋮ -> Ghim -> Ghim; tai lai trang de kiem lai tung viec
// Ham thuan tren mot Page da o dung kenh (ctx.withChannel lo chuyen kenh). Muc mau = 'keep' -> bo qua.
const { StepError, channelOf, sleep } = require('../studio/driver')
const { normalizeTemplate, tagsToAdd, fmtStudioDate, recordingDateFor, renderComment, compareFields, optionNames, calendarMonthLabels, parseMonthLabel, touchedFields } = require('../optimize-template')

// Chu tren man hinh (Studio tieng Viet + tieng Anh). Sua o day khi co HTML that.
// any: bo chon theo ma co dinh cua Studio (id, name cua o chon...) lay tu HTML that - giong nhau o moi ngon ngu,
// driver tim theo `any` truoc, khong thay moi tim theo chu.
const L = (text, regex, any) => (any ? { text, regex, any } : { text, regex })
const LABELS = {
  content: L('Nội dung của kênh', '^(nội dung của kênh|channel content)$'),
  noContent: L('Không có nội dung nào', '^(không có nội dung nào|no content available)'),
  // trang Noi dung kieu moi (tong quan: hang Video, Danh sach phat...): phai bam "Xem tat ca" o hang Video
  seeAll: L('Xem tất cả', '^(xem tất cả|see all|view all)$'),
  videoShelf: L('Video', '^(video|videos)$'),
  // Studio dang dung tieng Anh (nhan dien qua nut Show more / Show less cua trang Chi tiet): ngay viet kieu "Oct 27, 2026"
  english: L('Show more', '^(show more|show less)$'),
  details: L('Chi tiết video', '^(chi tiết video|video details)$', 'ytcp-video-details-section#edit h1.page-title'),
  playlists: L('Danh sách phát', '^(danh sách phát|playlists?)$', 'ytcp-video-metadata-playlists'),
  done: L('Xong', '^(xong|done)$', 'ytcp-button.done-button'),
  showMore: L('Hiện thêm', '^(hiện thêm|show more|hiện chế độ cài đặt nâng cao)$'), // ytcp-button#toggle-button
  showLess: L('Ẩn bớt', '^(ẩn bớt|show less|ẩn chế độ cài đặt nâng cao)$'),
  paid: L('Nội dung được trả tiền để quảng cáo', '^(nội dung được trả tiền để quảng cáo|paid promotion)$', '#paid-promotion .section-label, ytcp-paid-product-placement-select .section-label'),
  paidYes: L('Có, video của tôi có chứa nội dung được trả tiền để quảng cáo', '^(có, video của tôi có chứa nội dung được trả tiền để quảng cáo|yes, my video contains paid promotion.*)$', 'tp-yt-paper-radio-button[name="VIDEO_PAID_PRODUCT_PLACEMENT_NOTIFY"]'),
  paidNo: L('Không, video của tôi không chứa nội dung được trả tiền để quảng cáo', '^(không, video của tôi không chứa nội dung được trả tiền để quảng cáo|no, my video does not contain paid promotion.*)$', 'tp-yt-paper-radio-button[name="VIDEO_PAID_PRODUCT_PLACEMENT_NO"]'),
  ai: L('Sử dụng AI', '^(sử dụng ai|altered content|altered or synthetic content|ai usage)$', '#altered-content > .section-label-with-description'),
  aiYes: L('Có', '^(có|yes)$', 'tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]'),
  aiNo: L('Không', '^(không|no)$', 'tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_NO"]'),
  yes: L('Có', '^(có|yes)$'),
  no: L('Không', '^(không|no)$'),
  videoLanguage: L('Ngôn ngữ video', '^(ngôn ngữ video|video language)$', 'ytcp-form-language-input#language-input ytcp-dropdown-trigger'),
  titleLanguage: L('Ngôn ngữ của tiêu đề và nội dung mô tả', '^(ngôn ngữ của tiêu đề và nội dung mô tả|title and description language)$', 'ytcp-form-language-input:not(#language-input) ytcp-dropdown-trigger'),
  recDate: L('Ngày quay', '^(ngày quay|recording date)$', 'ytcp-text-dropdown-trigger#recorded-date ytcp-dropdown-trigger'),
  noDate: L('Không chọn', '^(không chọn|none)$'), // o ngay quay chua dat
  noPlaylist: L('Chọn', '^(chọn|select)$'), // o danh sach phat chua chon
  plCount: L('2 danh sách phát', '^(\\d+) (danh sách phát|playlists)$'),
  location: L('Vị trí video', '^(vị trí video|video location)$', 'ytcp-form-location#location .label-text'),
  license: L('Giấy phép', '^(giấy phép|license)$', 'ytcp-form-select#license ytcp-dropdown-trigger'),
  embed: L('Cho phép nhúng', '^(cho phép nhúng|allow embedding)$', 'ytcp-form-checkbox#allow-embed #checkbox'),
  remix: L('Phối lại cho Shorts', '^(phối lại cho shorts|shorts remixing|remixing)$', '#content-remixing-container > .section-label-with-description'),
  remixAll: L('Cho phép phối lại video và âm thanh', '^(cho phép phối lại video và âm thanh|allow video and audio remixing)$', 'tp-yt-paper-radio-button[name="REMIX_SOURCE_OPTION_OPT_IN"]'),
  remixAudio: L('Chỉ cho phép phối lại âm thanh', '^(chỉ cho phép phối lại âm thanh|allow only audio remixing)$', 'tp-yt-paper-radio-button[name="REMIX_SOURCE_OPTION_VISUAL_OPT_OUT_AND_PERFORM_ACTIONS"]'),
  remixNone: L('Không cho phép phối lại', '^(không cho phép phối lại|don.t allow remixing)$', 'tp-yt-paper-radio-button[name="REMIX_SOURCE_OPTION_OPT_OUT_AND_MUTE_DERIVATIVES"]'),
  category: L('Danh mục', '^(danh mục|category)$', 'ytcp-form-select#category ytcp-dropdown-trigger'),
  commentsSection: L('Bình luận và mức phân loại', '^(bình luận và mức phân loại|comments and ratings)$', 'ytcp-comment-moderation-settings ytcp-select#enablement-state-select ytcp-dropdown-trigger'),
  comments: L('Bình luận', '^(bình luận|comments)$', 'ytcp-select#enablement-state-select ytcp-dropdown-trigger'),
  endScreen: L('Màn hình kết thúc', '^(màn hình kết thúc|end screen)$', '#endscreen-editor-link'),
  // hop thoai trinh chinh man hinh ket thuc (dlg: nhan ra hop thoai khong can chu)
  esEditor: { ...L('Màn hình kết thúc', '^(màn hình kết thúc|end screen)$'), dlg: 'tp-yt-paper-dialog:has(#video-editor-modal-host-title), tp-yt-paper-dialog:has(ytve-editor)' },
  esElements: L('Thành phần', '(^|\\s)(thành phần|element)$', 'ytcp-button#add-element-menu-button'),
  esLatest: L('Lấy màn hình kết thúc của video gần đây nhất', '^(lấy màn hình kết thúc của video gần đây nhất|import from latest video|use end screen from latest video)$'),
  esCancel: L('Hủy thay đổi', '^(hủy thay đổi|huỷ thay đổi|discard changes)$', 'ytcp-button#discard-button'),
  save: L('Lưu', '^(lưu|save)$', 'ytcp-button#save, ytcp-button#save-button'),
  saved: L('Đã lưu thay đổi', '^(đã lưu thay đổi|changes saved)$'),
  // nut Thich that: like-button-view-model button[aria-label="cùng 49 người khác thích video này"]
  // nguoi xem: like-button-view-model "cùng 49 người khác thích video này"; chu kenh xem video cua minh: 1 nut "Thích" / "Bỏ thích"
  like: L('Thích video này', '^(?!không |dislike|i dislike)(.*thích video này.*|.*like this video.*|thích|bỏ thích|like|unlike)$'),
  addComment: L('Thêm bình luận...', '^(thêm bình luận|add a comment)', 'ytd-comment-simplebox-renderer #placeholder-area #simplebox-placeholder'), // that: "Thêm bình luận..." (3 dau cham)
  submitComment: L('Bình luận', '^(bình luận|comment)$', 'ytd-button-renderer#submit-button button'),
  commentMenu: L('Tác vụ', '^(tác vụ|menu tác vụ|action menu)$', '#action-menu button'),
  pin: L('Ghim', '^(ghim|pin)$'),
  pinDialog: { ...L('Ghim bình luận này?', '^(ghim bình luận này\\?|pin this comment\\?)$'), dlg: 'tp-yt-paper-dialog:has(yt-confirm-dialog-renderer)' },
  pinConfirm: L('Ghim', '^(ghim|pin)$', 'yt-button-renderer#confirm-button button'),
  pinned: L('Đã ghim bình luận', '^(đã ghim bình luận|comment pinned)$'),
  // Google bat xac minh danh tinh tren Studio (that: ytcp-auth-confirmation-dialog, nut "Tìm hiểu thêm" / "Tiếp theo")
  verify: L('Xác minh danh tính của bạn', '^(xác minh danh tính của bạn|verify it.s you|verify your identity|confirm it.s you)$'),
}

// Phan tu Studio/YouTube (ten the that + phan tu trong trang gia).
const SEL = {
  row: 'ytcp-video-row',
  rowTitle: '#video-title',
  vis: '.tablecell-visibility',
  date: '.tablecell-date',
  views: '.tablecell-views:not(.vidiq-scope)', // vidIQ chen them mot o .tablecell-views
  comments: '.tablecell-comments',
  next: 'ytcp-icon-button#navigate-after, [aria-label="Chuyển đến trang tiếp theo"], [aria-label="Next page"]',
  title: '#title-textarea #textbox',
  desc: '#description-textarea #textbox',
  trigger: '[aria-haspopup], ytcp-dropdown-trigger',
  radio: '[role=radio], tp-yt-paper-radio-button',
  // khong de the long nhau (vd ytcp-playlist-dialog > tp-yt-paper-dialog): moi o se bi dem 2 lan khi dung `within`
  dialogs: 'tp-yt-paper-dialog, [role=dialog]',
  plBox: '#checkbox[role=checkbox], [role=checkbox]', // ytcp-checkbox-lit > #checkbox; aria-label rong, ten o span.label-text
  likeButton: 'like-button-view-model button, #top-level-buttons-computed ytd-toggle-button-renderer button',
  submit: '#submit-button button, button#submit-button',
  listbox: '[role=listbox], tp-yt-paper-listbox',
  option: '[role=option], tp-yt-paper-item',
  chip: '#tags-container #chip-text, ytcp-chip #chip-text',
  tagInput: '#tags-container input, ytcp-form-input-container#tags-container input',
  toggle: 'ytcp-button#toggle-button', // nut "Hien them" / "An bot" (cung mot nut)
  advanced: 'ytcp-video-metadata-editor-advanced #category-container, ytcp-video-metadata-editor-advanced #recording-date-location',
  datePicker: 'ytcp-date-picker',
  dateInput: 'ytcp-date-picker #textbox input, ytcp-date-picker input, [role=dialog] input',
  calMonth: '[role=listitem][aria-label]',
  calDay: '.calendar-day',
  calPrev: '#prev-month',
  calNext: '#next-month',
  thread: 'ytd-comment-thread-renderer',
  content: '#content-text',
  pinnedBadge: '#pinned-comment-badge',
  editor: '#contenteditable-root, [contenteditable=true]',
  menus: 'ytd-menu-popup-renderer, [role=menu]',
  // hop thoai chon danh sach phat cua trang Chi tiet (that: ytcp-playlist-dialog > tp-yt-paper-dialog[aria-label="Chọn danh sách phát" | "Choose playlists"])
  plDialog: 'ytcp-playlist-dialog > tp-yt-paper-dialog',
  // hop thoai chan moi thao tac, tool KHONG tu xu ly: xac minh danh tinh (that: 14-23-02 snapshot) + trinh xac minh tinh nang
  blockers: 'ytcp-auth-confirmation-dialog tp-yt-paper-dialog, yt-trust-tiers-wizard-dialog tp-yt-paper-dialog',
  // video dang tai len / xu ly: "This setting can be changed once your video is processed" thay cho cac nut chon phoi lai
  remixLocked: '#content-remixing-unavailable-msg',
  // trinh chinh man hinh ket thuc: video DA co man hinh ket thuc thi co cac thanh phan (that/man-hinh-ket-thuc.html)
  // thanh phan da co: dong trong khung tuy chon, o tren khung xem truoc, nhan tren dong thoi gian ("Đăng ký: Ten kenh", "Video: ...")
  esItems: 'ytve-options-panel-entity-item, ytve-endscreen-editor-preview-overlay-item, ytve-endscreen-marker[aria-label]:not([aria-label=""])',
  esLink: 'ytcp-text-dropdown-trigger#endscreen-editor-link',
}
const sec = (name) => `[data-ya-sec="${name}"]`
const norm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

// Danh dau khoi chua tieu de `label`: di len tu tieu de toi cha dau tien co phan tu `has`.
async function markSection(page, label, name, has, opts = {}) {
  return page.until((t, name, has) => {
    for (const el of document.querySelectorAll(`[data-ya-sec="${name}"]`)) el.removeAttribute('data-ya-sec')
    for (const h of window.__ya.find(t, true)) {
      let el = h.parentElement
      while (el && el !== document.body && !el.querySelector(has)) el = el.parentElement
      if (el && el !== document.body) { el.setAttribute('data-ya-sec', name); return true }
    }
    return false
  }, [label, name, has], { what: `mục "${label.text}"`, ...opts })
}

// Danh dau hop thoai (hien) co dong chu khop `label`.
async function markDialog(page, label, name, opts = {}) {
  return page.until((t, name, sel) => {
    for (const el of document.querySelectorAll(`[data-ya-sec="${name}"]`)) el.removeAttribute('data-ya-sec')
    const re = new RegExp(t.regex, 'i')
    const d = (t.dlg && window.__ya.find({ selector: t.dlg }, true)[0]) ||
      window.__ya.find({ selector: sel }, true).find((x) => String(x.innerText || '').split('\n').some((l) => re.test(window.__ya.norm(l))))
    if (!d) return false
    d.setAttribute('data-ya-sec', name)
    return true
  }, [label, name, SEL.dialogs], { what: `hộp thoại "${label.text}"`, ...opts })
}

// Trang thai cua o chon (radio/checkbox) chua phan tu t: true | false
const isChecked = (page, t, role) => page.eval((t, role) => {
  const el = window.__ya.one(t)
  const r = el && (el.closest(role) || el)
  return !!r && (r.getAttribute('aria-checked') === 'true' || r.checked === true)
}, t, role)

const isEnabled = (page, t) => page.eval((t) => {
  const el = window.__ya.one(t)
  if (!el) return false
  const b = el.closest('button, [role=button], ytcp-button, [aria-disabled]') || el
  return b.getAttribute('aria-disabled') !== 'true' && !b.hasAttribute('disabled') && !el.closest('[aria-disabled="true"]')
}, t)

// Chon radio (neu chua chon). Tra ve true neu co thay doi.
async function pickRadio(page, t) {
  await page.waitFor(t)
  if (await isChecked(page, t, SEL.radio)) return false
  await page.click(t)
  await page.until((t, role) => { const el = window.__ya.one(t); const r = el && (el.closest(role) || el); return r && r.getAttribute('aria-checked') === 'true' }, [t, SEL.radio], { what: `"${t.text}" được chọn` })
  return true
}

// Dat o danh dau (checkbox) theo on. Tra ve true neu co thay doi.
async function setCheckbox(page, t, on) {
  await page.waitFor(t)
  if ((await isChecked(page, t, '[role=checkbox], ytcp-checkbox-lit')) === on) return false
  await page.click(t)
  await page.until((t, on) => { const el = window.__ya.one(t); const r = el && (el.closest('[role=checkbox], ytcp-checkbox-lit') || el); return r && (r.getAttribute('aria-checked') === 'true') === on }, [t, on], { what: `"${t.text}" ${on ? 'được' : 'bỏ'} đánh dấu` })
  return true
}

// Cac dong chu cua o tha xuong chua t (nhan + gia tri dang chon), va o co bi khoa khong.
const triggerInfo = (page, t) => page.eval((t, sel) => {
  const el = window.__ya.one(t)
  if (!el) return null
  const tr = el.closest(sel) || el
  return {
    lines: String(tr.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean),
    disabled: tr.getAttribute('aria-disabled') === 'true' || tr.hasAttribute('disabled'),
  }
}, t, SEL.trigger)

// Lich chon ngay cua Studio: lui / toi tung thang toi khi thay thang can tim ("thg 10 2026" | "Oct 2026") roi bam o ngay.
// true neu da bam.
async function pickCalendarDay(page, date) {
  const want = calendarMonthLabels(date).map(norm)
  const ym = date.getFullYear() * 12 + date.getMonth()
  const months = { selector: SEL.calMonth, within: { selector: SEL.datePicker, hidden: true } }
  for (let i = 0; i < 36; i++) {
    const labels = await page.eval((t) => window.__ya.find(t, true).map((m) => m.getAttribute('aria-label') || ''), months)
    const at = labels.findIndex((l) => want.includes(norm(l)))
    if (at >= 0) {
      const ok = await page.eval((t, at, day) => {
        const m = window.__ya.find(t, true)[at]
        m.scrollIntoView({ block: 'center' })
        const d = [...m.querySelectorAll('.calendar-day')].find((x) => !x.classList.contains('invisible') && window.__ya.norm(x.textContent) === String(day))
        if (d) d.setAttribute('data-ya-day', '1')
        return !!d
      }, months, at, date.getDate())
      if (!ok) return false
      await page.click({ selector: '[data-ya-day="1"]' })
      return true
    }
    // thang dang hien truoc hay sau thang can tim? (lich that con giu 1 thang gia "thg 1 1900": bo qua)
    const seen = labels.map(parseMonthLabel).filter((x) => x && x > 1970 * 12)
    if (!seen.length) return false
    await page.click({ selector: Math.min(...seen) > ym ? SEL.calPrev : SEL.calNext, within: { selector: SEL.datePicker, hidden: true } })
  }
  return false
}

// Chon `option` trong o tha xuong (bam vao t). option: chu hoac danh sach chu (tieng Viet, tieng Anh).
// 'same' | 'changed' | 'locked'
const reEsc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
async function pickOption(page, t, option) {
  const names = (Array.isArray(option) ? option : [option]).filter(Boolean)
  const wants = names.map(norm)
  await page.waitFor(t)
  const info = await triggerInfo(page, t)
  if (info.lines.some((l) => wants.includes(norm(l)))) return 'same'
  if (info.disabled) return 'locked'
  await page.click(t)
  const opt = { text: names[0], regex: `^(${wants.map(reEsc).join('|')})$`, selector: SEL.option, within: SEL.listbox }
  await page.click(opt)
  await page.until((t, sel, wants) => {
    const el = window.__ya.one(t)
    const tr = el && (el.closest(sel) || el)
    return tr && String(tr.innerText || '').split('\n').some((l) => wants.includes(window.__ya.norm(l)))
  }, [t, SEL.trigger, wants], { what: `"${names[0]}" được chọn` })
  return 'changed'
}

// Cac o tich trong hop thoai danh sach phat (theo thu tu hien): [{ name, id, on }].
// Luu y: chi o tich co ten moi la danh sach phat (nut "Danh sach phat moi" khong phai o tich).
const playlistItems = (page, within = SEL.dialogs) => page.eval((b) => window.__ya.find(b, true).map((cb) => {
  const it = cb.closest('li, [role=listitem], ytcp-ve') || cb.parentElement
  const lab = it.querySelector('.label-text, .checkbox-label, #checkbox-label')
  const host = cb.closest('ytcp-checkbox-lit')
  return {
    name: String(cb.getAttribute('aria-label') || (lab ? lab.innerText : it.innerText) || '').replace(/\s+/g, ' ').trim(),
    id: (host && host.getAttribute('test-id')) || '', // ID danh sach phat (PL...)
    on: cb.getAttribute('aria-checked') === 'true',
  }
}), { selector: SEL.plBox, within })

// "Hien them" (mo cac muc nang cao). Co video Studio mo san, co video phai bam; bam bi mat thi bam lai.
// Da mo = cac muc nang cao dang hien (nhan theo id, moi ngon ngu) hoac nut da doi thanh "An bot".
const opened = (page) => page.eval((adv, less) => !!(window.__ya.count({ selector: adv }) || window.__ya.count(less)), SEL.advanced, LABELS.showLess)
async function openMore(page, o = {}) {
  const toggle = { ...LABELS.showMore, any: SEL.toggle }
  await page.until((a, b, adv) => window.__ya.count(a) || window.__ya.count(b) || window.__ya.count({ selector: adv }), [toggle, LABELS.showLess, SEL.advanced], { what: '"Hiện thêm"', ...o })
  for (let i = 0; i < 3 && !(await opened(page)); i++) {
    await page.click(toggle)
    if (await poll(page, () => opened(page), 5000)) break
  }
  if (!(await opened(page))) throw new StepError('Bấm "Hiện thêm" nhưng các mục nâng cao không hiện.', page.step)
}

// ---- hop thoai chan moi thao tac: tool KHONG tu xac minh, dung video va bao nguoi dung tu lam ----
const BLOCKED = {
  verify: 'YouTube Studio đang hiện hộp thoại "Xác minh danh tính của bạn" (Google cần bạn tự xác minh tài khoản). Tool dừng video này và không tự xác minh. Hãy mở trang Tài khoản, chọn tài khoản Google này, làm theo hướng dẫn xác minh trong khung Studio (nút "Tiếp theo"), xong rồi chạy lại.',
  trust: 'YouTube Studio đang hiện hộp thoại xác minh để dùng tính năng của kênh. Tool dừng video này và không tự xác minh. Hãy mở trang Tài khoản, chọn tài khoản Google này, tự xác minh hoặc đóng hộp thoại trong khung Studio, rồi chạy lại.',
}
// 'verify' | 'trust' | '' (hop thoai dang hien)
const blocker = (page) => page.eval((sel, t) => {
  const d = window.__ya.find({ selector: sel }, true)[0]
  if (d) return d.closest('yt-trust-tiers-wizard-dialog') ? 'trust' : 'verify'
  const re = new RegExp(t.regex, 'i')
  return window.__ya.find({ selector: 'tp-yt-paper-dialog, [role=dialog]' }, true).some((x) => String(x.innerText || '').split('\n').some((l) => re.test(window.__ya.norm(l)))) ? 'verify' : ''
}, SEL.blockers, LABELS.verify).catch(() => '')
// Nem loi code 'verify' neu dang co hop thoai xac minh (src/features/optimize.js dung lo video cua tai khoan nay)
async function assertNotBlocked(page) {
  const k = await blocker(page)
  if (!k) return
  const e = new StepError(BLOCKED[k], page.step)
  e.code = 'verify'
  throw e
}

// ---- hop thoai danh sach phat ----
// Bam o "Danh sach phat" (sec('pl') da danh dau) -> { within, items }. Cho HOP THOAI hien (nut Xong), roi cho o tich:
// kenh chua co danh sach phat nao thi hop thoai chi co "Danh sach phat moi" + "Xong" (truoc day cho o tich 20 giay roi
// bao loi "Qua 20 giay van chua thay #checkbox..."); danh sach ve cham (iron-list, cua so chay ngam) -> ep ve (nudge).
async function openPlaylistDialog(page, plWithin, o = {}) {
  await page.click({ selector: SEL.trigger, within: sec('pl') })
  let within = plWithin
  if (!within) {
    const shown = (x) => page.until((d, b) => window.__ya.count({ selector: d }) || window.__ya.count(b), [SEL.plDialog, { selector: SEL.plBox, within: SEL.dialogs }], { what: 'hộp thoại "Danh sách phát"', ...x })
    // bam bi mat / trang chua ve kip: ep ve roi bam lai mot lan
    if (!(await shown({ timeout: 8000 }).then(() => true, () => false))) {
      if (page.nudge) await page.nudge()
      await page.click({ selector: SEL.trigger, within: sec('pl') })
      try { await shown(o) } catch (e) {
        const r = page.renderState ? await page.renderState().catch(() => '') : ''
        throw r ? new StepError(`${e.message} (${r})`, page.step) : e
      }
    }
    within = (await page.has({ selector: SEL.plDialog })) ? SEL.plDialog : SEL.dialogs
  }
  const box = { selector: SEL.plBox, within }
  await page.until((b, d) => window.__ya.count(b) || window.__ya.count(d), [box, { ...LABELS.done, within }], { what: 'hộp thoại "Danh sách phát"', ...o })
  const n = await poll(page, async () => { const k = await page.count(box); if (!k && page.nudge) await page.nudge(); return k }, 6000)
  return { within, items: n ? await playlistItems(page, within) : [] }
}
async function closePlaylistDialog(page, within, o = {}) {
  await page.click({ ...LABELS.done, within })
  await page.waitGone({ ...LABELS.done, within }, o)
}

// ---- muc Studio khoa khi video dang tai len / xu ly ----
const REMIX_LOCKED = 'Video đang tải lên / xử lý: Studio chưa cho đổi "Phối lại cho Shorts" (chạy lại khi video xử lý xong).'
const ES_LOCKED = 'Studio đang khoá mục "Màn hình kết thúc" (video đang tải lên / xử lý, hoặc video không dùng được màn hình kết thúc): chạy lại khi video xử lý xong.'
const remixLocked = (page) => page.has({ selector: SEL.remixLocked, within: sec('remix') })
const esLocked = (page) => page.eval((s) => {
  const el = window.__ya.one({ selector: s })
  return !!el && (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || !!el.querySelector('ytcp-dropdown-trigger[disabled]'))
}, SEL.esLink).catch(() => false)
// Trinh chinh man hinh ket thuc dang mo (sec('es')): 'has' (da co thanh phan) | 'none' (con o mau "Lay man hinh ket thuc
// cua video gan day nhat"). Khong thay ca hai sau ms: coi nhu da co (khong co o mau = khong lay mau duoc).
async function endScreenState(page, ms = 8000) {
  const r = await poll(page, () => page.eval((tile, items) => (window.__ya.count(tile) ? 'none' : window.__ya.count(items) ? 'has' : ''),
    { ...LABELS.esLatest, within: sec('es') }, { selector: SEL.esItems, within: sec('es'), hidden: true }), ms)
  return r || 'has'
}
async function openEndScreenEditor(page) {
  await page.waitFor(LABELS.endScreen)
  if (await esLocked(page)) throw new StepError(ES_LOCKED, page.step)
  await page.click(LABELS.endScreen)
}

// ---- (a) danh sach video ---------------------------------------------------------
const CONTENT_QS = '?filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%2C%22sortOrder%22%3A%22DESCENDING%22%7D'

async function listVideos(page, channelUc, { urls, log = () => {}, onStep = () => {}, maxPages = 10, limit = 0 } = {}) {
  const uc = channelUc && /^UC[\w-]{10,}$/.test(channelUc) ? channelUc : channelOf(page.url())
  if (!uc) throw new StepError('Không biết UC ID của kênh để mở trang Nội dung.', 'Mở Nội dung')
  onStep('Mở Nội dung')
  await page.run('Mở trang Nội dung của kênh', async () => {
    await page.goto(`${urls.studio}/channel/${uc}/videos/upload${CONTENT_QS}`)
  })
  // trang that co the la "Nội dung của kênh" (cu) hoac "← Video" (moi): chi can thay hang video
  let ready = await page.until((row, empty, all) => (window.__ya.count({ selector: row }) ? 'rows' : window.__ya.count(empty) ? 'empty' : window.__ya.count(all) ? 'overview' : ''), [SEL.row, LABELS.noContent, LABELS.seeAll], { what: 'danh sách video trong trang Nội dung', timeout: Math.max(page.timeout, 30000) })
  if (ready === 'overview') {
    // tong quan Noi dung: bam "Xem tat ca" cua hang Video (hang dau tien co tieu de "Video")
    await page.run('Bấm "Xem tất cả" ở mục Video', async () => {
      const id = await page.eval((all, shelf) => {
        const btns = window.__ya.find(all, true)
        const re = new RegExp(shelf.regex, 'i')
        const inVideo = btns.find((b) => {
          for (let el = b.parentElement; el && el !== document.body; el = el.parentElement) {
            const heads = [...el.querySelectorAll('h1, h2, h3, [role=heading], .title, #title')].filter((h) => !h.contains(b))
            if (heads.length) return heads.some((h) => re.test(window.__ya.norm(h.innerText)))
          }
          return false
        }) || btns[0]
        if (!inVideo) return ''
        inVideo.setAttribute('data-ya-seeall', '1')
        return '1'
      }, LABELS.seeAll, LABELS.videoShelf)
      if (!id) throw new StepError('Không thấy nút "Xem tất cả" ở mục Video.', page.step)
      await page.click({ selector: '[data-ya-seeall="1"]' })
    })
    ready = await page.run('Chờ danh sách video sau "Xem tất cả"', () => page.until((row, empty) => (window.__ya.count({ selector: row }) ? 'rows' : window.__ya.count(empty) ? 'empty' : ''), [SEL.row, LABELS.noContent], { what: 'danh sách video sau khi bấm "Xem tất cả"' }))
  }
  if (ready === 'empty') return []
  const out = []
  const seen = new Set()
  for (let p = 0; p < maxPages; p++) {
    const rows = await page.eval((s) => window.__ya.find({ selector: s.row }, true).map((r) => {
      const m = [...r.querySelectorAll('a[href]')].map((a) => /\/video\/([\w-]{6,})\/edit/.exec(a.getAttribute('href'))).find(Boolean)
      const cell = (q) => { const el = r.querySelector(q); return el ? String(el.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean) : [] }
      const t = r.querySelector(s.rowTitle)
      return m && {
        id: m[1], title: String((t && t.innerText) || '').trim(), visibility: cell(s.vis)[0] || '',
        date: cell(s.date)[0] || '', dateNote: cell(s.date)[1] || '', views: cell(s.views)[0] || '', comments: cell(s.comments)[0] || '',
      }
    }).filter(Boolean), SEL)
    for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); out.push(r) }
    if (limit && out.length >= limit) { out.length = limit; break }
    const next = { selector: SEL.next }
    if (!rows.length || !(await page.has(next)) || !(await isEnabled(page, next))) break
    const first = rows[0].id
    await page.click(next)
    await page.until((s, first) => {
      const r = window.__ya.find({ selector: s.row }, true)[0]
      const a = r && [...r.querySelectorAll('a[href]')].map((x) => /\/video\/([\w-]{6,})\/edit/.exec(x.getAttribute('href'))).find(Boolean)
      return !!a && a[1] !== first
    }, [SEL, first], { what: 'trang danh sách tiếp theo' })
  }
  log('info', `Đọc được ${out.length} video trong trang Nội dung.`)
  return out
}

// ---- cac muc cua mau: dung chung trang Chi tiet video (optimizeVideo) va hop thoai tai len (src/flows/upload.js) ----
// c: { t (mau da chuan hoa), title, videoId, channelName, video, now, lang, log, warn, changed (mang), soft(ten, fn),
//      extraTags (the them truoc the cua mau), recDate (ngay quay thay cho mau), dateInput (o nhap ngay cua lich),
//      openEndScreen (mo trinh chinh man hinh ket thuc) }
// Moi muc tu bo qua khi mau de 'keep'; loi o mot muc -> soft canh bao, lam tiep muc khac.
const FIELDS = {
  description: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    // Mo ta: chi dien khi video CHUA co mo ta; da co thi giu nguyen.
    if (t.description) {
      await soft('Mô tả', async () => {
        const box = { selector: SEL.desc }
        await page.waitFor(box)
        if (String((await page.text(box)) || '').trim()) return log('info', 'Video đã có mô tả: giữ nguyên.')
        const text = renderComment(t.description, { tieu_de: title, link: `https://youtu.be/${videoId}`, ten_kenh: channelName })
        const fit = Buffer.byteLength(text) <= 5000 ? text : Buffer.from(text).subarray(0, 5000).toString().replace(/\uFFFD+$/, '')
        await page.type(box, fit, { clear: false })
        await page.until((s) => String((window.__ya.one({ selector: s }) || {}).innerText || '').trim().length > 0, [SEL.desc], { what: 'mô tả được điền' })
        changed.push('description')
      })
    }
  },
  // c.playlists: ten them truoc ten trong mau (vd danh sach phat cua preset); c.createPlaylist(ten): tao khi kenh chua co;
  // c.plWithin: khung hop thoai chon danh sach phat (mac dinh: hop thoai bat ky)
  playlists: async (page, c) => {
    const { t, soft, warn, changed } = c
    const log = c.log || (() => {})
    const names = [...new Set([...(c.playlists || []), ...t.playlists].map((x) => String(x).trim()).filter(Boolean))]
    if (names.length || t.playlistAuto) {
      await soft('Danh sách phát', async () => {
        await markSection(page, LABELS.playlists, 'pl', SEL.trigger)
        // trang Chi tiet (c.keepFilled): video da o >= 1 danh sach phat = xong, khong mo hop thoai
        if (c.keepFilled) {
          const cur = await READ.playlists(page, { timeout: 3000 }).catch(() => null)
          if (cur && cur.count >= 1) return log('info', `Video đã có trong danh sách phát (${cur.text}): giữ nguyên.`)
        }
        const dlg = await openPlaylistDialog(page, c.plWithin)
        const within = dlg.within
        let items = dlg.items
        const box = { selector: SEL.plBox, within }
        let ticked = 0
        const tick = async (i, what) => {
          if (items[i].on) return
          await page.click({ ...box, nth: i })
          await page.until((b, i) => { const el = window.__ya.find(b, true)[i]; return el && el.getAttribute('aria-checked') === 'true' }, [box, i], { what: `danh sách phát "${what}" được tích` })
          items[i].on = true
          ticked++
        }
        // ten (tich moi danh sach trung ten, vd ca ban "Podcast") hoac ID "PL..." (dung mot danh sach)
        const find = (want) => items.map((x, i) => [x, i]).filter(([x]) => x.name && (norm(x.name) === norm(want) || (x.id && x.id === want)))
        for (const want of names) {
          let hits = find(want)
          if (!hits.length && c.createPlaylist && (c.playlists || []).includes(want) && !/^PL[\w-]{10,}$/.test(want)) {
            try {
              await c.createPlaylist(want)
              items = await playlistItems(page, within)
              hits = find(want)
            } catch (e) {
              await page.press('Escape').catch(() => {})
              warn(`Không thấy danh sách phát "${want}" trong kênh và không tạo được (${e.message}). Hãy tạo trong Studio rồi thêm video vào.`)
              continue
            }
          }
          if (!hits.length) { warn(`Không thấy danh sách phát "${want}" trong kênh.`); continue }
          for (const [, i] of hits) await tick(i, want)
        }
        // tu chon N danh sach phat dau tien (da tich san van tinh vao N)
        if (t.playlistAuto) {
          const first = items.map((x, i) => [x, i]).filter(([x]) => x.name).slice(0, t.playlistAuto)
          if (!first.length) log('info', 'Kênh chưa có danh sách phát nào để tự chọn: bỏ qua mục danh sách phát.')
          for (const [x, i] of first) await tick(i, x.name)
        }
        await closePlaylistDialog(page, within)
        if (ticked) changed.push('playlists')
      })
    }
  },
  paidPromotion: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.paidPromotion !== 'keep') {
      await soft('Nội dung được trả tiền để quảng cáo', async () => {
        await markSection(page, LABELS.paid, 'paid', SEL.radio)
        if (await pickRadio(page, { ...(t.paidPromotion === 'yes' ? LABELS.paidYes : LABELS.paidNo), within: sec('paid') })) changed.push('paidPromotion')
      })
    }
  },
  ai: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.ai !== 'keep') {
      await soft('Sử dụng AI', async () => {
        await markSection(page, LABELS.ai, 'ai', SEL.radio)
        if (await pickRadio(page, { ...(t.ai === 'yes' ? LABELS.aiYes : LABELS.aiNo), within: sec('ai') })) changed.push('ai')
      })
    }
  },
  tags: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    const tt = c.extraTags && c.extraTags.length ? { ...t, extraTags: [...c.extraTags, ...t.extraTags] } : t
    const plan = tagsToAdd([], tt, title)
    if (plan.add.length) {
      await soft('Thẻ', async () => {
        await page.waitFor({ selector: SEL.tagInput })
        const have = await page.eval((s) => window.__ya.find({ selector: s, hidden: true }, true).map((e) => String(e.innerText || e.textContent || '').trim()), SEL.chip)
        const { add, skipped } = tagsToAdd(have, tt, title)
        for (const s of skipped) warn(`Bỏ thẻ "${s}" vì vượt giới hạn 500 ký tự.`)
        const hasChip = (tag, timeout) => page.until((s, want) => window.__ya.find({ selector: s, hidden: true }, true).some((e) => window.__ya.norm(e.innerText || e.textContent) === want), [SEL.chip, norm(tag)], { what: `thẻ "${tag}"`, timeout })
        for (const tag of add) {
          // Studio chi tao the khi BAM Enter (hoac phim dau phay); dau phay trong chu dan vao khong tach the.
          await page.type({ selector: SEL.tagInput }, tag, { clear: false })
          await page.press('Enter')
          try { await hasChip(tag, 4000) } catch (_) {
            await page.press(',')
            await hasChip(tag, 8000)
          }
        }
        if (add.length) changed.push('tags')
      })
    }
  },
  language: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.language) {
      await soft('Ngôn ngữ', async () => {
        for (const lab of [LABELS.videoLanguage, LABELS.titleLanguage]) {
          const r = await pickOption(page, lab, optionNames('language', t.language))
          if (r === 'changed') changed.push('language')
          if (r === 'locked') warn(`Ô "${lab.text}" bị khóa, giữ nguyên.`)
        }
      })
    }
  },
  recordingDate: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    const recDate = t.recordingDate === 'keep' ? null : c.recDate || recordingDateFor(t, video, now)
    if (t.recordingDate === 'publish' && !recDate) warn('Không đọc được ngày đăng video, giữ nguyên ngày quay.')
    if (recDate) {
      await soft('Ngày quay', async () => {
        const want = fmtStudioDate(recDate, lang)
        const wants = [fmtStudioDate(recDate, 'vi'), fmtStudioDate(recDate, 'en')].map(norm)
        await page.waitFor(LABELS.recDate)
        const info = await triggerInfo(page, LABELS.recDate)
        if (info.lines.some((l) => wants.includes(norm(l)))) return
        // trang Chi tiet: video da co ngay quay (ngay nao cung duoc) = xong, khong dat lai
        if (c.keepFilled) {
          const v = valueOf(info, LABELS.recDate)
          if (v && !new RegExp(LABELS.noDate.regex, 'i').test(norm(v))) return log('info', `Video đã có ngày quay (${v}): giữ nguyên.`)
        }
        const shown = (timeout) => page.until((t, sel, wants) => {
          const el = window.__ya.one(t)
          const tr = el && (el.closest(sel) || el)
          return tr && String(tr.innerText || '').split('\n').some((l) => wants.includes(window.__ya.norm(l)))
        }, [LABELS.recDate, SEL.trigger, wants], { what: `ngày quay "${want}"`, timeout })
        await page.click(LABELS.recDate)
        // lich that (ngay-quay-lich.html): ytcp-date-picker > o "Nhập ngày" (tp-yt-paper-input#textbox) + lich cuon theo thang
        // (ytcp-date-picker co kich thuoc 0: hop thoai ben trong la position: fixed -> cho o nhap, khong cho the cha)
        await page.waitFor({ selector: c.dateInput || SEL.dateInput })
        await page.type({ selector: c.dateInput || SEL.dateInput }, want)
        await page.press('Enter')
        let typed = await shown(1500).then(() => true, () => false)
        if (!typed) {
          // o ngay nam trong <form id="form">: phim Enter gui qua sendInputEvent khong phai luc nao cung "submit" form
          await page.eval((s) => { const f = window.__ya.one({ selector: s.datePicker + ' form', hidden: true }); if (f && f.requestSubmit) f.requestSubmit() }, SEL)
          typed = await shown(2000).then(() => true, () => false)
        }
        if (!typed) {
          // go chu khong an: bam ngay tren lich nhu nguoi dung (video quay: bam "hom nay")
          const ok = await pickCalendarDay(page, recDate)
          if (!ok) throw new StepError(`Không chọn được ngày ${want} trên lịch.`, page.step)
          await shown()
        }
        changed.push('recordingDate')
      })
    }
  },
  location: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.location) {
      await soft('Vị trí video', async () => {
        await markSection(page, LABELS.location, 'loc', 'input')
        const inp = { selector: 'input', within: sec('loc') }
        const before = String((await page.value(inp)) || '')
        if (norm(before) === norm(t.location)) return
        if (c.keepFilled && before.trim()) return log('info', `Video đã có vị trí (${before.trim()}): giữ nguyên.`)
        await page.type(inp, t.location)
        let idx
        try {
          idx = await page.until((loc, s) => {
            const opts = window.__ya.find({ selector: s.option, within: s.listbox }, true)
            const i = opts.findIndex((o) => {
              const b = o.querySelector('b, .main-text, #main-text')
              return window.__ya.norm(b ? b.innerText : String(o.innerText || '').split('\n')[0]) === loc
            })
            return i >= 0 ? String(i) : ''
          }, [norm(t.location), SEL], { what: `gợi ý vị trí "${t.location}"`, timeout: Math.max(page.timeout, 10000) })
        } catch (e) {
          await page.press('Escape')
          await page.type(inp, before) // tra lai vi tri cu, khong de chu go do trong o
          await page.press('Escape')
          warn(`Không thấy "${t.location}" trong gợi ý vị trí, giữ nguyên vị trí.`)
          return
        }
        await page.click({ selector: SEL.option, within: SEL.listbox, nth: Number(idx) })
        await page.until((t) => window.__ya.norm(window.__ya.value(t)) !== '', [inp], { what: 'vị trí được chọn' })
        changed.push('location')
      })
    }
  },
  license: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.license !== 'keep') {
      await soft('Giấy phép', async () => {
        await markSection(page, LABELS.license, 'lic', SEL.trigger)
        const r = await pickOption(page, { selector: SEL.trigger, within: sec('lic') }, optionNames('license', t.license))
        if (r === 'changed') changed.push('license')
        if (r === 'locked') warn('Giấy phép bị khóa trên video này (Studio không cho đổi), giữ nguyên.')
      })
    }
  },
  embeddable: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.embeddable !== 'keep') {
      await soft('Cho phép nhúng', async () => {
        if (await setCheckbox(page, LABELS.embed, t.embeddable === 'yes')) changed.push('embeddable')
      })
    }
  },
  remix: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.remix !== 'keep') {
      await soft('Phối lại cho Shorts', async () => {
        await markSection(page, LABELS.remix, 'remix', `${SEL.radio}, ${SEL.remixLocked}`)
        if (await remixLocked(page)) throw new StepError(REMIX_LOCKED, page.step)
        const lab = { all: LABELS.remixAll, audio: LABELS.remixAudio, none: LABELS.remixNone }[t.remix]
        if (await pickRadio(page, { ...lab, within: sec('remix') })) changed.push('remix')
      })
    }
  },
  category: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.category !== 'keep') {
      await soft('Danh mục', async () => {
        await markSection(page, LABELS.category, 'cat', SEL.trigger)
        if ((await pickOption(page, { selector: SEL.trigger, within: sec('cat') }, optionNames('category', t.category))) === 'changed') changed.push('category')
      })
    }
  },
  comments: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.comments !== 'keep') {
      await soft('Bình luận', async () => {
        await markSection(page, LABELS.commentsSection, 'cmt', SEL.trigger)
        const want = optionNames('comments', t.comments)
        if ((await pickOption(page, { ...LABELS.comments, within: sec('cmt') }, want)) === 'changed') changed.push('comments')
      })
    }
  },
  endScreen: async (page, c) => {
    const { t, soft, log, warn, changed, title, videoId, channelName, video, now, lang } = c
    if (t.endScreen === 'latest') {
      await soft('Màn hình kết thúc', async () => {
        if (c.openEndScreen) await c.openEndScreen()
        else await openEndScreenEditor(page)
        await markDialog(page, LABELS.esEditor, 'es', { timeout: Math.max(page.timeout, 20000) })
        // trinh chinh tai cham: cho nut "Thanh phan" roi cho o mau (chua co) hoac cac thanh phan (da co).
        // Khong thay nut (video dai, trinh chinh con xoay) van xem tiep: da co thanh phan = xong
        await page.waitFor({ ...LABELS.esElements, within: sec('es') }, { timeout: Math.max(page.timeout, 30000) }).catch(() => {})
        const tile = { ...LABELS.esLatest, within: sec('es') }
        if ((await endScreenState(page)) === 'has') {
          // khong co o mau = video da co man hinh ket thuc: coi nhu xong
          log('info', 'Màn hình kết thúc: video đã có màn hình kết thúc, giữ nguyên.')
          await page.click({ ...LABELS.esCancel, within: sec('es') })
          await page.waitGone({ selector: sec('es') })
          return
        }
        await page.click(tile)
        const save = { ...LABELS.save, within: sec('es') }
        await page.until((t) => {
          const el = window.__ya.one(t)
          const b = el && (el.closest('button, [role=button], ytcp-button') || el)
          return b && b.getAttribute('aria-disabled') !== 'true' && !b.hasAttribute('disabled')
        }, [save], { what: 'nút "Lưu" của màn hình kết thúc' })
        await page.click(save)
        await page.waitGone({ selector: sec('es') }, { timeout: Math.max(page.timeout, 30000) })
        changed.push('endScreen')
      })
    }
  },
}
const FIELD_ORDER = Object.keys(FIELDS)

// ---- (b) toi uu trang Chi tiet video -------------------------------------------
async function optimizeVideo(page, videoId, template, { urls, log = () => {}, onStep = () => {}, video = {}, now = new Date(), channelName = '' } = {}) {
  const t = normalizeTemplate(template)
  const changed = []
  const warnings = []
  const warn = (m) => { warnings.push(m); log('warn', m) }
  const step = (name, fn) => { onStep(name); return page.run(name, fn) }
  // Muc tuy chon: loi o mot muc thi bao canh bao, dong menu/hop thoai dang mo roi lam tiep cac muc khac
  // (khong mat het thay doi chi vi mot muc). Chay lai se chi lam nhung muc con thieu.
  const soft = async (name, fn) => {
    try { await step(name, fn) } catch (e) {
      if (/Đã dừng theo yêu cầu/.test(e.message)) throw e
      if (page.snapshot) await page.snapshot(`toi-uu-${videoId}-${name}`).catch(() => {})
      // hop thoai xac minh danh tinh che trang: dung ca video (khong canh bao tung muc)
      await assertNotBlocked(page)
      await page.press('Escape').catch(() => {})
      await sleep(300)
      const es = await page.has({ ...LABELS.esCancel, within: sec('es') }).catch(() => false)
      if (es) await page.click({ ...LABELS.esCancel, within: sec('es') }).catch(() => {})
      warn(`Bỏ qua mục "${name}": ${e.message}`)
    }
  }

  await step('Mở trang Chi tiết video', async () => {
    await page.goto(`${urls.studio}/video/${videoId}/edit`)
    await page.waitFor(LABELS.details)
    await page.waitFor({ selector: SEL.title }, { timeout: Math.max(page.timeout, 20000) })
  })
  const title = String((await page.text({ selector: SEL.title })) || '').trim()
  await assertNotBlocked(page)
  const visibility = await readVisibility(page)

  // keepFilled: muc da dien (ngay quay / vi tri bat ky, >= 1 danh sach phat) = xong, khong lam lai (giong quet)
  const c = { t, title, videoId, channelName, video, now, lang: 'vi', log, warn, changed, soft, keepFilled: true }
  // chi mo "Hien them" khi mau con muc nang cao can lam
  const touched = new Set(touchedFields(t))
  for (const k of FIELD_ORDER) {
    if (ADVANCED.includes(k) && touched.has(k) && !c.more) {
      await step('Hiện thêm', () => openMore(page))
      // Studio tieng Anh: cac o chon tim theo ma co dinh, chu tieng Anh; ngay viet kieu "Oct 27, 2026"
      c.lang = (await page.has(LABELS.english)) ? 'en' : 'vi'
      if (c.lang === 'en') log('info', 'YouTube Studio của tài khoản này đang dùng tiếng Anh.')
      c.more = true
    }
    await FIELDS[k](page, c)
  }
  let saved = false
  await step('Lưu', async () => {
    await assertNotBlocked(page)
    await page.waitFor(LABELS.save)
    if (!(await isEnabled(page, LABELS.save))) { log('info', 'Studio không có gì thay đổi để lưu.'); return }
    await page.click(LABELS.save)
    // bam Luu co the bat Google hoi "Xac minh danh tinh cua ban": dung ngay, khong cho het 30 giay
    await page.until((ok, b) => window.__ya.count(ok) || window.__ya.count({ selector: b }), [LABELS.saved, SEL.blockers], { timeout: Math.max(page.timeout, 30000), what: `"${LABELS.saved.text}"` })
    await assertNotBlocked(page)
    saved = true
  })
  const after = String((await page.text({ selector: SEL.title })) || '').trim() || title
  return { id: videoId, title: after, changed, warnings, saved, visibility }
}

// Che do hien thi HIEN TAI cua video o cot ben phai trang Chi tiet ("Chế độ hiển thị: Công khai"; HTML that:
// ytcp-video-metadata-visibility #visibility-text). Danh sach quet luc truoc co the cu (video cong chieu / len lich
// da cong khai roi). '' = khong doc duoc.
const readVisibility = (page) => page.text({ selector: 'ytcp-video-metadata-visibility #visibility-text', hidden: true }).then((t) => String(t || '').replace(/\s+/g, ' ').trim()).catch(() => '')

// Mo trang Chi tiet chi de doc che do hien thi (khi khong can sua gi trong Studio)
async function videoVisibility(page, videoId, { urls }) {
  await page.goto(`${urls.studio}/video/${videoId}/edit`)
  await page.waitFor({ selector: SEL.title }, { timeout: Math.max(page.timeout, 20000) }).catch(() => {})
  await assertNotBlocked(page)
  return readVisibility(page)
}

// ---- (b2) doc trang Chi tiet video: CHI DOC (khong bam Luu, khong doi muc nao) ------
// Gia tri cua o tha xuong (bo dong nhan `label`): dong cuoi con lai, '' neu khong co.
const valueOf = (info, label) => {
  if (!info) throw new StepError(`Không thấy ô "${label ? label.text : ''}".`, '')
  const re = label && new RegExp(label.regex, 'i')
  const v = info.lines.filter((l) => /[\p{L}\p{N}]/u.test(l) && (!re || !re.test(norm(l)))) // bo dong chi co ky hieu (mui ten)
  return v.length ? v[v.length - 1] : ''
}
const keyOf = (text, map) => (Object.entries(map).find(([, v]) => [].concat(v).some((x) => norm(x) === norm(text))) || [''])[0]

// Radio dang chon trong muc `label`: key trong opts ('' = chua chon)
async function readRadio(page, label, name, opts, o) {
  await markSection(page, label, name, SEL.radio, o)
  let found = 0
  for (const [k, lab] of opts) {
    const t = { ...lab, within: sec(name) }
    if (!(await page.has(t))) continue
    found++
    if (await isChecked(page, t, SEL.radio)) return k
  }
  if (!found) throw new StepError(`Không thấy lựa chọn trong mục "${label.text}".`, page.step)
  return ''
}

// Moi ham doc mot muc (nem loi neu khong thay o). o = { timeout }
const READ = {
  title: async (page) => String((await page.text({ selector: SEL.title })) || '').trim(),
  description: async (page, o) => {
    await page.waitFor({ selector: SEL.desc }, o)
    return String((await page.text({ selector: SEL.desc })) || '').trim()
  },
  // o "Danh sach phat": "Chọn" (0) | ten mot danh sach (1) | "2 danh sách phát"
  playlists: async (page, o) => {
    await markSection(page, LABELS.playlists, 'pl', SEL.trigger, o)
    const text = valueOf(await triggerInfo(page, { selector: SEL.trigger, within: sec('pl') }), LABELS.playlists)
    const m = new RegExp(LABELS.plCount.regex, 'i').exec(norm(text))
    return { text, count: !text || new RegExp(LABELS.noPlaylist.regex, 'i').test(norm(text)) ? 0 : m ? Number(m[1]) : 1 }
  },
  paidPromotion: (page, o) => readRadio(page, LABELS.paid, 'paid', [['yes', LABELS.paidYes], ['no', LABELS.paidNo]], o),
  ai: (page, o) => readRadio(page, LABELS.ai, 'ai', [['yes', LABELS.aiYes], ['no', LABELS.aiNo]], o),
  // video dang tai len / xu ly: Studio chua co nut chon (that: #content-remixing-unavailable-msg) -> loi ro rang (tinh la thieu)
  remix: async (page, o) => {
    await markSection(page, LABELS.remix, 'remix', `${SEL.radio}, ${SEL.remixLocked}`, o)
    if (await remixLocked(page)) throw new StepError(REMIX_LOCKED, page.step)
    return readRadio(page, LABELS.remix, 'remix', [['all', LABELS.remixAll], ['audio', LABELS.remixAudio], ['none', LABELS.remixNone]], o)
  },
  tags: async (page, o) => {
    await page.waitFor({ selector: SEL.tagInput }, o)
    return page.eval((s) => window.__ya.find({ selector: s, hidden: true }, true).map((e) => String(e.innerText || e.textContent || '').trim()).filter(Boolean), SEL.chip)
  },
  language: async (page, o) => {
    const out = []
    for (const lab of [LABELS.videoLanguage, LABELS.titleLanguage]) {
      await page.waitFor(lab, o)
      out.push(valueOf(await triggerInfo(page, lab), lab))
    }
    return out
  },
  // '' = chua dat ("Không chọn")
  recordingDate: async (page, o) => {
    await page.waitFor(LABELS.recDate, o)
    const v = valueOf(await triggerInfo(page, LABELS.recDate), LABELS.recDate)
    return new RegExp(LABELS.noDate.regex, 'i').test(norm(v)) ? '' : v
  },
  location: async (page, o) => {
    await markSection(page, LABELS.location, 'loc', 'input', o)
    return String((await page.value({ selector: 'input', within: sec('loc') })) || '').trim()
  },
  license: async (page, o) => {
    await markSection(page, LABELS.license, 'lic', SEL.trigger, o)
    const info = await triggerInfo(page, { selector: SEL.trigger, within: sec('lic') })
    return { value: keyOf(valueOf(info, LABELS.license), { youtube: optionNames('license', 'youtube'), creativeCommon: optionNames('license', 'creativeCommon') }), locked: !!info.disabled }
  },
  embeddable: async (page, o) => {
    await page.waitFor(LABELS.embed, o)
    return isChecked(page, LABELS.embed, '[role=checkbox], ytcp-checkbox-lit')
  },
  category: async (page, o) => {
    await markSection(page, LABELS.category, 'cat', SEL.trigger, o)
    return valueOf(await triggerInfo(page, { selector: SEL.trigger, within: sec('cat') }), LABELS.category)
  },
  comments: async (page, o) => {
    await markSection(page, LABELS.commentsSection, 'cmt', SEL.trigger, o)
    const v = valueOf(await triggerInfo(page, { ...LABELS.comments, within: sec('cmt') }), LABELS.comments)
    return keyOf(v, { on: optionNames('comments', 'on'), pause: optionNames('comments', 'pause'), off: optionNames('comments', 'off') })
  },
  // Mo hop thoai danh sach phat chi de doc o nao dang tich, roi dong bang "Xong" (khong tich/bo tich gi).
  // Kenh chua co danh sach phat nao -> [] (khong cho o tich 20 giay)
  playlistDialog: async (page, o) => {
    await markSection(page, LABELS.playlists, 'pl', SEL.trigger, o)
    const { within, items } = await openPlaylistDialog(page, null, o)
    await closePlaylistDialog(page, within, o)
    return items.filter((x) => x.name)
  },
  // Mo trinh chinh man hinh ket thuc (chi xem), roi "Huy thay doi": true = video da co man hinh ket thuc
  endScreen: async (page, o) => {
    await openEndScreenEditor(page)
    await markDialog(page, LABELS.esEditor, 'es', { timeout: Math.max(o.timeout || 0, 20000) })
    try {
      await page.waitFor({ ...LABELS.esElements, within: sec('es') }, { timeout: Math.max(o.timeout || 0, 30000) }).catch(() => {})
      return (await endScreenState(page)) === 'has'
    } finally {
      await page.click({ ...LABELS.esCancel, within: sec('es') }).catch(() => {})
      await page.waitGone({ selector: sec('es') }, o).catch(() => {})
    }
  },
}
// Muc can "Hien them" moi co tren trang
const ADVANCED = ['paidPromotion', 'ai', 'remix', 'tags', 'language', 'recordingDate', 'location', 'license', 'embeddable', 'category', 'comments']
// Ten muc (ghi chu khi quet)
const FIELD_NAMES = {
  description: 'Mô tả', playlists: 'Danh sách phát', paidPromotion: 'Nội dung được trả tiền để quảng cáo', ai: 'Sử dụng AI', remix: 'Phối lại cho Shorts',
  tags: 'Thẻ', language: 'Ngôn ngữ', recordingDate: 'Ngày quay', location: 'Vị trí video', license: 'Giấy phép', embeddable: 'Cho phép nhúng',
  category: 'Danh mục', comments: 'Bình luận', endScreen: 'Màn hình kết thúc',
}

// Doc 1 video va so voi mau: { id, title, missing, filled, unknown, notes, read }.
// Muc doc loi -> tinh la thieu (kem ghi chu). Man hinh ket thuc: mo trinh chinh xem co chua roi huy (endScreen: false = bo qua -> unknown).
// Hop thoai xac minh danh tinh che trang -> nem loi code 'verify'.
async function inspectVideo(page, videoId, template, { urls, log = () => {}, onStep = () => {}, video = {}, now = new Date(), endScreen = true } = {}) {
  const t = normalizeTemplate(template)
  const o = { timeout: Math.min(page.timeout, 8000) }
  const notes = []
  const read = {}
  onStep('Mở trang Chi tiết video')
  await page.run('Đọc trang Chi tiết video', async () => {
    await page.goto(`${urls.studio}/video/${videoId}/edit`)
    await page.waitFor(LABELS.details)
    await page.waitFor({ selector: SEL.title }, { timeout: Math.max(page.timeout, 20000) })
  })
  await assertNotBlocked(page)
  const title = (await READ.title(page)) || video.title || ''
  // muc nao mau can (giong compareFields)
  const want = []
  if (t.description) want.push('description')
  if (t.playlists.length || t.playlistAuto) want.push('playlists')
  for (const k of ['paidPromotion', 'ai', 'remix', 'recordingDate', 'license', 'embeddable', 'category', 'comments']) if (t[k] !== 'keep') want.push(k)
  if (t.tagsMode !== 'keep' || t.extraTags.length) want.push('tags')
  if (t.language) want.push('language')
  if (t.location) want.push('location')
  const failed = []
  const tryRead = async (k, fn) => {
    try { read[k] = await fn() } catch (e) {
      if (/Đã dừng theo yêu cầu/.test(e.message)) throw e
      await assertNotBlocked(page)
      failed.push(k)
      notes.push(`Không đọc được mục "${FIELD_NAMES[k] || k}": ${e.message}`)
    }
  }
  onStep('Đọc thông tin')
  for (const k of want.filter((k) => !ADVANCED.includes(k))) await tryRead(k, () => READ[k](page, o))
  // danh sach phat: video chua o danh sach nao -> mo hop thoai xem kenh co danh sach de tich khong
  const pl = read.playlists
  if (pl && pl.count < 1) {
    await tryRead('playlists', async () => ({ ...pl, items: await READ.playlistDialog(page, o) }))
  }
  if (want.some((k) => ADVANCED.includes(k))) {
    let shown = true
    try {
      await openMore(page, o) // chi la nut xem them, khong doi gi
    } catch (e) { shown = false; notes.push(`Không mở được "Hiện thêm": ${e.message}`) }
    for (const k of want.filter((k) => ADVANCED.includes(k))) {
      if (shown) await tryRead(k, () => READ[k](page, o))
      else failed.push(k)
    }
  }
  if (t.endScreen !== 'keep' && endScreen) await tryRead('endScreen', () => READ.endScreen(page, o))
  // hop thoai co the hien muon (sau khi trang tai xong): doc duoc het van kiem lai
  await assertNotBlocked(page)
  const r = compareFields(read, t, { title })
  for (const k of failed) if (!r.missing.includes(k)) { r.missing.push(k); r.unknown = r.unknown.filter((x) => x !== k) }
  for (const n of notes) log('warn', `${title || videoId}: ${n}`)
  return { id: videoId, title, missing: r.missing, filled: r.filled, unknown: r.unknown, notes, read }
}

// ---- (c) binh luan + ghim tren trang xem video ----------------------------------
// Moi viec (Thich / binh luan / ghim) chi tinh la XONG khi da kiem lai: sau khi bam, roi tai lai
// trang va doc lai (YouTube hien ket qua "lac quan" ngay ca khi may chu khong luu).
// Nhan + bo chon rieng cua trang xem video (HTML that: tests/mock-yt/optimize/that/xem-video.html)
const WATCH = {
  comments: 'ytd-comments#comments', // khung binh luan chinh (ban sao trong engagement panel bi bo qua)
  thread: 'ytd-comment-thread-renderer',
  top: '#comment-container', // binh luan goc (khong tinh #replies)
  content: '#content-text',
  author: '#author-text', // a[href="/@handle"]
  authorBadge: '#author-comment-badge', // rong voi nguoi xem; co chu (ytd-author-comment-badge-renderer) voi chu kenh
  pinnedBadge: '#pinned-comment-badge', // luon co trong DOM, chi co chu khi da ghim
  identity: 'ytd-comment-simplebox-renderer #author-thumbnail img, ytd-commentbox #author-thumbnail img', // alt = ten kenh dang binh luan
  // chua dang nhap: nut "Dang nhap" tren thanh tren cung (a[href*=ServiceLogin])
  signIn: { selector: 'a[href*="ServiceLogin"], a[href*="accounts.google.com/"], ytd-button-renderer a, tp-yt-paper-button', regex: '^(đăng nhập|sign in)$' },
  commentsOff: { regex: '(tính năng bình luận đã bị tắt|bình luận đã bị tắt|comments are turned off)', within: 'ytd-comments#comments' },
  sortMenu: { selector: '#sort-menu [role=button], #sort-menu tp-yt-paper-button', regex: '^(sắp xếp bình luận|sắp xếp theo|sort comments|sort by)$', within: 'ytd-comments#comments' },
  // muc trong menu "Sắp xếp theo" (tp-yt-iron-dropdown position: fixed trong span#sort-menu): khung tim khong can "hien"
  newest: { regex: '^(mới nhất|newest first|newest)$', within: { selector: 'ytd-comments#comments #sort-menu', hidden: true } },
  // tieu de khung binh luan: "2 bình luận" / "6 Comments" (that: ytd-comments-header-renderer h2#count)
  count: 'ytd-comments#comments ytd-comments-header-renderer #count',
}

// Trong trang: doc cac luot binh luan dang hien, tim binh luan co chu `want`, xem co phai cua kenh `who`.
// Tra ve { count, first, match, other }; danh dau binh luan cua kenh bang data-ya-thread="me".
const scanThreads = (page, want, who) => page.eval((s, want, who) => {
  const n = (x) => String(x || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
  const handleOf = (x) => { const m = /@([^/?#\s]+)/.exec(decodeURIComponent(String(x || ''))); return m ? '@' + m[1].toLowerCase() : '' }
  const ucOf = (x) => (/\/channel\/(UC[\w-]{10,})/.exec(String(x || '')) || [])[1] || ''
  const wh = handleOf(who.handle)
  const info = (th, i) => {
    const top = th.querySelector(s.top) || th
    const c = top.querySelector(s.content)
    const text = n(c && c.innerText)
    const badge = top.querySelector(s.authorBadge)
    const creator = !!(badge && (badge.querySelector('ytd-author-comment-badge-renderer') || n(badge.innerText)))
    const links = [...top.querySelectorAll(`${s.author}, ${s.authorBadge} a, #author-thumbnail-button, #author-thumbnail a`)]
    const ids = links.flatMap((a) => [a.getAttribute('href'), a.getAttribute('aria-label'), a.innerText])
    const handles = ids.map(handleOf).filter(Boolean)
    const author = (handles[0] || n(ids.find((x) => n(x)) || '')).slice(0, 80)
    const byHandle = !!wh && handles.includes(wh)
    const byUc = !!who.ucId && ids.some((x) => ucOf(x) === who.ucId)
    const pb = top.querySelector(s.pinnedBadge)
    const pinned = !!(pb && window.__ya.visible(pb) && n(pb.innerText))
    return { i, text, author, creator, mine: byHandle || byUc || creator, pinned }
  }
  for (const el of document.querySelectorAll('[data-ya-thread]')) el.removeAttribute('data-ya-thread')
  const list = window.__ya.find({ selector: s.thread, within: s.comments }, true)
  const w = n(want)
  const same = (t) => !!t && !!w && (t === w || (w.length > 60 && t.startsWith(w.slice(0, 60))))
  let match = null, other = null
  list.forEach((th, i) => {
    if (match) return
    const x = info(th, i)
    if (!same(x.text)) return
    if (x.mine) { match = x; th.setAttribute('data-ya-thread', 'me') } else if (!other) other = x
  })
  const first = list.length ? info(list[0], 0) : null
  if (first) first.ours = same(first.text) && first.mine
  return { count: list.length, first, match, other }
}, WATCH, want, who)

// Ten kenh trong o binh luan (anh dai dien cua o "Them binh luan...")
const commentIdentity = (page) => page.eval((s) => {
  const box = document.querySelector(s.comments) || document
  for (const img of box.querySelectorAll(s.identity)) { const a = String(img.getAttribute('alt') || '').trim(); if (a) return a }
  return ''
}, WATCH)

const likeTarget = { ...LABELS.like, selector: SEL.likeButton }
const likePressed = (page) => page.eval((t) => { const el = window.__ya.one(t); return !!el && el.getAttribute('aria-pressed') === 'true' }, likeTarget)

// Goi fn() toi khi co gia tri (khac null/false/'') hoac het ms; khong nem loi khi het gio.
async function poll(page, fn, ms) {
  const end = Date.now() + ms
  for (;;) {
    if (page.shouldStop && page.shouldStop()) throw new StepError('Đã dừng theo yêu cầu.', page.step)
    const v = await fn().catch(() => null)
    if (v || Date.now() > end) return v || null
    await sleep(300)
  }
}

async function openWatch(page, url) {
  await page.goto(url)
  // cho trang xem video hien (nut Thich, thanh tac vu hoac khung binh luan); thieu nut Thich thi buoc Thich tu bao loi
  await page.until((like, s) => window.__ya.count(like) || window.__ya.count({ selector: 'ytd-watch-metadata #actions, ' + s.comments }), [likeTarget, WATCH], { what: 'trang xem video', timeout: Math.max(page.timeout, 20000) })
  await poll(page, () => page.has(likeTarget), 5000)
}

// Cuon toi khung binh luan (YouTube chi tai khi khung vao tam nhin) -> { off } | { off: false }
// Sau 3 giay chua thay thi ep trang ve lai (page.nudge) moi vong: cua so chay ngam co the khong ve.
async function openComments(page, { timeout = Math.max(page.timeout, 20000) } = {}) {
  const t0 = Date.now()
  const r = await poll(page, async () => {
    if (Date.now() - t0 > 3000 && page.nudge) await page.nudge()
    return page.eval((s, add, off) => {
      const box = document.querySelector(s.comments)
      if (box) box.scrollIntoView({ block: 'start' })
      else window.scrollBy(0, 400)
      if (window.__ya.count(off)) return { off: true }
      if (window.__ya.count({ ...add, within: s.comments }) || window.__ya.count({ selector: s.thread, within: s.comments })) return { off: false }
      return null
    }, WATCH, LABELS.addComment, WATCH.commentsOff)
  }, timeout)
  if (r) return r
  // ghi ro vi sao: khung con dang tai (vong xoay) / trang khong duoc ve (requestAnimationFrame khong chay)
  const d = await page.eval((s) => new Promise((done) => {
    const box = document.querySelector(s.comments)
    const out = { box: !!box, loading: !!(box && box.querySelector('#spinner-container tp-yt-paper-spinner-lite, ytd-continuation-item-renderer')), vis: document.visibilityState, raf: false }
    requestAnimationFrame(() => { out.raf = true; done(out) })
    setTimeout(() => done(out), 1500)
  }), WATCH).catch(() => null)
  const why = !d ? '' : !d.box ? ' (trang không có khung bình luận)'
    : !d.raf ? ' (trang không được vẽ: cửa sổ chạy ngầm bị Windows tạm dừng nên YouTube không tải bình luận)'
    : d.loading ? ' (YouTube vẫn đang tải bình luận)' : ''
  throw new StepError(`Quá ${Math.round(timeout / 1000)} giây vẫn chưa thấy phần bình luận${why}.`, page.step)
}

// So binh luan tren tieu de khung binh luan (gom ca tra loi); so viet tat ("1,2 N", "1.2K") / khong doc duoc -> null
const headerCount = (page) => page.eval((s) => {
  const el = document.querySelector(s.count)
  const m = /^\s*(\d+)\s+\D/.exec(String((el && el.innerText) || '').replace(/\s+/g, ' ') + ' ')
  return m ? Number(m[1]) : null
}, WATCH).catch(() => null)

// Tim binh luan cua kenh: cuon de YouTube tai them; khong thay thi doi sang "Moi nhat" roi tim lai.
// Khong doi khi "Hang dau" da hien du (so luot >= so tren tieu de): video it binh luan ma kenh chua binh luan.
// Doi sap xep loi (menu khong mo / khong bam duoc "Moi nhat") chi ghi nhat ky, khong lam hong ca viec binh luan
// (truoc day loi nay nem ra ngoai -> commentAndPin bao loi du binh luan da tai xong).
async function seekMine(page, text, who, { pages = 8, log = () => {} } = {}) {
  let other = null
  let count = 0
  // khung "Thêm bình luận..." hien truoc cac luot binh luan: tieu de bao co binh luan thi cho chung tai
  // (khong thi tuong video chua co binh luan cua kenh -> dang trung)
  const total0 = await headerCount(page)
  if (total0) await page.until((s) => window.__ya.count({ selector: s.thread, within: s.comments }), [WATCH], { timeout: Math.max(page.timeout, 10000), what: 'các bình luận' }).catch(() => 0)
  for (const sort of ['top', 'newest']) {
    if (sort === 'newest') {
      // video chua co binh luan nao / khong co menu sap xep / da tai het: khong can doi
      if (!count || !(await page.has(WATCH.sortMenu))) break
      const total = await headerCount(page)
      if (total !== null && count >= total) break
      log('info', 'Chưa thấy bình luận của kênh ở mục "Hàng đầu": chuyển sang "Mới nhất".')
      try {
        await page.click(WATCH.sortMenu)
        await page.click(WATCH.newest, { timeout: Math.min(page.timeout, 8000) })
      } catch (e) {
        if (/Đã dừng theo yêu cầu/.test(e.message)) throw e
        await page.press('Escape').catch(() => {})
        log('warn', `Không chuyển được sang "Mới nhất" (${e.message}): chỉ tìm trong "Hàng đầu".`)
        break
      }
      await sleep(800)
      await page.until((s) => window.__ya.count({ selector: s.thread, within: s.comments }), [WATCH], { timeout: Math.max(page.timeout, 10000), what: 'bình luận (Mới nhất)' }).catch(() => 0)
    }
    for (let round = 0, still = 0; round < pages && still < 2; round++) {
      const r = await scanThreads(page, text, who)
      if (r.match) return r.match
      other = other || r.other
      count = r.count
      await page.eval((s) => {
        const th = window.__ya.find({ selector: s.thread, within: s.comments }, true)
        if (th.length) th[th.length - 1].scrollIntoView({ block: 'end' })
        window.scrollBy(0, 600)
      }, WATCH)
      const grew = await page.until((s, k) => window.__ya.count({ selector: s.thread, within: s.comments }) > k, [WATCH, r.count], { timeout: 2500 }).catch(() => false)
      still = grew ? 0 : still + 1
    }
  }
  if (other) log('warn', `Có bình luận cùng nội dung nhưng của "${other.author || '?'}", không phải của kênh.`)
  return null
}

// Trang xem video phai duoc VE thi YouTube moi tai binh luan: hien cua so chay ngam (trong suot) trong luc lam.
async function commentAndPin(page, ...args) {
  const hide = page.show ? await page.show() : null
  try { return await watchTasks(page, ...args) } finally { if (hide) await hide() }
}

// Ghim binh luan cua kenh (scanThreads tim lai va danh dau data-ya-thread="me"):
// 'ok' | 'nomenu' (menu khong co "Ghim": kenh khong ghim duoc) | 'nobadge' (da bam Ghim nhung khong thay huy hieu "Da ghim")
async function pinOnce(page, text, who) {
  const r = await scanThreads(page, text, who)
  if (!r.match) throw new StepError('Không thấy bình luận của kênh để ghim.', page.step)
  if (r.match.pinned) return 'ok'
  await page.click({ ...LABELS.commentMenu, selector: 'button, [role=button]', within: '[data-ya-thread="me"]' })
  if (!(await page.until((t) => window.__ya.count(t), [{ ...LABELS.pin, within: SEL.menus }], { timeout: 4000 }).catch(() => 0))) {
    await page.press('Escape').catch(() => {})
    return 'nomenu'
  }
  await page.click({ ...LABELS.pin, within: SEL.menus })
  // hop thoai "Ghim binh luan nay?" / "Pin this comment?" (co the khong co)
  const isPinned = async () => { const x = await scanThreads(page, text, who); return !!(x.match && x.match.pinned) }
  const seen = await poll(page, async () => ((await isPinned()) ? 'pinned' : (await markDialog(page, LABELS.pinDialog, 'pin', { timeout: 0 }).catch(() => false)) ? 'dialog' : ''), Math.max(page.timeout, 8000))
  if (seen === 'dialog') await page.click({ ...LABELS.pinConfirm, within: sec('pin') })
  if (await poll(page, isPinned, Math.max(page.timeout, 15000))) return 'ok'
  await page.press('Escape').catch(() => {})
  return 'nobadge'
}
const PIN_WHY = { nomenu: 'menu của bình luận không có "Ghim"', nobadge: 'đã bấm "Ghim" nhưng không thấy huy hiệu "Đã ghim"' }
// Ghi chu khi kenh khong ghim duoc (video van tinh la xong): "đã thích và bình luận - chưa ghim"
function pinNote(liked, commented) {
  const did = [liked && 'thích', commented && 'bình luận'].filter(Boolean).join(' và ')
  return did ? `đã ${did} - chưa ghim` : 'chưa ghim'
}

async function watchTasks(page, videoId, text, { urls, log = () => {}, onStep = () => {}, like = true, pin = true, channel = {}, pages = 8 } = {}) {
  text = String(text || '').trim()
  const warnings = []
  const shots = []
  // liked/commented/pinned: da KIEM LAI sau khi tai lai trang; posted: lan nay vua dang binh luan
  // cannotPin: binh luan co nhung kenh khong ghim duoc (menu khong co Ghim / bam Ghim 2 lan khong an) -> video van tinh la xong
  const out = { id: videoId, liked: false, commented: false, pinned: false, posted: false, cannotPin: false, pinNote: '', warnings, shots, blocker: '' }
  const who = { name: String(channel.name || '').trim(), handle: String(channel.handle || '').trim(), ucId: String(channel.ucId || '') }
  const url = `${urls.youtube}/watch?v=${videoId}`
  const step = (name, fn) => { onStep(name); return page.run(name, fn) }
  const warned = new Set()
  // canh bao (moi loai mot lan) + luu anh/HTML trang de nguoi sua tool xem
  const warn = async (kind, shot, msg) => {
    if (warned.has(kind)) return
    warned.add(kind)
    warnings.push(msg)
    log('warn', msg)
    const p = page.snapshot ? await page.snapshot(`xem-video-${videoId}-${shot}`) : ''
    if (p) { shots.push(p); log('info', `Đã lưu ảnh + HTML trang xem video: ${p}.png`) }
  }
  const wrongChannel = (name) => !!(name && who.name && norm(name) !== norm(who.name))
  const stopped = (e) => /Đã dừng theo yêu cầu/.test(e.message)

  await step('Mở trang xem video', () => openWatch(page, url))
  // cua so chay ngam: YouTube chi tai binh luan khi trang "hien" (backgroundThrottling: false)
  const vis = await page.eval(() => document.visibilityState).catch(() => '')
  if (vis && vis !== 'visible') log('warn', `Trang xem video đang ở trạng thái "${vis}" (cửa sổ chạy ngầm), YouTube có thể không tải bình luận.`)

  if (await page.has(WATCH.signIn)) {
    out.blocker = 'signedOut'
    await warn('all', 'dang-nhap', 'YouTube (www.youtube.com) chưa đăng nhập trong cửa sổ chạy ngầm: không thích / bình luận / ghim được. Vào trang Tài khoản, bấm "Đăng nhập" lại cho tài khoản Google này.')
    return out
  }

  // khung binh luan: bat/tat? dang binh luan bang kenh nao?
  let box = null
  try {
    box = await step('Mở phần bình luận', () => openComments(page, text ? {} : { timeout: Math.min(page.timeout, 8000) }))
  } catch (e) {
    if (text) throw e
  }
  if (box && box.off) {
    out.blocker = 'commentsOff'
    if (text) await warn('comment', 'tat-binh-luan', 'Tính năng bình luận đã bị tắt ở video này nên không bình luận / ghim được. Bật bình luận (mẫu tối ưu: Bình luận = Bật) rồi chạy lại.')
    text = ''
  }
  // anh dai dien co the nap muon: cho toi da 3 giay
  const identity = box && !box.off ? (await poll(page, () => commentIdentity(page), 3000)) || '' : ''
  if (identity) log('info', `Ô bình luận trên YouTube đang dùng kênh "${identity}".`)
  if (wrongChannel(identity)) {
    out.blocker = 'wrongChannel'
    await warn('all', 'sai-kenh', `Đang bình luận bằng kênh "${identity}", không phải kênh "${who.name}": không thích / bình luận / ghim để khỏi làm bằng kênh khác. Trên youtube.com tài khoản này đang chọn kênh khác (hoặc kênh "${who.name}" chỉ được cấp quyền trong Studio).`)
    return out
  }

  if (like) {
    // loi o buoc Thich khong chan binh luan / ghim
    try {
      await step('Thích video', async () => {
        if (!(await page.has(likeTarget))) throw new StepError('Không thấy nút "Thích" trên trang xem video.', page.step)
        if (await likePressed(page)) { out.liked = true; return }
        await page.click(likeTarget)
        const ok = await page.until((t) => { const el = window.__ya.one(t); return !!el && el.getAttribute('aria-pressed') === 'true' }, [likeTarget], { what: 'nút Thích được bấm', timeout: Math.max(page.timeout, 8000) }).catch(() => false)
        if (ok) out.liked = true
        else await warn('like', 'thich', 'Đã bấm "Thích" nhưng nút không chuyển sang "đã thích".')
      })
    } catch (e) {
      if (stopped(e)) throw e
      await warn('like', 'thich', `Chưa thích được video: ${e.message}`)
    }
  }

  let mine = null
  if (text) {
    mine = await step('Tìm bình luận của kênh', () => seekMine(page, text, who, { pages, log }))
    if (mine) log('info', 'Bình luận này của kênh đã có dưới video, không đăng lại.')
    else {
      await step('Đăng bình luận', async () => {
        await page.click(LABELS.addComment)
        await page.waitFor({ selector: SEL.editor })
        const id2 = await commentIdentity(page)
        if (wrongChannel(id2)) {
          out.blocker = 'wrongChannel'
          await page.click({ selector: '#cancel-button button, #cancel-button' }).catch(() => {})
          await warn('all', 'sai-kenh', `Đang bình luận bằng kênh "${id2}", không phải kênh "${who.name}": không đăng bình luận.`)
          return
        }
        await page.type({ selector: SEL.editor }, text)
        const submit = { ...LABELS.submitComment, selector: SEL.submit }
        await page.until((t) => {
          const el = window.__ya.one(t)
          return !!el && el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('disabled')
        }, [submit], { what: 'nút "Bình luận" bật' })
        await page.click(submit)
        // cho binh luan moi hien ra VA dung ten kenh
        const r = await poll(page, async () => { const x = await scanThreads(page, text, who); return x.match || x.other ? x : null }, Math.max(page.timeout, 15000))
        if (!r) await warn('comment', 'binh-luan', 'Đã bấm "Bình luận" nhưng không thấy bình luận hiện ra dưới video.')
        else if (!r.match) await warn('comment', 'binh-luan', `Bình luận hiện dưới tên "${r.other.author || '?'}", không phải kênh "${who.name || who.handle}".`)
        else { out.posted = true; mine = r.match }
      })
      if (out.blocker === 'wrongChannel') return out
    }
  }

  // ghim: khong ghim duoc chi ghi nhat ky (co kenh khong co quyen ghim); ket qua that xem sau khi tai lai trang
  let pinTry = ''
  const tryPin = async (name) => {
    try { pinTry = await step(name, () => pinOnce(page, text, who)) } catch (e) {
      if (stopped(e)) throw e
      await page.press('Escape').catch(() => {})
      pinTry = 'error'
      log('info', `Chưa ghim được bình luận: ${e.message}`)
    }
    if (PIN_WHY[pinTry]) log('info', `Chưa ghim được bình luận: ${PIN_WHY[pinTry]}.`)
    return pinTry
  }
  if (text && pin && mine && !mine.pinned) await tryPin('Ghim bình luận')

  // ---- kiem lai sau khi tai lai trang: chi tin dieu YouTube da luu ----
  if (!like && !text) return out
  // doc phan binh luan sau khi tai lai: { pinned, found } (binh luan ghim luon dung dau: luot dau phai la cua kenh + huy hieu)
  const readComments = async () => {
    const first = await page.until((s) => window.__ya.count({ selector: s.thread, within: s.comments }), [WATCH], { timeout: Math.min(page.timeout, 8000) })
      .then(() => scanThreads(page, text, who)).then((r) => r.first).catch(() => null)
    const pinned = !!(first && first.ours && first.pinned)
    return { pinned, found: pinned ? first : await seekMine(page, text, who, { pages, log }) }
  }
  try {
    await step('Kiểm tra lại sau khi tải lại trang', async () => {
      await openWatch(page, url)
      if (like) {
        // nut Thich co the nhan trang thai muon mot chut sau khi trang tai xong
        const p = await page.until((t) => { const el = window.__ya.one(t); return !!el && el.getAttribute('aria-pressed') === 'true' }, [likeTarget], { timeout: 3000 }).catch(() => false)
        if (!p && out.liked) await warn('like', 'tai-lai-thich', 'Sau khi tải lại trang, video chưa được thích (YouTube không lưu lượt thích).')
        out.liked = !!p
      }
      if (!text) return
      const b = await openComments(page).catch(() => null)
      if (!b || b.off) {
        await warn('comment', 'tai-lai-binh-luan', b ? 'Sau khi tải lại trang, phần bình luận đã bị tắt.' : 'Sau khi tải lại trang không thấy phần bình luận.')
        return
      }
      const r = await readComments()
      out.pinned = r.pinned
      out.commented = !!r.found
      // luc dang chua thay nhung tai lai thi co binh luan cua kenh: khong con la loi
      if (r.found) for (let i = warnings.length - 1; i >= 0; i--) if (/^Đã bấm "Bình luận" nhưng không thấy/.test(warnings[i])) warnings.splice(i, 1)
      if (!r.found) {
        await warn('comment', 'tai-lai-binh-luan', out.posted
          ? 'Đã đăng bình luận nhưng tải lại trang thì không thấy nữa (YouTube có thể giữ lại để xét duyệt / coi là spam, nhất là bình luận có đường link).'
          : 'Sau khi tải lại trang không thấy bình luận của kênh dưới video.')
      }
    })
    // binh luan co nhung chua ghim (ghim ngay sau khi dang khong an / mat sau khi tai lai): ghim lai MOT lan tren trang
    // vua tai (binh luan lay tu may chu), roi tai lai kiem. Menu khong co "Ghim" thi khong thu lai.
    if (text && pin && out.commented && !out.pinned && pinTry !== 'nomenu') {
      if ((await tryPin('Ghim lại bình luận')) === 'ok') {
        await step('Kiểm tra lại ghim sau khi tải lại trang', async () => {
          await openWatch(page, url)
          if (await openComments(page).catch(() => null)) out.pinned = (await readComments()).pinned
        })
      }
    }
  } catch (e) {
    if (stopped(e)) throw e
    await warn('verify', 'tai-lai', `Không kiểm lại được trang xem video sau khi tải lại: ${e.message}`)
  }
  if (text && pin && !out.commented) out.pinned = false
  if (text && pin && out.commented && !out.pinned) {
    out.cannotPin = true
    out.pinNote = pinNote(out.liked, out.commented)
    log('info', `Kênh này chưa ghim được bình luận (${PIN_WHY[pinTry] || 'sau khi tải lại trang bình luận không được ghim'}): coi như xong, ghi chú "${out.pinNote}".`)
  }
  log(out.warnings.length ? 'warn' : 'ok', `Trang xem video (đã kiểm lại): ${[like && `thích ${out.liked ? '✓' : '✗'}`, text && `bình luận ${out.commented ? '✓' : '✗'}`, text && pin && `ghim ${out.pinned ? '✓' : out.cannotPin ? '✗ (kênh không ghim được)' : '✗'}`].filter(Boolean).join(', ')}.`)
  return out
}

module.exports = { LABELS, SEL, WATCH, BLOCKED, listVideos, optimizeVideo, videoVisibility, readVisibility, inspectVideo, commentAndPin, pinNote, _t: { markSection, markDialog, triggerInfo, isChecked, isEnabled, sec, playlistItems, READ, scanThreads, commentIdentity, blocker, assertNotBlocked, headerCount, endScreenState, esLocked, openPlaylistDialog } }
// dung lai trong hop thoai tai video len (src/flows/upload.js): cung cac o cua trang Chi tiet video
Object.assign(module.exports._t, { pickRadio, pickOption, setCheckbox, openMore, pickCalendarDay, FIELDS, FIELD_ORDER })
