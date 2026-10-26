// Toi uu video da dang (theo video quay "toi uu video - mau mac dinh"):
//   listVideos     Studio "Noi dung cua kenh" -> tab Video: doc cac hang
//   optimizeVideo  /video/<id>/edit: danh sach phat, Hien them, quang cao tra tien, AI, the, ngon ngu,
//                  ngay quay, vi tri, giay phep, nhung, phoi lai Shorts, danh muc, binh luan,
//                  man hinh ket thuc (luu rieng) -> Luu -> "Da luu thay doi"
//   commentAndPin  trang xem video: Thich, binh luan, ⋮ -> Ghim -> Ghim -> "Da ghim binh luan"
// Ham thuan tren mot Page da o dung kenh (ctx.withChannel lo chuyen kenh). Muc mau = 'keep' -> bo qua.
const { StepError, channelOf, sleep } = require('../studio/driver')
const { CATEGORY_NAMES, normalizeTemplate, tagsToAdd, fmtStudioDate, recordingDateFor, renderComment } = require('../optimize-template')

// Chu tren man hinh (Studio tieng Viet + tieng Anh). Sua o day khi co HTML that.
const L = (text, regex) => ({ text, regex })
const LABELS = {
  content: L('Nội dung của kênh', '^(nội dung của kênh|channel content)$'),
  noContent: L('Không có nội dung nào', '^(không có nội dung nào|no content available)'),
  details: L('Chi tiết video', '^(chi tiết video|video details)$'),
  playlists: L('Danh sách phát', '^(danh sách phát|playlists?)$'),
  done: L('Xong', '^(xong|done)$'),
  showMore: L('Hiện thêm', '^(hiện thêm|show more|hiện chế độ cài đặt nâng cao)$'), // ytcp-button#toggle-button
  showLess: L('Ẩn bớt', '^(ẩn bớt|show less|ẩn chế độ cài đặt nâng cao)$'),
  paid: L('Nội dung được trả tiền để quảng cáo', '^(nội dung được trả tiền để quảng cáo|paid promotion)$'),
  paidYes: L('Có, video của tôi có chứa nội dung được trả tiền để quảng cáo', '^(có, video của tôi có chứa nội dung được trả tiền để quảng cáo|yes, my video contains paid promotion.*)$'),
  paidNo: L('Không, video của tôi không chứa nội dung được trả tiền để quảng cáo', '^(không, video của tôi không chứa nội dung được trả tiền để quảng cáo|no, my video does not contain paid promotion.*)$'),
  ai: L('Sử dụng AI', '^(sử dụng ai|altered content|ai usage)$'),
  yes: L('Có', '^(có|yes)$'),
  no: L('Không', '^(không|no)$'),
  videoLanguage: L('Ngôn ngữ video', '^(ngôn ngữ video|video language)$'),
  titleLanguage: L('Ngôn ngữ của tiêu đề và nội dung mô tả', '^(ngôn ngữ của tiêu đề và nội dung mô tả|title and description language)$'),
  recDate: L('Ngày quay', '^(ngày quay|recording date)$'),
  location: L('Vị trí video', '^(vị trí video|video location)$'),
  license: L('Giấy phép', '^(giấy phép|license)$'),
  licenseYoutube: 'Giấy phép chuẩn của YouTube', // tieng Anh: Standard YouTube License
  licenseCc: 'Creative Commons - Ghi công', // Creative Commons - Attribution
  embed: L('Cho phép nhúng', '^(cho phép nhúng|allow embedding)$'),
  remix: L('Phối lại cho Shorts', '^(phối lại cho shorts|shorts remixing)$'),
  remixAll: L('Cho phép phối lại video và âm thanh', '^(cho phép phối lại video và âm thanh|allow video and audio remixing)$'),
  remixAudio: L('Chỉ cho phép phối lại âm thanh', '^(chỉ cho phép phối lại âm thanh|allow only audio remixing)$'),
  remixNone: L('Không cho phép phối lại', '^(không cho phép phối lại|don.t allow remixing)$'),
  category: L('Danh mục', '^(danh mục|category)$'),
  commentsSection: L('Bình luận và mức phân loại', '^(bình luận và mức phân loại|comments and ratings)$'),
  comments: L('Bình luận', '^(bình luận|comments)$'),
  commentsOn: 'Bật', commentsPause: 'Tạm dừng', commentsOff: 'Tắt', // On / Pause / Off
  endScreen: L('Màn hình kết thúc', '^(màn hình kết thúc|end screen)$'),
  esElements: L('Thành phần', '(^|\\s)(thành phần|element)$'),
  esLatest: L('Lấy màn hình kết thúc của video gần đây nhất', '^(lấy màn hình kết thúc của video gần đây nhất|import from latest video|use end screen from latest video)$'),
  esCancel: L('Hủy thay đổi', '^(hủy thay đổi|huỷ thay đổi|discard changes)$'),
  save: L('Lưu', '^(lưu|save)$'),
  saved: L('Đã lưu thay đổi', '^(đã lưu thay đổi|changes saved)$'),
  // nut Thich that: like-button-view-model button[aria-label="cùng 49 người khác thích video này"]
  like: L('Thích video này', '(thích video này|like this video)'),
  addComment: L('Thêm bình luận...', '^(thêm bình luận|add a comment)'), // that: "Thêm bình luận..." (3 dau cham)
  submitComment: L('Bình luận', '^(bình luận|comment)$'),
  commentMenu: L('Tác vụ', '^(tác vụ|menu tác vụ|action menu)$'),
  pin: L('Ghim', '^(ghim|pin)$'),
  pinDialog: L('Ghim bình luận này?', '^(ghim bình luận này\\?|pin this comment\\?)$'),
  pinned: L('Đã ghim bình luận', '^(đã ghim bình luận|comment pinned)$'),
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
  likeButton: 'like-button-view-model button',
  submit: '#submit-button button, button#submit-button',
  listbox: '[role=listbox], tp-yt-paper-listbox',
  option: '[role=option], tp-yt-paper-item',
  chip: '#tags-container #chip-text, ytcp-chip #chip-text',
  tagInput: '#tags-container input, ytcp-form-input-container#tags-container input',
  thread: 'ytd-comment-thread-renderer',
  content: '#content-text',
  pinnedBadge: '#pinned-comment-badge',
  editor: '#contenteditable-root, [contenteditable=true]',
  menus: 'ytd-menu-popup-renderer, [role=menu]',
}
const sec = (name) => `[data-ya-sec="${name}"]`
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()

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
    const d = window.__ya.find({ selector: sel }, true).find((x) => String(x.innerText || '').split('\n').some((l) => re.test(window.__ya.norm(l))))
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

