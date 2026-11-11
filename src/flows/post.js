// Dang mot bai len tab "Bai dang" cua kenh tren youtube.com, nhu nguoi dung. Nguon: 3 video quay
// man hinh (A, B, C = len lich) va HTML that html/yt-11, yt-12 (specs/dang-bai.md muc 7).
// Ham thuan: nhan Page da o dung kenh (ctx.withChannel).
//   createPost(page, input, { urls, log, onStep }) -> { status: 'posted'|'scheduled'|'duplicate', url, line, signal, when }
// input = { type: text|image|poll|image_poll|quiz|video, text, images: [file], options: [{text, image}],
//           answers: [{text, image, correct}], explanation, video (ma 11 ky tu), when (ISO | null),
//           channel: { ucId, handle, name } }
const path = require('path')
const { StepError, sleep } = require('../studio/driver')

// Moi chu / the tool tim tren trang. Regex khong phan biet hoa thuong, nhan ca tieng Anh.
// (HTML) = da thay trong HTML that; (video) = chi thay trong video; (DOAN) = chua thay.
const LABELS = {
  composerTag: 'ytd-backstage-post-dialog-renderer', // (HTML) khung soan bai
  composer: '^(Trạng thái hiển thị|Visibility)\\s*:?$', // (HTML) #header-visibility-label, du phong khi doi ten the
  openComposer: '#commentbox-placeholder', // (HTML) dong "Bat mi ve video tiep theo cua ban" khi khung soan dang dong
  placeholder: '^(Bạn đang nghĩ gì|Gửi lời cảm ơn|Bật mí về video|Hỏi cộng đồng|What.s on your mind|Give (a )?shout|Tease your next|Ask your community)', // (HTML 11/2026) "Bạn đang nghĩ gì?"
  textBox: '#contenteditable-root, [contenteditable="true"], [contenteditable="plaintext-only"]', // (HTML)
  attach: { // (HTML) aria-label cua nut / chu tren nut
    image: '^(Thêm hình ảnh|Hình ảnh|Add (an )?image|Image)$',
    image_poll: '^(Thêm cuộc thăm dò ý kiến dạng hình ảnh|Cuộc thăm dò ý kiến dạng hình ảnh|Add (an )?image poll|Image poll)$',
    poll: '^(Thêm cuộc thăm dò ý kiến dạng văn bản|Cuộc thăm dò ý kiến dạng văn bản|Add (a )?text poll|Text poll)$',
    quiz: '^(Thêm câu đố vui|Câu hỏi|Add (a )?quiz|Quiz)$',
    video: '^(Thêm một video YouTube hiện có|Video|Add an existing YouTube video)$',
  },
  fields: 'input, textarea', // o nhap that (bo nhan noi "Cau tra loi 1" aria-hidden)
  dropZone: '(Kéo tối đa 10 bức ảnh|Drag up to 10)', // (HTML) #dropzone #prompt
  imageInput: '#dropzone input[type=file]', // (HTML) name="Filedata" multiple, co san trong trang
  pickImages: '^(chọn ảnh trong máy tính của bạn|select (images )?from (your )?computer)$', // (HTML) #select-button
  imageThumb: '#thumbnail-drag-drop-area ytd-backstage-multi-image-thumbnail-renderer', // (HTML) o anh nho ben trai
  uploading: '#image-select tp-yt-paper-spinner-lite, #image-select [aria-label=loading]', // (DOAN) dang tai anh
  pollOption: '^(Thêm lựa chọn|Add option)$', // (HTML) placeholder o nhap, toi da 65 ky tu
  pollAdd: '^\\W*(Thêm lựa chọn khác|Add (another|more) option)$', // (HTML) #add-option
  quizAnswer: '^(Câu trả lời|Answer) {n}$', // (HTML) textarea placeholder
  quizAdd: '^\\W*(Thêm câu trả lời|Add answer)$', // (HTML) co the co dau + / icon dung truoc
  quizCorrect: '(Đánh dấu là câu trả lời đúng|Đã đánh dấu là chính xác|Mark(ed)? as correct)', // (HTML) aria-pressed
  addImage: '^(Thêm ảnh vào câu đố|Thêm hình ảnh|Add image( to quiz)?)$', // (HTML) nut anh cua cau tra loi; tham do anh: nut dau dong khong co nhan
  quizExplain: '^(Thêm phần giải thích|Add (an )?explanation)', // (HTML)
  imagePollOption: '^(Lựa chọn|Option) {n}$', // (HTML) textarea placeholder, toi da 36 ky tu
  imagePollAdd: '^\\W*(Thêm lựa chọn|Add option)$', // (HTML) nut
  videoDialog: '(Thêm một video YouTube hiện có|Add an existing YouTube video)', // (video) tieu de hop chon video
  videoSearch: '^(Tìm kiếm trên toàn bộ YouTube hoặc dán URL|Search (all of )?YouTube or paste (a )?URL)', // (video)
  videoViews: '(lượt xem|views)', // (video) dong ket qua
  post: '^(Đăng|Post)$', // (HTML) #submit-button / #post-button
  more: '^(Menu tác vụ|Action menu|More actions)$', // (HTML) mui ten canh "Dang" (#option-menu)
  cancel: '^(Hủy|Cancel)$', // (HTML) #cancel-button
  discard: '^(Hủy bỏ|Bỏ|Discard)$', // (DOAN) neu Huy hoi xac nhan
  scheduleItem: '^(Lên lịch đăng bài|Schedule post)$', // (HTML) ytd-menu-service-item-renderer
  schedPanel: '^(Chọn ngày và giờ để xuất bản bài đăng này|(Choose|Select|Pick) (a )?date and time)', // (HTML) #hint
  datePicker: '#date-picker', timePicker: '#time-picker', tzPicker: '#timezone-picker', // (HTML)
  timeList: '#time-listbox, tp-yt-paper-listbox, [role=listbox]', // (HTML 11/2026) danh sach moc 15 phut cua o gio
  dateInput: '#calendar-dialog input, [aria-label="Enter date"] input', // (HTML) o nhap ngay o dau lich
  // (HTML 11/2026) lich: tp-yt-paper-dialog#calendar-dialog > tp-yt-iron-list#calendar-main > .calendar-month
  // (.calendar-month-label "Nov 2026") > .calendar-week > span.calendar-day (them class disabled / invisible / today / selected)
  calDialog: '#calendar-dialog', calMonth: '.calendar-month', calMonthLabel: '.calendar-month-label', calDay: '.calendar-day',
  calNext: '#next-month button, #next-month', calPrev: '#prev-month button, #prev-month',
  schedButton: '^(Lên lịch|Schedule)$', // (HTML) #submit-button khi dang len lich
  localTz: '(Giờ địa phương|Local time)', // (HTML)
  tabPosted: '^(Đã đăng|Published|Posted)$', // (HTML) tp-yt-paper-tab
  tabScheduled: '^(Đã lên lịch|Scheduled)$',
  tabs: '[role=tab], tp-yt-paper-tab',
  emptyList: '#zero-state-message ytd-post-filter-zero-state-renderer, #scheduling-zero-state-message > *', // (HTML)
  emptyText: '(Xuất bản bài đăng|Bài đăng xuất hiện ở đây|Không có bài đăng|Publish a post|Posts appear here|No (scheduled )?posts)',
  listSpinner: '#spinner-container',
  card: 'ytd-backstage-post-thread-renderer, ytd-backstage-post-renderer, ytd-post-renderer', // (DOAN) the bai
  scheduledLine: '(Đã lên lịch đăng vào|Scheduled for)', // (video) dong gio tren the trong DA LEN LICH
  toast: '^(Đã lên lịch đăng bài|Đã đăng bài|Đã xuất bản|Post scheduled|Post published|Your post (was|has been) (posted|published|scheduled))', // lich: (video); dang ngay: (DOAN)
  error: '#error-message', // (HTML) loi anh trong khung soan
  // (HTML 11/2026) hop thoai "Channel owner needs to verify" (ytd-popup-container > ... > ytw-feature-enablement-info-renderer,
  // nut "Got it"): YouTube khoa tinh nang bai dang cho toi khi chu so huu kenh xac minh. Ban tieng Viet: DOAN.
  ownerVerify: 'ytw-feature-enablement-info-renderer',
  ownerVerifyText: '(channel owner needs to verify|ask the channel owner to complete the verification|chủ sở hữu kênh cần (phải )?xác minh|yêu cầu chủ sở hữu kênh)',
  gotIt: '^(Got it|Đã hiểu|Tôi hiểu|OK)$',
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const IMAGES_MAX = 10
const TYPES = ['text', 'image', 'poll', 'image_poll', 'quiz', 'video']

// ---- ham chay trong trang (window.__yp), cai mot lan moi trang ----
function install(L) {
  const ya = window.__ya
  const norm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
  const C = '[data-ya-composer]'
  const comp = () => document.querySelector(C)
  const btnOf = (el) => (el && (el.closest('button, [role=button], [role=menuitem], [role=option], a') || el))
  const off = (el) => { for (let e = el, i = 0; e && i < 4; e = e.parentElement, i++) if (e.disabled || e.getAttribute('aria-disabled') === 'true') return true; return false }
  const outside = (el) => !el.closest(C) && !el.closest('[role=dialog]') && !el.closest('tp-yt-paper-tooltip')
  const abs = (href) => { try { return new URL(href, location.href).href } catch (_) { return href } }
  const vis = (sel, root = document) => ya.all(root, sel).filter(ya.visible)
  let seq = 0
  const mark = (el, attr) => { if (!el) return ''; const id = `${attr}${++seq}`; el.setAttribute(attr, id); return `[${attr}="${id}"]` }
  const setComposer = (el) => {
    document.querySelectorAll(C).forEach((x) => x !== el && x.removeAttribute('data-ya-composer'))
    el.setAttribute('data-ya-composer', '1')
    document.querySelectorAll('[data-ya-text]').forEach((x) => x.removeAttribute('data-ya-text'))
    const tb = el.querySelector(L.textBox)
    if (tb) tb.setAttribute('data-ya-text', '1')
    return true
  }
  const yp = {
    // Khung soan: the ytd-backstage-post-dialog-renderer; doi ten the thi di len tu dong
    // "Trang thai hien thi:" toi khoi co nut "Dang".
    composer() {
      const cur = comp()
      if (cur && cur.isConnected && ya.visible(cur) && cur.querySelector('[data-ya-text]')) return true
      const tag = vis(L.composerTag)[0]
      if (tag) return setComposer(tag)
      for (const lab of ya.find({ regex: L.composer }, true)) {
        for (let a = lab.parentElement; a && a !== document.body; a = a.parentElement) {
          if (ya.find({ regex: L.post, selector: 'button' }).some((b) => a.contains(b)) || a.querySelector(L.textBox)) return setComposer(a)
        }
      }
      return false
    },
    textVisible() { const t = document.querySelector('[data-ya-text]'); return !!t && ya.visible(t) },
    text() { const t = document.querySelector('[data-ya-text]'); return t && ya.visible(t) ? t.innerText : '' },
    enabled(rx) { const el = ya.find({ regex: rx, within: C, selector: 'button, [role=button]' })[0]; return el ? !off(btnOf(el)) : null },
    error() {
      const c = comp()
      const e = c ? vis(L.error, c).find((x) => norm(x.innerText)) : null
      return e ? e.innerText.trim() : ''
    },
    // Trang thai khung soan de doan "da dang xong" / "dang tai anh"
    state() {
      const ok = yp.composer()
      const c = comp()
      return {
        composer: ok,
        open: ok && yp.textVisible(),
        text: ok ? norm(yp.text()) : '',
        attachVisible: ok && ya.count({ regex: L.attach.image, within: C, selector: 'button' }) > 0,
        postEnabled: ok ? yp.enabled(L.post) : null,
        uploading: !!c && vis(L.uploading, c).length > 0,
        thumbs: c ? vis(L.imageThumb, c).length : 0,
        dropZone: ok && ya.count({ regex: L.dropZone, within: C }) > 0,
        error: yp.error(),
        toast: ya.text({ regex: L.toast }) || '',
      }
    },
    markMore() {
      const b = ya.find({ regex: L.more, within: C, selector: 'button, [role=button]' })[0]
      if (b) return mark(b, 'data-ya-more')
      // du phong: nut ngay sau "Dang"
      const post = btnOf(ya.find({ regex: L.post, within: C, selector: 'button' })[0])
      for (let a = post && post.parentElement, i = 0; a && i < 4; a = a.parentElement, i++) {
        const list = vis('button, [role=button]', a)
        const k = list.indexOf(post)
        if (k >= 0 && list[k + 1]) return mark(list[k + 1], 'data-ya-more')
      }
      return ''
    },
    // Dong chua o nhap (lua chon / cau tra loi): di len toi khoi dau tien co nut.
    markRow(rx) {
      const inp = ya.find({ regex: rx, within: C, selector: L.fields })[0]
      if (!inp) return ''
      for (let a = inp.parentElement; a && !a.matches(C); a = a.parentElement) {
        if (vis('button, [role=button]', a).length) return mark(a, 'data-ya-row')
      }
      return ''
    },
    // what: 'file' = <input type=file> trong dong; 'button' = nut co nhan rx; 'first' = nut co nhan rx, khong co thi nut dau dong
    markInRow(row, what, rx) {
      const r = document.querySelector(row)
      if (!r) return ''
      if (what === 'file') return mark(r.querySelector('input[type=file]'), 'data-ya-file')
      const bs = vis('button, [role=button], [role=checkbox], [role=radio]', r)
      const hit = rx && bs.find((b) => [b.getAttribute('aria-label'), b.getAttribute('title'), b.innerText].some((l) => l && new RegExp(rx, 'i').test(norm(l))))
      return mark(hit || (what === 'first' ? bs[0] : null), 'data-ya-btn')
    },
    rowChecked(row) {
      const r = document.querySelector(row)
      const b = r && r.querySelector('[aria-pressed], [aria-checked]')
      return b ? (b.getAttribute('aria-pressed') || b.getAttribute('aria-checked')) === 'true' : null
    },
    rowHasImage(row) { const r = document.querySelector(row); return !!(r && [...r.querySelectorAll('img')].some((i) => ya.visible(i) && i.getAttribute('src'))) },
    answerChecked(rx) { const r = yp.markRow(rx); return r ? yp.rowChecked(r) : null },
    answerHasImage(rx) { const r = yp.markRow(rx); return !!r && yp.rowHasImage(r) },
    // Hop chon video: dong ket qua co link toi video; bam vao dong chu "luot xem" (khong bam link)
    markVideoRow(id) {
      const dlg = ya.find({ selector: '[role=dialog], tp-yt-paper-dialog, dialog', regex: L.videoDialog })[0]
      if (!dlg) return ''
      const views = new RegExp(L.videoViews, 'i')
      const a = dlg.querySelector(`a[href*="${id}"]`)
      let row = a
      while (row && row !== dlg && !views.test(row.innerText || '')) row = row.parentElement
      if (!a || !row || row === dlg) return ''
      const line = [...row.querySelectorAll('*')].find((x) => ya.visible(x) && !x.closest('a') && views.test(x.innerText || '') && !x.children.length)
      return mark(line || row, 'data-ya-vrow')
    },
    // Khoi chon ngay/gio (HTML yt-12): #date-picker "Oct 27, 2026", #time-picker "12:00 AM",
    // #timezone-picker "(GMT+0700) Gio dia phuong". Doi id thi tim theo kieu chu.
    sched() {
      const pick = (sel) => { const el = vis(sel)[0]; return el ? { sel: mark(el, 'data-ya-dd'), text: el.innerText.trim() } : null }
      let out = { date: pick(L.datePicker), time: pick(L.timePicker), tz: pick(L.tzPicker) }
      if (out.date && out.time && out.tz) return out
      const lab = ya.find({ regex: L.schedPanel })[0]
      if (!lab) return null
      const pats = { date: /\b20\d\d\b/, time: /^\d{1,2}:\d{2}(\s?[ap]\.?m\.?)?\b/i, tz: /gmt|utc|giờ địa phương|local/i }
      for (let a = lab.parentElement; a && a !== document.body; a = a.parentElement) {
        out = {}
        for (const [k, re] of Object.entries(pats)) {
          const el = vis('*', a).filter((x) => re.test(norm(x.innerText || x.value || ''))).pop()
          if (el) { const b = el.closest('button, [role=button], [role=combobox]') || el; out[k] = { sel: mark(b, 'data-ya-dd'), text: (b.innerText || b.value || '').trim() } }
        }
        if (out.date && out.time && out.tz) return out
      }
      return null
    },
    // Danh sach gio (tp-yt-paper-listbox#time-listbox) cua o gio: nam trong cung tp-yt-paper-menu-button voi nut.
    // ready = da het hieu ung mo (iron-dropdown #contentWrapper.animating: noi dung khong nhan chuot).
    // Muc gio cua YouTube dung U+202F ("9:00 AM"): norm() doi moi khoang trang ve " ".
    // Nut o gio: dau danh dau co the mat khi trang ve lai khung lich -> tim lai qua sched()
    timeTrig(trig) {
      const t = document.querySelector(trig)
      if (t && t.isConnected && ya.visible(t)) return t
      const s = yp.sched()
      return s && s.time ? document.querySelector(s.time.sel) : null
    },
    markTimeTrig(trig) { const t = yp.timeTrig(trig); return t ? mark(t, 'data-ya-dd') : '' },
    timeList(trig, want) {
      const t = yp.timeTrig(trig)
      const menu = t && t.closest('tp-yt-paper-menu-button')
      const box = menu && menu.querySelector(L.timeList)
      if (!box || !ya.visible(box)) return null // danh sach dong
      const items = [...box.querySelectorAll('[role=option], tp-yt-paper-item')]
      const i = items.findIndex((x) => norm(x.innerText || x.textContent) === norm(want))
      const wrap = box.closest('#contentWrapper')
      const busy = (wrap && wrap.classList.contains('animating')) || getComputedStyle(items[0] || box).pointerEvents === 'none'
      if (i < 0) return { ready: !busy, idx: -1, sel: '' }
      items[i].scrollIntoView({ block: 'nearest' }) // chi cuon trong danh sach, khong cuon ca trang
      return { ready: !busy, idx: i, sel: mark(items[i], 'data-ya-time') }
    },
    // Du phong khi bam chuot khong chon duoc: 'click' = el.click() (Polymer coi la tap), 'select' = API paper-listbox
    pickTime(trig, i, how) {
      const t = yp.timeTrig(trig)
      const box = t && t.closest('tp-yt-paper-menu-button') && t.closest('tp-yt-paper-menu-button').querySelector(L.timeList)
      if (!box) return false
      const it = box.querySelectorAll('[role=option], tp-yt-paper-item')[i]
      if (how === 'click') { if (!it) return false; it.click(); return true }
      if (typeof box.select === 'function') { box.select(i); return true }
      if ('selected' in box) { box.selected = i; return true }
      return false
    },
    timeIs(trig, want) { const t = yp.timeTrig(trig); return !!t && norm(t.innerText) === norm(want) },
    // O ngay cua lich dang mo: tim thang (theo nhan "Nov 2026" / "thg 11 2026"; khong doc duoc nhan thi theo thu tu tinh
    // tu thang co o "today"), roi o ngay d (bo o disabled / invisible). Khong thay thang -> chi huong bam thang sau / truoc.
    calendarDay(y, m, d) {
      const dlg = vis(L.calDialog)[0] || vis('tp-yt-paper-dialog, [role=dialog]').find((x) => x.querySelector(L.calMonth))
      if (!dlg) return null
      const want = y * 12 + m
      const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      const keyOf = (t) => {
        t = norm(t)
        const yy = /(20\d\d)/.exec(t)
        if (!yy) return null
        let mi = MON.findIndex((x) => new RegExp(`(^|[^a-z])${x}`).test(t))
        if (mi < 0) { const n = /(?:thg|tháng)\s*(\d{1,2})|(?:^|\D)(\d{1,2})\s*[/.-]\s*20\d\d/.exec(t); if (n) mi = Number(n[1] || n[2]) - 1 }
        return mi >= 0 && mi < 12 ? Number(yy[1]) * 12 + mi : null
      }
      const months = [...dlg.querySelectorAll(L.calMonth)]
      let keys = months.map((mo) => { const lab = mo.querySelector(L.calMonthLabel); return keyOf(lab ? lab.textContent : '') })
      if (!keys.some((k) => k !== null)) {
        const i0 = months.findIndex((mo) => mo.querySelector(`${L.calDay}.today`))
        const now = new Date()
        keys = i0 < 0 ? keys : months.map((_, i) => now.getFullYear() * 12 + now.getMonth() + i - i0)
      }
      const at = keys.indexOf(want)
      const seen = keys.filter((k) => k !== null)
      if (at < 0) return { day: '', nav: !seen.length ? '' : Math.max(...seen) < want ? 'next' : Math.min(...seen) > want ? 'prev' : '' }
      const cell = [...months[at].querySelectorAll(L.calDay)].find((c) => norm(c.textContent) === String(d) && !/(^|\s)(invisible|disabled)(\s|$)/.test(c.className) && c.getAttribute('aria-disabled') !== 'true')
      if (!cell) return { day: '', nav: '', off: true }
      cell.scrollIntoView({ block: 'nearest' })
      return { day: mark(cell, 'data-ya-day'), selected: /(^|\s)selected(\s|$)/.test(cell.className) }
    },
    markCalNav(dir) {
      const dlg = vis(L.calDialog)[0] || vis('tp-yt-paper-dialog, [role=dialog]').find((x) => x.querySelector(L.calMonth))
      const b = dlg && vis(dir === 'prev' ? L.calPrev : L.calNext, dlg)[0]
      return b ? mark(b, 'data-ya-calnav') : ''
    },
    calendarOpen() { return !!(vis(L.calDialog)[0] || vis('tp-yt-paper-dialog, [role=dialog]').find((x) => x.querySelector(L.calMonth))) },
    dateIs(want) { const s = yp.sched(); return !!(s && s.date && norm(s.date.text) === norm(want)) },
    // Hop thoai "Channel owner needs to verify": chu + nut "Got it"
    ownerVerify() {
      const re = new RegExp(L.ownerVerifyText, 'i')
      const el = vis(L.ownerVerify)[0] || vis('tp-yt-paper-dialog, [role=dialog], [role=alertdialog]').find((x) => re.test(norm(x.innerText)))
      if (!el) return null
      const box = el.closest('tp-yt-paper-dialog, [role=dialog], ytd-popup-container') || el.parentElement || el
      const b = ya.find({ regex: L.gotIt, selector: 'button, [role=button]' }, true).find((x) => box.contains(x))
      return { text: String(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200), btn: b ? mark(b, 'data-ya-gotit') : '' }
    },
    markDateInput() {
      let el = vis(L.dateInput)[0]
      if (!el) { const act = document.activeElement; const list = vis('input').filter((i) => /\b20\d\d\b/.test(i.value)); el = list.includes(act) ? act : list[list.length - 1] }
      return el ? { sel: mark(el, 'data-ya-date'), value: el.value } : null
    },
    listReady() {
      if (vis(L.listSpinner).length) return ''
      if (vis(L.emptyList).some((x) => norm(x.innerText))) return 'empty'
      if (ya.find({ regex: L.emptyText }).some(outside)) return 'empty'
      if (vis(L.card).some(outside)) return 'cards'
      if (vis('a[href*="/post/"]').some(outside)) return 'cards'
      if (ya.find({ regex: L.scheduledLine }).some(outside)) return 'cards'
      return ''
    },
    postLinks() { return vis('a[href*="/post/"]').filter(outside).map((a) => abs(a.getAttribute('href'))) },
    // The bai trung: chu bai (200 ky tu dau), link video, hoac link /post/ moi (khong co trong before)
    findCard(key, vid, before) {
      // Di len tu chu bai toi khoi dau tien co link /post/ hoac dong "Scheduled for"; gap khoi chua NHIEU bai (nhieu link
      // /post/ khac nhau / nhieu dong gio) la da vuot qua the bai -> thoi (loi 0.7.0: lay nham gio cua bai khac).
      const many = (a) => {
        const links = new Set([...a.querySelectorAll('a[href*="/post/"]')].map((x) => x.getAttribute('href').split('?')[0]))
        const lines = (a.innerText || '').match(new RegExp(L.scheduledLine, 'gi')) || []
        return links.size > 1 || lines.length > 1
      }
      const cardOf = (el) => {
        for (let a = el, i = 0; a && i < 14; a = a.parentElement, i++) {
          if (a.matches && a.matches(C)) return null
          if (a.querySelector && many(a)) return null
          const link = a.querySelector && a.querySelector('a[href*="/post/"]')
          const sched = a.innerText && new RegExp(L.scheduledLine, 'i').test(a.innerText)
          if (link || sched) {
            const line = sched ? (a.innerText.split('\n').find((l) => new RegExp(L.scheduledLine, 'i').test(l)) || '') : ''
            return { url: link ? abs(link.getAttribute('href')) : '', line: line.trim() }
          }
        }
        return null
      }
      if (key) {
        const cards = vis(L.card).filter(outside)
        const pool = cards.length ? cards : vis('*').filter((el) => el.children.length < 8 && outside(el))
        const hits = pool.filter((el) => norm(el.innerText).includes(key))
        const deep = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)))
        for (const el of deep) { const c = cardOf(el); if (c) return c }
      }
      if (vid) for (const a of vis(`a[href*="${vid}"]`)) if (outside(a)) { const c = cardOf(a); if (c) return c }
      if (before) {
        const fresh = vis('a[href*="/post/"]').find((a) => outside(a) && !before.includes(abs(a.getAttribute('href'))))
        if (fresh) return cardOf(fresh)
      }
      return null
    },
  }
  return yp
}
// youtube.com bat Trusted Types: eval(chuoi) / new Function(chuoi) TRONG trang bi chan (loi 0.6.1: tool khong bao
// gio thay khung soan bai). Vi vay ma cai __yp duoc ghep san vao chinh ham gui qua page.eval (executeJavaScript cua
// Electron khong bi CSP chan), khong goi eval trong trang.
const YP_INSTALL = `if (!window.__yp) window.__yp = (${install})(${JSON.stringify(LABELS)}); window.__yp.composer();`
const YP_CALL = `(n, a) => { ${YP_INSTALL} return window.__yp[n](...a) }`
const YP_COUNT = `(x) => { ${YP_INSTALL} return window.__ya.count(x) }`
// Moi lan goi deu tim lai khung soan (trang co the ve lai khung soan, mat dau danh dau).
const inPage = (page, name, ...args) => page.eval(YP_CALL, name, args)
const waitPage = (page, name, args, opts) => page.until(YP_CALL, [name, args], opts)
const describe = (t) => (t.regex ? `/${t.regex}/` : t.selector)
// Thao tac trong khung soan: cho (va danh dau lai khung soan) roi moi bam / go
const C = {
  wait: (page, t, o = {}) => page.until(YP_COUNT, [t], { what: describe(t), ...o }),
  click: async (page, t, o) => { await C.wait(page, t, o); await page.click(t, o) },
  type: async (page, t, v) => { await C.wait(page, t); await page.type(t, v) },
  has: async (page, t) => (await inPage(page, 'composer')) && page.has(t),
  count: async (page, t) => ((await inPage(page, 'composer')) ? page.count(t) : 0),
}

