// Hop thu binh luan cua YouTube Studio (Cong dong → Binh luan): doc binh luan chua phan hoi
// (ca video, Shorts va bai dang) va tra loi tung binh luan nhu nguoi dung (video "Tra loi binh luan").
// Ham thuan: nhan Page DA chuyen dung kenh (ctx.withChannel), khong tu dang nhap / chuyen kenh.
const { StepError, channelOf, sleep } = require('../studio/driver')

// Moi chu tool tim tren trang (tieng Viet + tieng Anh), doi chieu voi HTML that html/yt-6-comments-inbox.html.
const LABELS = {
  tabComments: '^(Bình luận|Comments)$',
  statusChip: '^(Trạng thái phản hồi|Response status)\\s*:',
  statusChipOk: '^(Trạng thái phản hồi|Response status)\\s*:\\s*(Chưa phản hồi|Not responded|Unresponded)',
  statusMenu: '^(Trạng thái phản hồi|Response status)$',
  notResponded: '^(Chưa phản hồi|Not responded|Unresponded)$',
  apply: '^(Áp dụng|Apply)$',
  reply: '^(Phản hồi|Reply)$', // nut mo o tra loi
  replyInput: '^(Phản hồi\\.\\.\\.|Phản hồi…|Thêm phản hồi\\.\\.\\.|Thêm phản hồi…|Add a reply\\.\\.\\.|Add a reply…|Reply\\.\\.\\.)$',
  cancel: '^(Hủy|Huỷ|Cancel)$',
  submit: '^(Phản hồi|Reply)$', // nut gui (ben phai nut Huy)
  toast: '^(Đã thêm phản hồi|Reply added)$',
  empty: '(Không có bình luận|Không tìm thấy bình luận|No comments|No results)',
}
// Cau truc hang binh luan theo HTML that: ytcp-comment-thread > ytcp-comment[comment-id] (+ #reply-dialog-container
// > ytcp-commentbox) va ytcp-comment-replies > ytcp-comment[is-reply]. Selector dau tien la cua Studio, sau la du phong.
const SEL = {
  thread: 'ytcp-comment-thread',
  comment: 'ytcp-comment',
  replies: 'ytcp-comment-replies',
  author: '#name .author-text, #name, #author-text',
  time: '.published-time-text, #published-time-text',
  text: '#content-text',
  content: '#video-title',
  contentLink: 'ytcp-comment-video-thumbnail a[href], a#video-title',
  contentImg: 'ytcp-comment-video-thumbnail img',
  // chu kenh tra loi: huy hieu trong .comment-badge-container (chua co HTML that cua mot tra loi cua kenh)
  ownerBadge: '.comment-badge-container ytcp-author-comment-badge, .comment-badge-container [is-creator], .owner-badge',
  tab: '#comments-tab, tp-yt-paper-tab, [role=tab]',
  filterIcon: '#filter-icon',
  submit: 'ytcp-commentbox #submit-button button',
}