// Chon `option` trong o tha xuong (bam vao t). 'same' | 'changed' | 'locked'
async function pickOption(page, t, option) {
  await page.waitFor(t)
  const info = await triggerInfo(page, t)
  if (info.lines.some((l) => norm(l) === norm(option))) return 'same'
  if (info.disabled) return 'locked'
  await page.click(t)
  const opt = { text: option, exact: true, selector: SEL.option, within: SEL.listbox }
  await page.click(opt)
  await page.until((t, sel, want) => {
    const el = window.__ya.one(t)
    const tr = el && (el.closest(sel) || el)
    return tr && String(tr.innerText || '').split('\n').some((l) => window.__ya.norm(l) === want)
  }, [t, SEL.trigger, norm(option)], { what: `"${option}" được chọn` })
  return 'changed'
}

// ---- (a) danh sach video ---------------------------------------------------------
const CONTENT_QS = '?filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%2C%22sortOrder%22%3A%22DESCENDING%22%7D'

async function listVideos(page, channelUc, { urls, log = () => {}, onStep = () => {}, maxPages = 10, limit = 0 } = {}) {
  const uc = channelUc && /^UC[\w-]{10,}$/.test(channelUc) ? channelUc : channelOf(page.url())
  if (!uc) throw new StepError('Không biết UC ID của kênh để mở trang Nội dung.', 'Mở Nội dung')
  onStep('Mở Nội dung')
  await page.run('Mở trang Nội dung của kênh', async () => {
    await page.goto(`${urls.studio}/channel/${uc}/videos/upload${CONTENT_QS}`)
    await page.waitFor(LABELS.content)
  })
  const ready = await page.until((row, empty) => (window.__ya.count({ selector: row }) ? 'rows' : window.__ya.count(empty) ? 'empty' : ''), [SEL.row, LABELS.noContent], { what: 'danh sách video' })
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

// ---- (b) toi uu trang Chi tiet video -------------------------------------------
async function optimizeVideo(page, videoId, template, { urls, log = () => {}, onStep = () => {}, video = {}, now = new Date(), channelName = '' } = {}) {
  const t = normalizeTemplate(template)
  const changed = []
  const warnings = []
  const warn = (m) => { warnings.push(m); log('warn', m) }
  const step = (name, fn) => { onStep(name); return page.run(name, fn) }

  await step('Mở trang Chi tiết video', async () => {
    await page.goto(`${urls.studio}/video/${videoId}/edit`)
    await page.waitFor(LABELS.details)
    await page.waitFor({ selector: SEL.title }, { timeout: Math.max(page.timeout, 20000) })
  })
  const title = String((await page.text({ selector: SEL.title })) || '').trim()

  // Mo ta: chi dien khi video CHUA co mo ta; da co thi giu nguyen.
  if (t.description) {
    await step('Mô tả', async () => {
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

  if (t.playlists.length) {
    await step('Danh sách phát', async () => {
      await markSection(page, LABELS.playlists, 'pl', SEL.trigger)
      await page.click({ selector: SEL.trigger, within: sec('pl') })
      const box = { selector: SEL.plBox, within: SEL.dialogs }
      await page.waitFor(box)
      const items = await page.eval((b) => window.__ya.find(b, true).map((cb) => {
        const it = cb.closest('li, [role=listitem], ytcp-ve') || cb.parentElement
        const lab = it.querySelector('.label-text, .checkbox-label, #checkbox-label')
        const host = cb.closest('ytcp-checkbox-lit')
        return {
          name: String(cb.getAttribute('aria-label') || (lab ? lab.innerText : it.innerText) || '').replace(/\s+/g, ' ').trim(),
          id: (host && host.getAttribute('test-id')) || '', // ID danh sach phat (PL...)
          on: cb.getAttribute('aria-checked') === 'true',
        }
      }), box)
      let ticked = 0
      for (const want of t.playlists) {
        // mau ghi ten (tich moi danh sach trung ten) hoac ID "PL..." (dung mot danh sach)
        const hits = items.map((x, i) => [x, i]).filter(([x]) => norm(x.name) === norm(want) || (x.id && x.id === want))
        if (!hits.length) { warn(`Không thấy danh sách phát "${want}" trong kênh.`); continue }
        for (const [x, i] of hits) {
          if (x.on) continue
          await page.click({ ...box, nth: i })
          await page.until((b, i) => { const el = window.__ya.find(b, true)[i]; return el && el.getAttribute('aria-checked') === 'true' }, [box, i], { what: `danh sách phát "${want}" được tích` })
          ticked++
        }
      }
      await page.click({ ...LABELS.done, within: SEL.dialogs })
      await page.waitGone(box)
      if (ticked) changed.push('playlists')
    })
  }

  await step('Hiện thêm', async () => {
    await page.until((a, b) => window.__ya.count(a) || window.__ya.count(b), [LABELS.showMore, LABELS.showLess], { what: '"Hiện thêm"' })
    if (await page.has(LABELS.showMore)) await page.click(LABELS.showMore)
    await page.waitFor(LABELS.showLess)
  })

  if (t.paidPromotion !== 'keep') {
    await step('Nội dung được trả tiền để quảng cáo', async () => {
      await markSection(page, LABELS.paid, 'paid', SEL.radio)
      if (await pickRadio(page, { ...(t.paidPromotion === 'yes' ? LABELS.paidYes : LABELS.paidNo), within: sec('paid') })) changed.push('paidPromotion')
    })
  }

  if (t.ai !== 'keep') {
    await step('Sử dụng AI', async () => {
      await markSection(page, LABELS.ai, 'ai', SEL.radio)
      if (await pickRadio(page, { ...(t.ai === 'yes' ? LABELS.yes : LABELS.no), within: sec('ai') })) changed.push('ai')
    })
  }

  const plan = tagsToAdd([], t, title)
  if (plan.add.length) {
    await step('Thẻ', async () => {
      await page.waitFor({ selector: SEL.tagInput })
      const have = await page.eval((s) => window.__ya.find({ selector: s, hidden: true }, true).map((e) => String(e.innerText || e.textContent || '').trim()), SEL.chip)
      const { add, skipped } = tagsToAdd(have, t, title)
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

  if (t.language) {
    await step('Ngôn ngữ', async () => {
      for (const lab of [LABELS.videoLanguage, LABELS.titleLanguage]) {
        const r = await pickOption(page, lab, t.language)
        if (r === 'changed') changed.push('language')
        if (r === 'locked') warn(`Ô "${lab.text}" bị khóa, giữ nguyên.`)
      }
    })
  }

  const recDate = recordingDateFor(t, video, now)
  if (t.recordingDate === 'publish' && !recDate) warn('Không đọc được ngày đăng video, giữ nguyên ngày quay.')
  if (recDate) {
    await step('Ngày quay', async () => {
      const want = fmtStudioDate(recDate)
      await page.waitFor(LABELS.recDate)
      const info = await triggerInfo(page, LABELS.recDate)
      if (info.lines.some((l) => norm(l) === norm(want))) return
      await page.click(LABELS.recDate)
      const inp = { selector: 'ytcp-date-picker input, [role=dialog] input' }
      await page.type(inp, want)
      await page.press('Enter')
      await page.until((t, sel, want) => {
        const el = window.__ya.one(t)
        const tr = el && (el.closest(sel) || el)
        return tr && String(tr.innerText || '').split('\n').some((l) => window.__ya.norm(l) === want)
      }, [LABELS.recDate, SEL.trigger, norm(want)], { what: `ngày quay "${want}"` })
      changed.push('recordingDate')
    })
  }

  if (t.location) {
    await step('Vị trí video', async () => {
      await markSection(page, LABELS.location, 'loc', 'input')
      const inp = { selector: 'input', within: sec('loc') }
      if (norm(await page.value(inp)) === norm(t.location)) return
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
        warn(`Không thấy "${t.location}" trong gợi ý vị trí, giữ nguyên vị trí.`)
        return
      }
      await page.click({ selector: SEL.option, within: SEL.listbox, nth: Number(idx) })
      await page.until((t) => window.__ya.norm(window.__ya.value(t)) !== '', [inp], { what: 'vị trí được chọn' })
      changed.push('location')
    })
  }

  if (t.license !== 'keep') {
    await step('Giấy phép', async () => {
      await markSection(page, LABELS.license, 'lic', SEL.trigger)
      const r = await pickOption(page, { selector: SEL.trigger, within: sec('lic') }, t.license === 'youtube' ? LABELS.licenseYoutube : LABELS.licenseCc)
      if (r === 'changed') changed.push('license')
      if (r === 'locked') warn('Giấy phép bị khóa trên video này (Studio không cho đổi), giữ nguyên.')
    })
  }

  if (t.embeddable !== 'keep') {
    await step('Cho phép nhúng', async () => {
      if (await setCheckbox(page, LABELS.embed, t.embeddable === 'yes')) changed.push('embeddable')
    })
  }

  if (t.remix !== 'keep') {
    await step('Phối lại cho Shorts', async () => {
      await markSection(page, LABELS.remix, 'remix', SEL.radio)
      const lab = { all: LABELS.remixAll, audio: LABELS.remixAudio, none: LABELS.remixNone }[t.remix]
      if (await pickRadio(page, { ...lab, within: sec('remix') })) changed.push('remix')
    })
  }

  if (t.category !== 'keep') {
    await step('Danh mục', async () => {
      await markSection(page, LABELS.category, 'cat', SEL.trigger)
      if ((await pickOption(page, { selector: SEL.trigger, within: sec('cat') }, CATEGORY_NAMES[t.category])) === 'changed') changed.push('category')
    })
  }

  if (t.comments !== 'keep') {
    await step('Bình luận', async () => {
      await markSection(page, LABELS.commentsSection, 'cmt', SEL.trigger)
      const want = { on: LABELS.commentsOn, pause: LABELS.commentsPause, off: LABELS.commentsOff }[t.comments]
      if ((await pickOption(page, { ...LABELS.comments, within: sec('cmt') }, want)) === 'changed') changed.push('comments')
    })
  }

  if (t.endScreen === 'latest') {
    await step('Màn hình kết thúc', async () => {
      await page.click(LABELS.endScreen)
      await markDialog(page, LABELS.endScreen, 'es', { timeout: Math.max(page.timeout, 20000) })
      // trinh chinh tai cham: cho nut "Thanh phan" roi moi xem co o mau khong
      await page.waitFor({ ...LABELS.esElements, within: sec('es') }, { timeout: Math.max(page.timeout, 30000) })
      await sleep(500)
      const tile = { ...LABELS.esLatest, within: sec('es') }
      if (!(await page.has(tile))) {
        warn('Màn hình kết thúc: không có mẫu "Lấy màn hình kết thúc của video gần đây nhất" (video đã có màn hình kết thúc?), giữ nguyên.')
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

  let saved = false
  await step('Lưu', async () => {
    await page.waitFor(LABELS.save)
    if (!(await isEnabled(page, LABELS.save))) { log('info', 'Studio không có gì thay đổi để lưu.'); return }
    await page.click(LABELS.save)
    await page.waitFor(LABELS.saved, { timeout: Math.max(page.timeout, 30000) })
    saved = true
  })
  const after = String((await page.text({ selector: SEL.title })) || '').trim() || title
  return { id: videoId, title: after, changed, warnings, saved }
}

// ---- (c) binh luan + ghim tren trang xem video ----------------------------------
async function commentAndPin(page, videoId, text, { urls, log = () => {}, onStep = () => {}, like = true, pin = true } = {}) {
  text = String(text || '').trim()
  const warnings = []
  const out = { id: videoId, liked: false, commented: false, pinned: false, warnings }
  const step = (name, fn) => { onStep(name); return page.run(name, fn) }

  await step('Mở trang xem video', async () => {
    await page.goto(`${urls.youtube}/watch?v=${videoId}`)
    await page.waitFor({ ...LABELS.like, selector: SEL.likeButton }, { timeout: Math.max(page.timeout, 20000) })
  })

  if (like) {
    await step('Thích video', async () => {
      const b = { ...LABELS.like, selector: SEL.likeButton }
      const pressed = await page.eval((t) => { const el = window.__ya.one(t); return !!el && el.getAttribute('aria-pressed') === 'true' }, b)
      if (!pressed) {
        await page.click(b)
        await page.until((t) => { const el = window.__ya.one(t); return !!el && el.getAttribute('aria-pressed') === 'true' }, [b], { what: 'nút Thích được bấm' })
      }
      out.liked = true
    })
  }
  if (!text) return out

  // binh luan chi tai khi cuon xuong
  await step('Mở phần bình luận', async () => {
    await page.until((a, th) => {
      if (window.__ya.count(a) || window.__ya.count({ selector: th })) return true
      window.scrollBy(0, 400)
      return false
    }, [LABELS.addComment, SEL.thread], { what: 'phần bình luận', timeout: Math.max(page.timeout, 20000) })
  })

  const findMine = () => page.eval((s, want) => {
    const n = (x) => String(x || '').replace(/\s+/g, ' ').trim().toLowerCase()
    for (const el of document.querySelectorAll('[data-ya-thread]')) el.removeAttribute('data-ya-thread')
    const w = n(want)
    for (const th of window.__ya.find({ selector: s.thread }, true)) {
      const c = th.querySelector(s.content)
      const got = n(c && c.innerText)
      if (got && (got === w || (w.length > 60 && got.startsWith(w.slice(0, 60))))) {
        th.setAttribute('data-ya-thread', 'me')
        // #pinned-comment-badge luon co trong DOM, chi co chu khi da ghim
        const b = th.querySelector(s.pinnedBadge)
        return { pinned: !!(b && window.__ya.visible(b) && String(b.innerText || '').trim()) }
      }
    }
    return null
  }, SEL, text)

  let mine = await findMine()
  if (mine) {
    log('info', 'Bình luận này đã có dưới video, không đăng lại.')
  } else {
    await step('Đăng bình luận', async () => {
      await page.click(LABELS.addComment)
      await page.type({ selector: SEL.editor }, text)
      const submit = { ...LABELS.submitComment, selector: SEL.submit }
      await page.until((t) => {
        const el = window.__ya.one(t)
        return !!el && el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('disabled')
      }, [submit], { what: 'nút "Bình luận" bật' })
      await page.click(submit)
      mine = await page.until((s, want) => {
        const n = (x) => String(x || '').replace(/\s+/g, ' ').trim().toLowerCase()
        return window.__ya.find({ selector: s.thread }, true).some((th) => { const c = th.querySelector(s.content); return n(c && c.innerText).startsWith(n(want).slice(0, 60)) })
      }, [SEL, text], { what: 'bình luận vừa đăng', timeout: Math.max(page.timeout, 15000) }).then(findMine)
      out.commented = true
    })
  }
  out.pinned = !!(mine && mine.pinned)
  if (!pin || out.pinned) return out

  try {
    await step('Ghim bình luận', async () => {
      await findMine()
      await page.click({ ...LABELS.commentMenu, selector: 'button, [role=button]', within: '[data-ya-thread="me"]' })
      await page.click({ ...LABELS.pin, within: SEL.menus })
      await markDialog(page, LABELS.pinDialog, 'pin')
      await page.click({ ...LABELS.pin, within: sec('pin') })
      const end = Date.now() + Math.max(page.timeout, 15000)
      for (;;) {
        const m = await findMine()
        if (m && m.pinned) break
        if (Date.now() > end) throw new StepError('Không thấy bình luận được ghim sau khi bấm "Ghim".', page.step)
        await sleep(300)
      }
    })
    out.pinned = true
  } catch (e) {
    await page.press('Escape').catch(() => {})
    const m = `Đã bình luận nhưng chưa ghim được: ${e.message}`
    warnings.push(m)
    log('warn', m)
  }
  return out
}

module.exports = { LABELS, SEL, listVideos, optimizeVideo, commentAndPin }