const norm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
const p2 = (n) => String(n).padStart(2, '0')
const W = '[data-ya-composer]'
const inC = (regex, more = {}) => ({ ...(regex ? { regex } : {}), within: W, ...more })
const btn = (regex) => inC(regex, { selector: 'button' })
const field = (regex) => inC(regex, { selector: LABELS.fields })
const nth = (tpl, n) => tpl.replace('{n}', n)

// Kiem tra dau vao truoc khi mo trang
function checkInput(input) {
  const t = input.type || 'text'
  if (!TYPES.includes(t)) throw new StepError(`Không hiểu loại bài "${t}".`, 'kiểm tra')
  const imgs = input.images || []
  if (t === 'image' && imgs.length > IMAGES_MAX) throw new StepError(`Bài có ${imgs.length} ảnh, YouTube chỉ cho tối đa ${IMAGES_MAX}.`, 'kiểm tra')
  if (t === 'image' && !imgs.length) throw new StepError('Bài ảnh nhưng không có ảnh nào.', 'kiểm tra')
  if ((t === 'poll' || t === 'image_poll') && (input.options || []).length < 2) throw new StepError('Thăm dò cần ít nhất 2 lựa chọn.', 'kiểm tra')
  if (t === 'quiz' && ((input.answers || []).length < 2 || (input.answers || []).filter((a) => a.correct).length !== 1)) throw new StepError('Đố vui cần 2–4 câu trả lời và đúng một câu đúng.', 'kiểm tra')
  if (t === 'video' && !/^[\w-]{11}$/.test(input.video || '')) throw new StepError('Bài chia sẻ video thiếu mã video hợp lệ.', 'kiểm tra')
  if (t === 'text' && !String(input.text || '').trim()) throw new StepError('Bài chữ nhưng không có chữ.', 'kiểm tra')
}