// Doc tren trang: moi hang -> thong tin binh luan. opts.mark = id thi danh dau hang do de bam.
function scanInbox(sel, opts) {
  const ya = window.__ya
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
  const txt = (el) => (el ? clean(el.innerText !== undefined ? el.innerText : el.textContent) : '')
  const q = (root, s) => {
    for (const one of s.split(',')) { const el = ya.all(root, one.trim())[0]; if (el) return el }
    return null
  }
  const hash = (s) => {
    let h1 = 5381, h2 = 52711
    for (const ch of s) { const c = ch.codePointAt(0); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
  }
  const handleRe = /^@[\w.\-À-ỹ]+/
  for (const el of ya.all(document, '[data-ya-row], [data-ya-top], [data-ya-submit]')) {
    el.removeAttribute('data-ya-row'); el.removeAttribute('data-ya-top'); el.removeAttribute('data-ya-submit')
  }
  const out = []
  for (const th of ya.all(document, sel.thread).filter((x) => ya.visible(x))) {
    const all = ya.all(th, sel.comment)
    const top = all.find((c) => !c.closest(sel.replies) && !c.hasAttribute('is-reply')) || th
    const lines = (top.innerText || '').split('\n').map(clean).filter(Boolean)
    const head = (lines[0] || '').split('•').map(clean)
    const author = txt(q(top, sel.author)) || head[0] || ''
    const ago = txt(q(top, sel.time)) || head[1] || ''
    const text = txt(q(top, sel.text)) || lines[1] || ''
    const content = q(th, sel.content)
    const contentTitle = txt(content)
    const link = q(th, sel.contentLink)
    const href = link ? link.getAttribute('href') || '' : ''
    const img = q(th, sel.contentImg)
    const src = img ? img.getAttribute('src') || '' : ''
    let lc = top.getAttribute ? top.getAttribute('comment-id') || '' : '' // ma binh luan that, giong commentId cua API
    if (!lc) for (const a of ya.all(top, 'a[href*="lc="]')) {
      try { lc = new URL(a.getAttribute('href'), location.href).searchParams.get('lc') || ''; if (lc) break } catch (_) { /* bo */ }
    }
    const replies = all.filter((c) => c !== top && !top.contains(c)).map((r) => {
      const rl = (r.innerText || '').split('\n').map(clean).filter(Boolean)
      return {
        author: txt(q(r, sel.author)) || (rl[0] || '').split('•')[0].trim(),
        text: txt(q(r, sel.text)) || rl[1] || '',
        owner: !!q(r, sel.ownerBadge),
      }
    })
    const want = (opts.handle || '').toLowerCase()
    const ownerReplied = replies.some((r) => r.owner || (want && r.author.toLowerCase() === want))
    const id = lc || `st_${hash(`${author.toLowerCase()}|${text}|${contentTitle}`)}`
    if (opts.mark && opts.mark === id) {
      th.setAttribute('data-ya-row', '1')
      top.setAttribute('data-ya-top', '1')
    }
    out.push({
      id, author, handle: handleRe.test(author) ? author.match(handleRe)[0] : '', ago, text, contentTitle,
      // khong co lien ket noi dung trong HTML that: anh i.ytimg.com/vi/ = video hoac Shorts, con lai = bai dang
      contentType: /\/post\//.test(href) ? 'post' : /\/shorts\//.test(href) ? 'shorts' : href ? 'video'
        : /ytimg\.com\/vi(_webp)?\//.test(src) ? 'video' : src ? 'post' : '',
      ownerReplied, replies,
    })
  }
  return out
}

// Cuon toi hang cuoi de Studio tai them binh luan.
function scrollMore(sel) {
  const ya = window.__ya
  const rows = ya.all(document, sel.thread)
  const last = rows[rows.length - 1]
  if (last) last.scrollIntoView({ block: 'end' })
  return rows.length
}

// "43 phút trước" / "2 hours ago" -> thoi diem (uoc chung). Khong doc duoc -> ''.
const UNITS = [
  [/giây|second/i, 1e3], [/phút|minute/i, 60e3], [/giờ|hour/i, 3600e3], [/ngày|day/i, 86400e3],
  [/tuần|week/i, 7 * 86400e3], [/tháng|month/i, 30 * 86400e3], [/năm|year/i, 365 * 86400e3],
]
function parseAgo(ago, now = Date.now()) {
  const m = /(\d+)\s*([^\d\s(]+)/.exec(String(ago || ''))
  if (!m) return ''
  const u = UNITS.find(([re]) => re.test(m[2]))
  return u ? new Date(now - Number(m[1]) * u[1]).toISOString() : ''
}

// ---- mo hop thu ---------------------------------------------------------------------
// Bo loc trong dia chi y nhu Studio cua anh: Phu hop nhat, Chua phan hoi, Video + Shorts + Bai dang.
const INBOX_FILTER = [
  { isDisabled: false, isPinned: true, name: 'SORT_BY', value: 'SORT_BY_MOST_RELEVANT' },
  { name: 'ENGAGED_STATUS', value: ['COMMENT_CATEGORY_NOT_ENGAGED'] },
  { name: 'PARENT_ENTITY_CONTENT_TYPE', value: ['PARENT_ENTITY_CONTENT_TYPE_WATCH', 'PARENT_ENTITY_CONTENT_TYPE_SHORT', 'PARENT_ENTITY_CONTENT_TYPE_CREATOR_POST'] },
]
const inboxUrl = (studio, uc) => `${studio}/channel/${uc}/comments/inbox?filter=${encodeURIComponent(JSON.stringify(INBOX_FILTER))}`

// uc bo trong: lay tu dia chi trang hien tai (withChannel da chuyen dung kenh).
async function openInbox(page, uc, { urls, log = () => {} } = {}) {
  uc = uc || channelOf(page.url())
  if (!uc) throw new StepError('Không biết UC ID của kênh để mở hộp thư bình luận.', 'Mở hộp thư bình luận')
  await page.run('Mở Cộng đồng → Bình luận', async () => {
    await page.goto(inboxUrl(urls.studio, uc))
    await page.waitFor({ regex: LABELS.tabComments, selector: SEL.tab })
  })
  // tab "Binh luan" (khong phai "Bai dang cua nguoi xem" / "Luot de cap")
  const tab = { regex: LABELS.tabComments, selector: SEL.tab }
  const selected = await page.eval((s) => {
    const el = window.__ya.one(s)
    return !!el && (el.getAttribute('aria-selected') === 'true' || el.hasAttribute('selected') || el.classList.contains('iron-selected'))
  }, tab)
  if (!selected) await page.click(tab)
  await page.run('Lọc "Chưa phản hồi"', () => ensureNotResponded(page, log))
  await waitList(page)
  return uc
}

// Dia chi da co bo loc; neu Studio bo qua (chip "Trang thai phan hoi: Chua phan hoi" khong hien) thi them bang tay.
async function ensureNotResponded(page, log) {
  if (await page.has({ regex: LABELS.statusChipOk })) return true
  try {
    // chip trang thai khac (vd "Da phan hoi") -> bam vao de sua; khong co -> nut Loc
    if (await page.has({ regex: LABELS.statusChip })) await page.click({ regex: LABELS.statusChip })
    else {
      await page.click({ selector: SEL.filterIcon })
      await page.click({ regex: LABELS.statusMenu })
    }
    await page.click({ regex: LABELS.notResponded })
    await page.click({ regex: LABELS.apply })
    await page.waitFor({ regex: LABELS.statusChipOk }, { timeout: 5000 })
    return true
  } catch (e) {
    log('warn', `Không đặt được bộ lọc "Chưa phản hồi" (${e.message}). Tool vẫn đọc danh sách và tự bỏ qua bình luận đã trả lời.`)
    return false
  }
}

async function waitList(page) {
  await page.run('Chờ danh sách bình luận', () => page.until((sel, empty) => {
    if (window.__ya.all(document, sel.thread).some((x) => window.__ya.visible(x))) return 'rows'
    return window.__ya.count({ regex: empty }) ? 'empty' : null
  }, [SEL, LABELS.empty], { what: 'danh sách bình luận' }))
}

// ---- doc binh luan --------------------------------------------------------------------
// handle: @handle cua kenh (de nhan ra tra loi cua chinh kenh). Tra ve toi da max binh luan.
async function readComments(page, { max = 50, handle = '' } = {}) {
  let rows = await page.eval(scanInbox, SEL, { handle })
  while (rows.length < max) {
    const n = await page.eval(scrollMore, SEL)
    try {
      await page.until((sel, k) => window.__ya.all(document, sel.thread).length > k, [SEL, n], { timeout: 3000, what: 'thêm bình luận' })
    } catch (_) { break } // het danh sach
    rows = await page.eval(scanInbox, SEL, { handle })
  }
  const now = Date.now()
  return rows.slice(0, max).map((r) => ({ ...r, publishedAt: parseAgo(r.ago, now) }))
}

// Tim lai hang theo id (cuon them neu can) va danh dau data-ya-row / data-ya-top.
async function findRow(page, id, handle, maxRows = 300) {
  for (;;) {
    const rows = await page.eval(scanInbox, SEL, { handle, mark: id })
    const row = rows.find((r) => r.id === id)
    if (row || rows.length >= maxRows) return row || null
    const n = await page.eval(scrollMore, SEL)
    try {
      await page.until((sel, k) => window.__ya.all(document, sel.thread).length > k, [SEL, n], { timeout: 3000, what: 'thêm bình luận' })
    } catch (_) { return null }
  }
}

// Trong hang da danh dau: nut gui "Phan hoi" nam ngay sau nut "Huy" cua o tra loi.
function markSubmit(cancelRe, submitRe, submitSel) {
  const ya = window.__ya
  const row = ya.all(document, '[data-ya-row]')[0]
  if (!row) return false
  const exact = ya.all(row, submitSel).filter((b) => ya.visible(b))[0] // #submit-button cua Studio
  if (exact) {
    exact.setAttribute('data-ya-submit', '1')
    return !(exact.disabled || exact.getAttribute('aria-disabled') === 'true')
  }
  const lab = (el) => ya.norm(el.getAttribute('aria-label') || el.innerText || el.textContent)
  const btns = ya.all(row, 'button, [role=button], ytcp-button, tp-yt-paper-button').filter((b) => ya.visible(b))
  const ci = btns.map((b) => new RegExp(cancelRe, 'i').test(lab(b))).lastIndexOf(true)
  if (ci < 0) return false
  const sub = btns.slice(ci + 1).find((b) => new RegExp(submitRe, 'i').test(lab(b)))
  if (!sub) return false
  sub.setAttribute('data-ya-submit', '1')
  return !(sub.disabled || sub.getAttribute('aria-disabled') === 'true')
}

// Hang da co tra loi cua kenh (hoac dung noi dung nay) chua?
const answered = (row, text, handle) => !!row && (row.ownerReplied || row.replies.some((r) =>
  r.text.replace(/\s+/g, ' ').trim() === String(text).replace(/\s+/g, ' ').trim() && (!handle || !r.author || r.author.toLowerCase() === handle.toLowerCase())))

// ---- tra loi ------------------------------------------------------------------------------
// comment: { id, author } tu readComments. Tra ve { status: 'sent' | 'already' }.
// Tim lai hang ngay truoc khi go va truoc khi gui; khong bao gio tra loi hai lan.
async function reply(page, comment, text, { uc = '', handle = '', urls, log = () => {} } = {}) {
  text = String(text || '').trim()
  if (!text) throw new StepError('Nội dung trả lời trống.', 'Trả lời bình luận')
  if (!/\/comments\/inbox/.test(page.url())) await openInbox(page, uc, { urls, log })
  const who = comment.author || comment.handle || 'người xem'
  const row = await page.run(`Tìm bình luận của ${who}`, () => findRow(page, comment.id, handle))
  if (!row) throw new StepError(`Không còn thấy bình luận của ${who} trong hộp thư (có thể đã bị xóa hoặc đã được trả lời ở nơi khác).`, page.step)
  if (answered(row, text, handle)) { log('info', `Bình luận của ${who} đã có trả lời của kênh, bỏ qua.`); return { status: 'already' } }

  await page.run(`Mở ô trả lời cho ${who}`, async () => {
    // chi mot o tra loi mo mot luc: dong o dang mo o hang khac
    const other = { regex: LABELS.cancel, within: { selector: `${SEL.thread}:not([data-ya-row])` } }
    if (await page.has(other)) await page.click(other)
    await page.click({ regex: LABELS.reply, within: { selector: '[data-ya-top]' }, nth: 0 })
    await page.waitFor({ regex: LABELS.replyInput, within: { selector: '[data-ya-row]' } })
  })
  await page.run('Nhập nội dung trả lời', async () => {
    const box = { regex: LABELS.replyInput, within: { selector: '[data-ya-row]' } }
    let typed = ''
    for (let i = 0; i < 2 && typed !== text; i++) { // go lai mot lan neu trang ve lai o
      await page.type(box, text)
      typed = String(await page.value(box) || '').trim()
    }
    if (typed !== text) throw new StepError(`Ô trả lời hiện "${typed.slice(0, 60)}", khác nội dung cần gửi.`, page.step)
  })
  await page.run('Gửi trả lời', async () => {
    // kiem lai: dung kenh, dung hang, chua ai tra loi trong luc go
    const now = channelOf(page.url())
    if (uc && now !== uc) throw new StepError(`Studio đang ở kênh ${now || '(không rõ)'}, không phải ${uc}. Không gửi.`, page.step)
    const again = await findRow(page, comment.id, handle)
    if (!again) throw new StepError(`Bình luận của ${who} vừa biến mất khỏi danh sách. Không gửi.`, page.step)
    if (answered(again, text, handle)) return
    const ok = await page.until(markSubmit, [LABELS.cancel, LABELS.submit, SEL.submit], { timeout: 5000, what: 'nút gửi "Phản hồi" bật lên' }).catch(() => false)
    if (!ok) throw new StepError('Không thấy nút gửi "Phản hồi" cạnh nút "Hủy".', page.step)
    await page.click({ selector: '[data-ya-submit]' })
  })
  await page.run('Chờ "Đã thêm phản hồi"', () => page.until((toast, sel, t, h) => {
    if (window.__ya.count({ regex: toast })) return 'toast'
    const rows = window.__ya.all(document, '[data-ya-row]')
    if (!rows.length) return null
    const want = t.replace(/\s+/g, ' ').trim()
    const replies = window.__ya.all(rows[0], sel.comment).slice(1)
    return replies.some((r) => (r.innerText || '').replace(/\s+/g, ' ').includes(want) && (!h || (r.innerText || '').toLowerCase().includes(h.toLowerCase()))) ? 'nested' : null
  }, [LABELS.toast, SEL, text, handle], { timeout: 30000, what: 'thông báo "Đã thêm phản hồi"' }))
  // o tra loi dong lai (hoac ca hang bien mat vi bo loc)
  await page.waitGone({ regex: LABELS.replyInput, within: { selector: '[data-ya-row]' } }, { timeout: 10000 }).catch(() => {})
  log('ok', `Đã trả lời ${who}.`)
  await sleep(300)
  return { status: 'sent' }
}

module.exports = { LABELS, SEL, INBOX_FILTER, inboxUrl, openInbox, readComments, reply, parseAgo, scanInbox }