// Gio len lich: lam tron len moc 15 phut (o gio chi co cac moc nay); qua gan / da qua -> dang ngay
function scheduleTime(when, log = () => {}) {
  if (!when) return null
  const d = new Date(when)
  if (isNaN(d)) return null
  d.setSeconds(0, 0)
  if (d.getMinutes() % 15) d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15)
  if (d.getTime() < Date.now() + 5 * 60e3) {
    log('warn', `Giờ đăng ${d.toLocaleString('vi-VN')} đã qua hoặc quá gần, đăng ngay.`)
    return null
  }
  return d
}

// Chon file: co san <input type=file> thi dat thang; khong thi bam nut va chan hop thoai cua
// he dieu hanh qua CDP (Page.setInterceptFileChooserDialog) roi dat file vao o trang vua tao.
async function chooseFiles(page, { input, button }, files) {
  if (input && (await page.has({ selector: input, hidden: true }))) return page.setFiles({ selector: input, hidden: true }, files)
  if (!button) throw new StepError('Không tìm thấy ô chọn ảnh.', page.step)
  const dbg = page.wc.debugger
  const attached = dbg.isAttached()
  if (!attached) dbg.attach('1.3')
  let onMsg
  try {
    await dbg.sendCommand('Page.enable')
    await dbg.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true })
    const opened = new Promise((res) => { onMsg = (_e, method, params) => { if (method === 'Page.fileChooserOpened') res(params) }; dbg.on('message', onMsg) })
    await page.click(button)
    const p = await Promise.race([opened, sleep(6000).then(() => null)])
    if (!p) throw new StepError('Đã bấm nút chọn ảnh nhưng trang không mở ô chọn file.', page.step)
    await dbg.sendCommand('DOM.setFileInputFiles', { backendNodeId: p.backendNodeId, files: files.map((f) => path.resolve(f)) })
  } finally {
    if (onMsg) dbg.removeListener('message', onMsg)
    await dbg.sendCommand('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {})
    if (!attached) dbg.detach()
  }
  await sleep(300)
}

const composer = (page, timeout) => waitPage(page, 'composer', [], { timeout, what: 'khung soạn bài (ytd-backstage-post-dialog-renderer)' })

// Mo tab DA DANG / DA LEN LICH va cho danh sach hien
async function openTab(page, which) {
  await page.click({ regex: which === 'sched' ? LABELS.tabScheduled : LABELS.tabPosted, selector: LABELS.tabs })
  await sleep(300)
  try { return await waitPage(page, 'listReady', [], { timeout: 10000, what: 'danh sách bài đăng' }) } catch (_) { return '' }
}

// Mo khung soan (dang dong thi bam dong "Bat mi ve video..."), go chu, dong goi y @
async function typeText(page, text) {
  await composer(page)
  if (!(await inPage(page, 'textVisible'))) {
    const bySel = inC(undefined, { selector: LABELS.openComposer })
    await C.click(page, (await C.has(page, bySel)) ? bySel : inC(LABELS.placeholder))
    await waitPage(page, 'textVisible', [], { timeout: 8000, what: 'ô soạn chữ mở ra' })
  }
  await page.type({ selector: '[data-ya-text]' }, text)
  if (/[@#]/.test(text)) await page.press('Escape')
}

async function ensureText(page, text) {
  if (!text) return
  if (norm(await inPage(page, 'text')) === norm(text)) return
  await typeText(page, text)
  if (norm(await inPage(page, 'text')) !== norm(text)) throw new StepError('Không gõ được nội dung bài vào ô soạn.', page.step)
}

// ---- tung loai bai ----
async function attachImages(page, files, log) {
  await C.click(page, btn(LABELS.attach.image))
  await C.wait(page, inC(LABELS.dropZone))
  await chooseFiles(page, { input: `${W} ${LABELS.imageInput}`, button: btn(LABELS.pickImages) }, files)
  // cho tai len: so o anh = so file, het vong xoay, nut Dang sang
  let stable = 0
  const end = Date.now() + 60000 + files.length * 10000
  for (;;) {
    if (page.shouldStop()) throw new StepError('Đã dừng theo yêu cầu.', page.step)
    const s = await inPage(page, 'state')
    if (s.error) throw new StepError(`YouTube báo: ${s.error}`, page.step)
    if (!s.uploading && s.postEnabled && !s.dropZone) {
      if (s.thumbs >= files.length) return
      if (s.thumbs === 0 && ++stable >= 8) { log('warn', 'Không đếm được ảnh đã tải lên, coi như xong vì nút Đăng đã sáng.'); return }
    }
    if (Date.now() > end) throw new StepError(`Tải ảnh quá lâu (${s.thumbs}/${files.length} ảnh).`, page.step)
    await sleep(250)
  }
}

async function fillOptions(page, { open, field: f, add, max }, values) {
  await C.click(page, btn(open))
  await C.wait(page, field(nth(f, 1)))
  const all = field(f.includes('{n}') ? f.replace(' {n}', ' \\d+') : f)
  const count = () => C.count(page, all)
  for (let guard = 0; (await count()) < values.length; guard++) {
    if (guard > max || !(await C.has(page, btn(add)))) throw new StepError(`Không thêm được lựa chọn thứ ${(await count()) + 1} (YouTube cho tối đa ${await count()}).`, page.step)
    await C.click(page, btn(add))
  }
  for (let i = 0; i < values.length; i++) await C.type(page, f.includes('{n}') ? field(nth(f, i + 1)) : { ...all, nth: i }, values[i])
}

const attachPoll = (page, options) => fillOptions(page, { open: LABELS.attach.poll, field: LABELS.pollOption, add: LABELS.pollAdd, max: 4 }, options.map((o) => o.text))

async function attachImagePoll(page, options) {
  await fillOptions(page, { open: LABELS.attach.image_poll, field: LABELS.imagePollOption, add: LABELS.imagePollAdd, max: 8 }, options.map((o) => o.text))
  for (let i = 0; i < options.length; i++) {
    if (!options[i].image) continue
    const rx = nth(LABELS.imagePollOption, i + 1)
    const row = await waitPage(page, 'markRow', [rx], { timeout: 5000, what: `ô của lựa chọn ${i + 1}` })
    const input = await inPage(page, 'markInRow', row, 'file')
    const button = await inPage(page, 'markInRow', row, 'first', LABELS.addImage) // nut tron xanh dau dong, khong co nhan
    await chooseFiles(page, { input, button: button && { selector: button } }, [options[i].image])
    await waitPage(page, 'answerHasImage', [rx], { timeout: 30000, what: `ảnh của lựa chọn ${i + 1}` })
  }
}

async function attachQuiz(page, answers, explanation) {
  await fillOptions(page, { open: LABELS.attach.quiz, field: LABELS.quizAnswer, add: LABELS.quizAdd, max: 4 }, answers.map((a) => a.text))
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i]
    const rx = nth(LABELS.quizAnswer, i + 1)
    if (a.correct && (await inPage(page, 'answerChecked', rx)) !== true) {
      const row = await waitPage(page, 'markRow', [rx], { timeout: 5000, what: `dòng của câu trả lời ${i + 1}` })
      const b = await inPage(page, 'markInRow', row, 'first', LABELS.quizCorrect)
      if (!b) throw new StepError('Không tìm thấy nút đánh dấu câu trả lời đúng.', page.step)
      await page.click({ selector: b })
      if ((await inPage(page, 'answerChecked', rx)) === false) throw new StepError(`Không đánh dấu được câu trả lời ${i + 1} là câu đúng.`, page.step)
    }
    if (a.image) {
      const row = await waitPage(page, 'markRow', [rx], { timeout: 5000, what: `dòng của câu trả lời ${i + 1}` })
      const input = await inPage(page, 'markInRow', row, 'file')
      const button = await inPage(page, 'markInRow', row, 'button', LABELS.addImage)
      await chooseFiles(page, { input, button: button && { selector: button } }, [a.image])
      await waitPage(page, 'answerHasImage', [rx], { timeout: 30000, what: `ảnh của câu trả lời ${i + 1}` })
    }
  }
  if (explanation) await C.type(page, inC(LABELS.quizExplain, { selector: 'textarea, input' }), explanation)
}

async function attachVideo(page, id) {
  await C.click(page, btn(LABELS.attach.video))
  const dialog = { selector: '[role=dialog], tp-yt-paper-dialog, dialog', regex: LABELS.videoDialog }
  await page.waitFor(dialog)
  await page.type({ regex: LABELS.videoSearch, selector: 'input' }, `https://www.youtube.com/watch?v=${id}`)
  await page.press('Enter')
  const row = await waitPage(page, 'markVideoRow', [id], { timeout: 20000, what: `video ${id} trong kết quả tìm kiếm` })
  await page.click({ selector: row })
  await page.waitGone(dialog, { timeout: 10000 })
}

// ---- len lich (video C + HTML yt-12) ----
const dateText = (d, sample) => {
  if (/^[a-z]{3,}/i.test(sample)) return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` // Oct 29, 2026
  if (/thg/i.test(sample)) return `${d.getDate()} thg ${d.getMonth() + 1}, ${d.getFullYear()}`
  if (/^\d{4}-/.test(sample)) return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`
}
const timeText = (d, sample) => (/[ap]\.?m/i.test(sample)
  ? `${(d.getHours() % 12) || 12}:${p2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}` // 7:00 PM
  : `${p2(d.getHours())}:${p2(d.getMinutes())}`)

// Chon gio trong danh sach (loi 0.6.2 tren YouTube that: danh sach mo, chuot bam vao "9:00 AM" nhung o gio van
// "12:00 AM"). Cho danh sach het hieu ung mo roi bam chuot that; khong an thi bam bang ma (el.click()), roi
// API select() cua paper-listbox. Moi cach deu kiem lai chu tren o gio.
async function pickTime(page, trig, want, log = () => {}) {
  for (const how of ['mouse', 'click', 'select']) {
    if (!(await inPage(page, 'timeList', trig, want))) {
      const sel = await inPage(page, 'markTimeTrig', trig)
      if (!sel) throw new StepError('Không thấy ô chọn giờ.', page.step)
      await page.click({ selector: sel })
    }
    let st = await waitPage(page, 'timeList', [trig, want], { timeout: 8000, what: 'danh sách giờ' }).catch(() => null)
    // cho het hieu ung mo (noi dung danh sach chua nhan chuot)
    const end = Date.now() + 5000
    while (st && !st.ready && Date.now() < end) { await sleep(150); st = await inPage(page, 'timeList', trig, want) }
    if (!st) continue
    if (st.idx < 0) { await page.press('Escape'); throw new StepError(`Danh sách giờ không có mốc ${want}.`, page.step) }
    await sleep(200)
    if (how === 'mouse') await page.click({ selector: st.sel }, { after: 0 })
    else if (!(await inPage(page, 'pickTime', trig, st.idx, how))) continue
    const ok = await waitPage(page, 'timeIs', [trig, want], { timeout: 2500, what: `ô giờ hiện ${want}` }).catch(() => false)
    if (ok) {
      if (how !== 'mouse') log('info', `Đã chọn giờ ${want} (cách dự phòng: ${how === 'click' ? 'bấm bằng mã' : 'chọn qua danh sách'}).`)
      if (await inPage(page, 'timeList', trig, want)) await page.press('Escape')
      return
    }
  }
  if (await inPage(page, 'timeList', trig, want)) await page.press('Escape')
}

// Chon ngay: mo lich, bam dung o ngay (nhu nguoi dung; loi 0.7.0 tren YouTube that: go ngay vao o nhap + Enter doi
// nhan ngay nhung bai van len lich ngay cu), lich chua toi thang can thi bam thang sau / truoc. Khong bam duoc o ngay
// thi du phong: go vao o nhap o dau lich dung kieu dang hien ("Oct 29, 2026") + Enter. Moi cach deu kiem lai nhan ngay.
async function pickDate(page, trig, at, wantDate, log = () => {}) {
  const open = async () => { if (!(await inPage(page, 'calendarOpen'))) await page.click({ selector: trig }) }
  await open()
  let r = null
  for (let i = 0; i < 26; i++) {
    r = await waitPage(page, 'calendarDay', [at.getFullYear(), at.getMonth(), at.getDate()], { timeout: 8000, what: 'lịch chọn ngày' }).catch(() => null)
    if (!r || r.day || !r.nav) break
    const nav = await inPage(page, 'markCalNav', r.nav)
    if (!nav) break
    await page.click({ selector: nav }, { after: 300 })
  }
  if (r && r.day) {
    await sleep(200)
    await page.click({ selector: r.day }, { after: 0 })
    if (await waitPage(page, 'dateIs', [wantDate], { timeout: 3000, what: `ô ngày hiện ${wantDate}` }).catch(() => false)) {
      await sleep(300)
      if (await inPage(page, 'calendarOpen')) await page.press('Escape')
      return
    }
  }
  // du phong: go ngay
  await open()
  const inp = await waitPage(page, 'markDateInput', [], { timeout: 8000, what: 'ô nhập ngày trong lịch' })
  await page.type({ selector: inp.sel }, dateText(at, inp.value))
  await page.press('Enter')
  await sleep(400)
  if (await inPage(page, 'dateIs', wantDate)) log('info', `Đã chọn ngày ${wantDate} (cách dự phòng: gõ ngày vào ô nhập của lịch).`)
}

async function setSchedule(page, at, log) {
  // mui ten "Menu tac vu" canh "Dang" -> "Len lich dang bai"
  const more = await inPage(page, 'markMore')
  if (!more) throw new StepError('Không tìm thấy nút mũi tên cạnh "Đăng".', page.step)
  await page.click({ selector: more })
  await page.click({ regex: LABELS.scheduleItem })
  let dd = await waitPage(page, 'sched', [], { timeout: 10000, what: 'ô chọn ngày giờ đăng' })
  const wantDate = dateText(at, dd.date.text)
  if (norm(dd.date.text) !== norm(wantDate)) {
    await pickDate(page, dd.date.sel, at, wantDate, log)
    dd = await waitPage(page, 'sched', [], { timeout: 5000, what: 'ô chọn ngày giờ đăng' })
    if (norm(dd.date.text) !== norm(wantDate)) {
      if (await inPage(page, 'calendarOpen')) await page.press('Escape')
      throw new StepError(`Không chọn được ngày ${wantDate} (ô ngày đang là "${dd.date.text}").`, page.step)
    }
  }
  // gio: mo danh sach moc 15 phut (#time-listbox), bam dung muc
  const wantTime = timeText(at, dd.time.text)
  if (norm(dd.time.text) !== norm(wantTime)) {
    await pickTime(page, dd.time.sel, wantTime, log)
    dd = await waitPage(page, 'sched', [], { timeout: 5000, what: 'ô chọn ngày giờ đăng' })
    if (norm(dd.time.text) !== norm(wantTime)) throw new StepError(`Không chọn được giờ ${wantTime} (ô giờ đang là "${dd.time.text}").`, page.step)
  }
  if (!new RegExp(LABELS.localTz, 'i').test(dd.tz.text)) log('warn', `Múi giờ đang là "${dd.tz.text}", không phải giờ địa phương: giờ đăng có thể lệch.`)
  return `${p2(at.getHours())}:${p2(at.getMinutes())} ${at.getDate()} thg ${at.getMonth() + 1}, ${at.getFullYear()}`
}

// Doan "da dang xong": thong bao, hoac khung soan ve trang thai dong (o chu an / trong, hien lai
// cac nut dinh kem, nut Dang mo). Loi trang bao (#error-message) thi dung ngay.
const OWNER_VERIFY_MSG = (name) => `YouTube không cho đăng bài lên kênh${name ? ` "${name}"` : ''}: hiện hộp thoại "Channel owner needs to verify" (chủ sở hữu kênh cần xác minh). Tài khoản đang dùng không phải chủ sở hữu kênh, hoặc chủ sở hữu chưa xác minh kênh để mở tính năng này. Hãy để chủ sở hữu kênh tự xác minh trong YouTube Studio (Cài đặt → Kênh → Điều kiện sử dụng tính năng) rồi đăng lại. Tool không tự xác minh.`

// Hop thoai "Channel owner needs to verify" dang hien -> dong (Got it) va bao loi OWNER_VERIFY (dung cac bai con lai cua kenh)
async function checkOwnerVerify(page, name) {
  let v = null
  try { v = await inPage(page, 'ownerVerify') } catch (_) { return }
  if (!v) return
  if (v.btn) await page.click({ selector: v.btn }).catch(() => {})
  throw Object.assign(new StepError(OWNER_VERIFY_MSG(name), page.step), { code: 'OWNER_VERIFY' })
}

// Gio tren the bai DA LEN LICH -> Date (gio may). "Scheduled for Nov 12, 2026, 12:00 AM (local time)",
// "Đã lên lịch đăng vào 00:00 13 thg 11, 2026 (giờ địa phương)", "13/11/2026 00:00"... Khong doc duoc -> null.
const MON_RE = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec'
function parseSchedLine(line) {
  const t = norm(line)
  const tm = /(\d{1,2}):(\d{2})(?:\s*(sa|ch|[ap])\.?(?:\s*m\b\.?)?)?/.exec(t)
  if (!tm) return null
  let h = Number(tm[1])
  const ap = { sa: 'a', ch: 'p' }[tm[3]] || tm[3]
  if (ap === 'p' && h < 12) h += 12
  if (ap === 'a' && h === 12) h = 0
  let y, mo, d
  let m = new RegExp(`\\b(${MON_RE})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`).exec(t)
  if (m) { mo = MON_RE.split('|').indexOf(m[1]); d = Number(m[2]); y = Number(m[3]) }
  if (!m) { m = new RegExp(`\\b(\\d{1,2})\\s+(${MON_RE})[a-z]*\\.?,?\\s+(\\d{4})`).exec(t); if (m) { d = Number(m[1]); mo = MON_RE.split('|').indexOf(m[2]); y = Number(m[3]) } }
  if (!m) { m = /\b(\d{1,2})\s*(?:thg|tháng)\s*(\d{1,2}),?\s*(?:năm\s*)?(\d{4})/.exec(t); if (m) { d = Number(m[1]); mo = Number(m[2]) - 1; y = Number(m[3]) } }
  if (!m) { m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t); if (m) { d = Number(m[1]); mo = Number(m[2]) - 1; y = Number(m[3]) } }
  if (!m) { m = /\b(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t); if (m) { y = Number(m[1]); mo = Number(m[2]) - 1; d = Number(m[3]) } }
  if (!m || mo < 0) return null
  const out = new Date(y, mo, d, h, Number(tm[2]), 0, 0)
  return out.getDate() === d ? out : null
}
const fmtVi = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())} ${d.getDate()} thg ${d.getMonth() + 1}, ${d.getFullYear()}`

async function waitPublished(page, timeout = 45000, name = '') {
  const end = Date.now() + timeout
  for (;;) {
    if (page.shouldStop()) throw new StepError('Đã dừng theo yêu cầu.', page.step)
    await checkOwnerVerify(page, name)
    let s = null
    try { s = await inPage(page, 'state') } catch (_) { /* trang dang ve lai */ }
    if (s) {
      if (s.error) throw new StepError(`YouTube báo: ${s.error}`, page.step)
      if (s.toast) return `thông báo "${s.toast}"`
      if (s.composer && !s.text && s.attachVisible && s.postEnabled === false) return 'khung soạn đã trống'
    }
    if (Date.now() > end) throw new StepError(`Quá ${Math.round(timeout / 1000)} giây không thấy dấu hiệu đăng xong.`, page.step)
    await sleep(300)
  }
}

async function findCard(page, tab, key, vid, before, timeout = 15000) {
  const end = Date.now() + timeout
  let reopened = false
  await openTab(page, tab)
  for (;;) {
    const c = await inPage(page, 'findCard', key, vid, before)
    if (c) return c
    if (Date.now() > end) return null
    if (!reopened && Date.now() > end - timeout / 2) { reopened = true; await openTab(page, tab === 'sched' ? 'pub' : 'sched'); await openTab(page, tab) }
    await sleep(500)
  }
}

async function cancelComposer(page) {
  try {
    if (!(await inPage(page, 'composer'))) return
    if (await C.has(page, btn(LABELS.cancel))) await C.click(page, btn(LABELS.cancel))
    if (await page.has({ regex: LABELS.discard, selector: 'button' })) await page.click({ regex: LABELS.discard, selector: 'button' })
  } catch (_) { /* bo qua */ }
}

async function createPost(page, input, { urls, log = () => {}, onStep = () => {} } = {}) {
  const type = input.type || 'text'
  const text = String(input.text || '').replace(/\r\n/g, '\n').trim()
  checkInput({ ...input, type })
  const at = scheduleTime(input.when, log)
  const ch = input.channel || {}
  const key = norm(text).slice(0, 200)
  const vid = type === 'video' ? input.video : ''

  onStep('open')
  await page.run('Mở tab Bài đăng của kênh', async () => {
    const handle = ch.handle ? (ch.handle.startsWith('@') ? ch.handle : `@${ch.handle}`) : ''
    if (!ch.ucId && !handle) throw new StepError('Thiếu mã kênh (UC…) hoặc @handle để mở tab Bài đăng.', page.step)
    await page.goto(`${urls.youtube}/${ch.ucId ? `channel/${ch.ucId}` : handle}/posts`)
    await page.waitFor({ regex: LABELS.tabPosted, selector: LABELS.tabs }, { timeout: 30000 })
    try { await composer(page, 15000) } catch (_) {
      throw new StepError('Không thấy khung soạn bài ở tab Bài đăng: tài khoản đang mở không phải chủ kênh này, hoặc kênh chưa dùng được tính năng bài đăng.', page.step)
    }
  })

  onStep('check')
  const before = await page.run('Kiểm tra bài trùng (ĐÃ ĐĂNG / ĐÃ LÊN LỊCH)', async () => {
    const links = { pub: [], sched: [] }
    if (!key && !vid) log('info', 'Bài không có chữ: không kiểm tra được bài trùng.')
    for (const tab of ['sched', 'pub']) { // ket thuc o tab DA DANG
      const ready = await openTab(page, tab)
      if (!ready) log('warn', `Không đọc được danh sách ${tab === 'sched' ? 'ĐÃ LÊN LỊCH' : 'ĐÃ ĐĂNG'}, bỏ qua kiểm tra trùng ở tab này.`)
      links[tab] = await inPage(page, 'postLinks')
      if (key || vid) {
        const c = await inPage(page, 'findCard', key, vid, null)
        if (c) return { dup: { ...c, tab } }
      }
    }
    return links
  })
  if (before.dup) {
    log('warn', `Đã có bài trùng nội dung ở ${before.dup.tab === 'sched' ? 'ĐÃ LÊN LỊCH' : 'ĐÃ ĐĂNG'}, không đăng lại.`)
    return { status: 'duplicate', url: before.dup.url, line: before.dup.line, when: null }
  }

  try {
    onStep('compose')
    await page.run('Soạn nội dung', async () => {
      await composer(page)
      if (text) await typeText(page, text)
    })
    onStep('attach')
    await page.run(`Gắn ${type === 'image' ? `${input.images.length} ảnh` : type === 'video' ? 'video' : type === 'text' ? 'chữ' : 'lựa chọn'}`, async () => {
      if (type === 'image') await attachImages(page, input.images, log)
      else if (type === 'poll') await attachPoll(page, input.options)
      else if (type === 'image_poll') await attachImagePoll(page, input.options)
      else if (type === 'quiz') await attachQuiz(page, input.answers, input.explanation)
      else if (type === 'video') await attachVideo(page, vid)
      await ensureText(page, text)
      await waitPage(page, 'enabled', [LABELS.post], { timeout: 15000, what: 'nút "Đăng" sáng lên (còn thiếu thông tin?)' })
    })
    onStep('publish')
    let line = ''
    await page.run(at ? `Lên lịch lúc ${at.toLocaleString('vi-VN')}` : 'Bấm Đăng', async () => {
      if (at) {
        line = await setSchedule(page, at, log)
        await C.click(page, btn(LABELS.schedButton))
      } else {
        await C.click(page, btn(LABELS.post))
      }
    })
    onStep('verify')
    const signal = await page.run('Chờ YouTube xác nhận', () => waitPublished(page, 45000, ch.name))
    log('info', `YouTube xác nhận: ${signal}.`)
    const card = await page.run('Tìm bài vừa đăng', () => findCard(page, at ? 'sched' : 'pub', key, vid, at ? before.sched : before.pub))
    if (!card) log('warn', 'Đã đăng nhưng chưa thấy bài trong danh sách để lấy đường dẫn.')
    // so gio YouTube ghi tren the bai voi gio muon (doc ca "Scheduled for Nov 12, 2026, 12:00 AM" lan "00:00 12 thg 11, 2026")
    let mismatch = ''
    if (at && card && card.line) {
      const got = parseSchedLine(card.line)
      if (!got) log('info', `Không đọc được giờ trên thẻ bài ("${card.line}") để so với giờ mong muốn ${line}.`)
      else if (got.getTime() !== at.getTime()) {
        mismatch = `YouTube lên lịch bài lúc ${fmtVi(got)} ("${card.line}"), khác giờ mong muốn ${line}. Hãy sửa giờ bài này trong tab Đã lên lịch của kênh.`
        log('error', mismatch)
      }
    }
    return { status: at ? 'scheduled' : 'posted', url: (card && card.url) || '', line: (card && card.line) || '', signal, when: at ? at.toISOString() : null, mismatch }
  } catch (e0) {
    let e = e0
    await page.snapshot('dang-bai-loi')
    if (e.code !== 'OWNER_VERIFY') { try { await checkOwnerVerify(page, ch.name) } catch (v) { e = v } }
    await cancelComposer(page)
    throw e
  }
}

module.exports = { createPost, LABELS, scheduleTime, dateText, timeText, chooseFiles, parseSchedLine }
