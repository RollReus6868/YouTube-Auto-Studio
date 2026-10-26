// Luong tu dong "The Trang chu" trong YouTube Studio (Tuy chinh kenh → The Trang chu):
//  - them kenh moi vao phan "Kenh noi bat" (tao phan moi neu chua co)
//  - them phan "Danh sach phat don" cho mot danh sach phat, dat o cuoi hoac vi tri N
//  - "Xuat ban" va cho thong bao "Da ap dung noi dung thay doi"
// Chay tren Page DA chuyen sang kenh dich (ctx.withChannel). Khong tu dang nhap / chuyen kenh.
const { StepError, channelOf, sleep } = require('../studio/driver')
const { MAX_SECTIONS, sameChannel } = require('../hometab-input')

// Moi nhan Studio ma luong tim (chu thuong, regex; nhan tieng Anh di kem).
// Doi chieu voi HTML that (html/yt-7, yt-8, yt-9-editing-hometab.html, 2026-10-26).
const LABELS = {
  addSection: '^\\+?\\s*(thêm phần kênh|add section)$', // ytcp-button#add-section-button
  layoutLimit: '(tối đa|up to)\\s*(\\d+)\\s*(phần kênh|sections)',
  sectionTitle: '^(.+?)\\s*\\((\\d[\\d.,]*)\\)$', // du phong khi khong co cau truc: "Video (21)"
  sectionCount: '\\((\\d[\\d.,]*)\\)$',
  featuredTitle: '^(kênh nổi bật|featured channels)\\s*(:|\\(|$)', // h2#label "Kênh nổi bật:(1)"
  playlistTitle: '^(danh sách phát đơn|single playlist)\\s*:\\s*(.*?)\\s*(\\((\\d[\\d.,]*)\\))?$',
  sectionMenu: '^(tùy chọn|tuỳ chọn|options|more options|actions?)( (về|for)( .*)?)?$', // "Tùy chọn về Video", "Tùy chọn"
  editSection: '^(chỉnh sửa nội dung trong phần kênh|edit section contents?|edit contents?)$',
  menuFeatured: '^(kênh nổi bật|featured channels)$',
  menuSinglePlaylist: '^(danh sách phát đơn|single playlist)$',
  channelSearch: '^(một kênh youtube bất kỳ|any youtube channel|search (for )?(a )?channels?)', // input#public-entity-search-query
  channelsInSection: '^(những kênh trong phần này|channels in this section)$', // #entities-in-group
  pickPlaylist: '^(chọn một danh sách phát|choose a playlist|select a playlist)$',
  anyPlaylist: '^(danh sách phát bất kỳ trên youtube|any (youtube )?playlist( on youtube)?)$', // input#search-any
  tileCount: '(\\d[\\d.,]*)\\s*(video|videos)$', // .subtitle "26 video"
  noResult: '(không có kết quả|không tìm thấy|no (matching )?results|not found|couldn.t find)', // #no-match-message
  dragHandle: '(kéo|sắp xếp|drag|reorder)',
  done: '^(xong|done)$', // ytcp-button#save-button
  cancel: '^(hủy|huỷ|cancel)$', // ytcp-button#cancel-button
  close: '^(đóng|close)$', // ytcp-icon-button#close
  publish: '^(xuất bản|publish)$', // ytcp-button#publish-button
  published: '(đã áp dụng nội dung thay đổi|changes (published|applied|saved))',
  publishError: '(không thể xuất bản|không lưu được|đã xảy ra lỗi|couldn.t publish|something went wrong)',
}
// Bo chon cau truc (theo HTML that; Studio dung Polymer: tp-yt-*, ytcp-*)
const SEL = {
  dialog: '[role=dialog], tp-yt-paper-dialog, ytcp-dialog',
  menu: 'ytcp-text-menu', // menu ⋮ va menu "Them phan kenh" cung la tp-yt-paper-dialog role=dialog
  section: 'ytcp-shelf-list-item', // moi phan kenh (trong .shelf-element)
  sectionLabel: '#label, h2.label',
  primaryLabel: '.primary-label',
  kebab: '#shelf-actions-menu, .open-menu-button',
  handle: '.drag-handle-container, [icon*="drag_handle"]',
  draggable: '.maybe-draggable, [draggable="true"]',
  placeholder: '.shelf-placeholder',
  checkbox: '[role=checkbox], input[type=checkbox], ytcp-checkbox-lit, tp-yt-paper-checkbox',
  tile: 'ytcp-entity-card, [role=listbox] [role=option]',
  tileTitle: '.title',
  button: 'button, [role=button], ytcp-button, ytcp-icon-button, tp-yt-paper-icon-button',
  overlay: '[role=dialog], [role=menu], [role=listbox], tp-yt-paper-dialog, ytcp-dialog, tp-yt-iron-dropdown, ytcp-text-menu',
  switch: '[role=switch], tp-yt-paper-toggle-button',
  progress: '[role=progressbar]',
}
const SEARCH_TIMEOUT = 10000

// ---- thu vien chay trong trang (window.__yaHome), dung chung helper __ya cua driver ----
function homeLib(L, SEL) {
  if (window.__yaHome) return
  const ya = window.__ya
  const re = (s) => new RegExp(s, 'i')
  const txt = (el) => String((el && (el.innerText !== undefined ? el.innerText : el.textContent)) || '').replace(/\s+/g, ' ').trim()
  const lines = (el) => String(el.innerText || '').split(/[\n\t]/).map((s) => s.trim()).filter(Boolean)
  const disabled = (el) => !!(el && (el.closest('[aria-disabled="true"],[disabled]') || (typeof el.className === 'string' && /\bdisabled\b/.test(el.className))))
  const vis = (el) => ya.visible(el)
  const up = (e) => e.parentElement || (e.getRootNode && e.getRootNode().host) || null
  const inOverlay = (el) => { for (let e = el; e; e = up(e)) { if (e.matches && e.matches(SEL.overlay)) return true } return false }
  const isMenu = (el) => { for (let e = el; e; e = up(e)) { if (e.matches && e.matches(SEL.menu)) return true } return false }
  // hop thoai dang mo (bo qua menu ytcp-text-menu, cung la role=dialog)
  const dialog = () => { const d = ya.all(document, SEL.dialog).filter((x) => vis(x) && !isMenu(x)); return d[d.length - 1] || null }
  const addBtn = () => ya.find({ text: '', regex: L.addSection })[0] || null
  const outermost = (list) => list.filter((el) => !list.some((o) => o !== el && o.contains(el)))

  function parse(title, primary) {
    const c = re(L.sectionCount).exec(title)
    const p = re(L.playlistTitle).exec(title)
    return {
      title, count: c ? Number(c[1].replace(/[.,]/g, '')) : null,
      kind: re(L.featuredTitle).test(title) ? 'featured' : p ? 'playlist' : 'other',
      name: p ? (primary !== null ? primary : p[2]) : '',
    }
  }
  // Cac phan kenh trong Bo cuc, thu tu tren → duoi. Uu tien cau truc that (ytcp-shelf-list-item),
  // du phong: tieu de dang "Ten (N)" nam duoi nut "Them phan kenh".
  function sections() {
    let cards = outermost(ya.all(document, SEL.section).filter((el) => vis(el) && !inOverlay(el)))
    let out
    if (cards.length) {
      out = cards.map((card) => {
        const lab = ya.all(card, SEL.sectionLabel)[0]
        const pl = lab ? ya.all(lab, SEL.primaryLabel)[0] : null
        return { card, ...parse(txt(lab) || lines(card)[0] || '', pl ? txt(pl) : null) }
      })
    } else {
      const btn = addBtn()
      const top = btn ? btn.getBoundingClientRect().bottom - 2 : -1e9
      const tRe = re(L.sectionTitle)
      let titles = ya.all(document, '*').filter((el) => vis(el) && !inOverlay(el) && tRe.test(txt(el)) && el.getBoundingClientRect().top > top)
      titles = titles.filter((el) => !titles.some((o) => o !== el && el.contains(o)))
      out = titles.map((el) => {
        let card = el // to tien lon nhat chi chua mot tieu de
        while (card.parentElement && !titles.some((o) => o !== el && card.parentElement.contains(o)) && card.parentElement !== document.body) card = card.parentElement
        return { card, ...parse(txt(el), null) }
      })
    }
    out.sort((a, b) => a.card.getBoundingClientRect().top - b.card.getBoundingClientRect().top)
    return out.map(({ card, ...s }, i) => { card.setAttribute('data-yah-card', String(i)); return { i, ...s } })
  }
  const card = (i) => ya.all(document, `[data-yah-card="${i}"]`)[0] || null
  function center(el, scroll = true) {
    if (scroll) el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  }
  const buttons = (root) => ya.all(root, SEL.button).filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
  const fire = (el, type, x, y, dt) => el.dispatchEvent(dt
    ? new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: x, clientY: y })
    : new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, buttons: 1 }))

  window.__yaHome = {
    sections,
    layout() {
      const s = sections()
      const m = re(L.layoutLimit).exec(txt(document.body))
      const sw = ya.all(document, SEL.switch).filter(vis)[0]
      const on = sw ? !(sw.getAttribute('aria-checked') === 'false' || sw.getAttribute('aria-pressed') === 'false') : true
      return { sections: s, limit: m ? Number(m[2]) : 0, homeTabOn: on, ready: !!addBtn() }
    },
    cardCenter(i) { const c = card(i); return c ? center(c) : null },
    // danh dau nut ⋮ cua the i (#shelf-actions-menu "Tùy chọn về …"; co the chi hien khi re chuot vao)
    markKebab(i) {
      const c = card(i)
      if (!c) return false
      const lr = re(L.sectionMenu)
      const list = buttons(c)
      const b = ya.all(c, SEL.kebab)[0]
        || list.find((x) => [x.getAttribute('aria-label'), x.getAttribute('title')].some((v) => v && lr.test(ya.norm(v))))
        || list.filter((x) => !re(L.dragHandle).test(ya.norm(x.getAttribute('aria-label') || ''))).sort((a, b2) => b2.getBoundingClientRect().right - a.getBoundingClientRect().right)[0]
      if (!b) return false
      ya.all(document, '[data-yah="kebab"]').forEach((e) => e.removeAttribute('data-yah'))
      b.setAttribute('data-yah', 'kebab')
      return true
    },
    // tay keo (≡) cua the i; khong thay thi lay mep trai the
    handle(i) {
      const c = card(i)
      if (!c) return null
      c.scrollIntoView({ block: 'center' })
      const h = ya.all(c, SEL.handle).find(vis)
        || ya.all(c, '*').find((e) => vis(e) && re(L.dragHandle).test(ya.norm(e.getAttribute('aria-label') || e.getAttribute('title') || '')))
      if (h) return center(h, false)
      const r = c.getBoundingClientRect()
      return { x: r.left + 20, y: r.top + r.height / 2 }
    },
    // diem nhan (tay keo the from) va khung the dich, sau khi cuon cho ca hai cung hien
    dragPoints(from, to) {
      const a = card(from), b = card(to)
      if (!a || !b) return null
      a.scrollIntoView({ block: 'center' })
      b.scrollIntoView({ block: 'nearest' })
      const hd = ya.all(a, SEL.handle).find(vis)
      const ar = a.getBoundingClientRect()
      return { h: hd ? center(hd, false) : { x: ar.left + 20, y: ar.top + ar.height / 2 }, t: center(b, false) }
    },
    // the co keo-tha HTML5 (.maybe-draggable / draggable) khong
    html5(i) { const c = card(i); return !!(c && (ya.all(c, SEL.draggable).length || c.closest('[draggable="true"]'))) },
    // muc trong menu dang mo (uu tien phan tu nam trong lop phu, khong lay tieu de phan kenh trung chu)
    item(regex) {
      const all = ya.find({ text: '', regex }, true)
      const el = all.find(inOverlay) || all[0]
      return el ? { found: true, disabled: disabled(el) } : { found: false, disabled: false }
    },
    button(regex) {
      const el = ya.find({ text: '', regex }).filter((e) => !inOverlay(e))[0]
      return el ? { found: true, disabled: disabled(el) } : { found: false, disabled: false }
    },
    // danh dau nut (theo nhan) nam ngoai hop thoai/menu, vd "Hủy" o dau trang
    markOutside(regex, tag) {
      const el = ya.find({ text: '', regex }, true).find((e) => !inOverlay(e))
      if (!el) return false
      ya.all(document, `[data-yah="${tag}"]`).forEach((e) => e.removeAttribute('data-yah'))
      el.setAttribute('data-yah', tag)
      return { disabled: disabled(el) }
    },
    dialogOpen: () => !!dialog(),
    dialogText: () => { const d = dialog(); return d ? txt(d) : '' },
    // "Nhung kenh trong phan nay" (cot phai hop thoai kenh, #right-column)
    sectionChannels() {
      const d = dialog()
      if (!d) return null
      const head = ya.all(d, '*').filter((e) => vis(e) && re(L.channelsInSection).test(ya.norm(txt(e)))).pop()
      if (!head) return null
      let pane = head
      const ht = txt(head)
      // di len toi khung cot phai (dung truoc khi gap cot trai co o tim kiem)
      while (pane.parentElement && pane !== d && txt(pane) === ht && !pane.parentElement.querySelector('input')) pane = pane.parentElement
      if (pane === d) return []
      const out = lines(pane)
      return out.slice(out.findIndex((l) => ya.norm(l) === ya.norm(ht)) + 1).filter((l) => /[\p{L}\p{N}]/u.test(l))
    },
    // dong ket qua tim kenh: o tich + ten
    channelRows() {
      const d = dialog()
      if (!d) return []
      const boxes = outermost(ya.all(d, SEL.checkbox).filter(vis))
      return boxes.map((cb, i) => {
        let row = cb
        while (row.parentElement && row !== d && !lines(row).some((l) => /[\p{L}]/u.test(l))) row = row.parentElement
        cb.setAttribute('data-yah-row', String(i))
        const inner = cb.matches('[role=checkbox], input') ? cb : (ya.all(cb, '[role=checkbox], input[type=checkbox]')[0] || cb)
        const name = lines(row).find((l) => /[\p{L}]/u.test(l)) || inner.getAttribute('aria-label') || ''
        const checked = inner.getAttribute('aria-checked') === 'true' || inner.checked === true || inner.hasAttribute('checked') || cb.hasAttribute('checked')
        return { i, name, checked }
      })
    },
    // o ket qua trong "Chon mot danh sach phat" (ytcp-entity-card role=option: .title, .subtitle "N video")
    tiles() {
      const d = dialog()
      if (!d) return []
      const cRe = re(L.tileCount)
      let tiles = ya.all(d, SEL.tile).filter((t) => vis(t) && lines(t).some((l) => cRe.test(l)))
      if (!tiles.length) {
        let counts = ya.all(d, '*').filter((el) => vis(el) && cRe.test(txt(el)))
        counts = counts.filter((el) => !counts.some((o) => o !== el && el.contains(o)))
        tiles = counts.map((c) => {
          let t = c
          while (t.parentElement && t.parentElement !== d && !counts.some((o) => o !== c && t.parentElement.contains(o)) && t.parentElement.getBoundingClientRect().width < 420 && !t.parentElement.querySelector('input')) t = t.parentElement
          return t
        })
      }
      return outermost(tiles).map((t, i) => {
        t.setAttribute('data-yah-tile', String(i))
        const tt = ya.all(t, SEL.tileTitle).find(vis)
        const title = (tt && txt(tt)) || lines(t).find((l) => !cRe.test(l) && !/^\d+(:\d+)+$/.test(l) && /[\p{L}\p{N}]/u.test(l)) || ''
        const cl = lines(t).find((l) => cRe.test(l)) || ''
        return { i, title, count: Number(((cRe.exec(cl) || [])[1] || '0').replace(/[.,]/g, '')) }
      })
    },
    noResult: () => { const d = dialog(); return !!(d && re(L.noResult).test(txt(d))) },
    toast(regex) { return ya.find({ text: '', regex }).length > 0 },
    busy: () => ya.all(document, SEL.progress).some(vis),
    // keo-tha HTML5 gia lap: nhan ≡ (mousedown), dragstart tren khung keo, tha len vach
    // .shelf-placeholder ke ben phan dich (truoc neu keo len, sau neu keo xuong)
    html5Drag(from, to) {
      const a = card(from), b = card(to)
      if (!a || !b) return false
      const h = ya.all(a, SEL.handle)[0] || a
      const hr = h.getBoundingClientRect()
      fire(h, 'mousedown', hr.left + 5, hr.top + 5)
      const src = ya.all(a, SEL.draggable)[0] || a.closest('[draggable="true"]') || a
      const shelf = b.closest('.shelf-element') || b
      let z = shelf
      do { z = to < from ? z.previousElementSibling : z.nextElementSibling } while (z && !z.matches(SEL.placeholder) && !z.matches('.shelf-element'))
      const zone = z && z.matches(SEL.placeholder) ? z : b
      const r = zone.getBoundingClientRect()
      const x = r.left + 30, y = r.top + r.height / 2
      const dt = new DataTransfer()
      fire(src, 'dragstart', hr.left + 5, hr.top + 5, dt)
      fire(b, 'dragenter', x, y, dt); fire(b, 'dragover', x, y, dt)
      if (zone !== b) { fire(zone, 'dragenter', x, y, dt); fire(zone, 'dragover', x, y, dt) }
      fire(zone, 'drop', x, y, dt)
      fire(src, 'dragend', x, y, dt)
      fire(h, 'mouseup', x, y)
      return true
    },
  }
}

// Goi ham trong thu vien trang (cai lai sau moi lan tai trang)
const install = `(${homeLib})(${JSON.stringify(LABELS)}, ${JSON.stringify(SEL)})`
// loi trong trang duoc tra ve (thay vi "Script failed to execute") de bao ro ham nao hong
const lib = async (page, name, ...args) => {
  const r = await page.eval(`(name, args) => { try { ${install}; return { v: window.__yaHome[name](...args) } } catch (e) { return { err: String(e && e.stack || e) } } }`, name, args)
  if (r && r.err) throw new StepError(`Lỗi khi đọc trang (${name}): ${r.err.split('\n')[0]}`, page.step)
  return r ? r.v : undefined
}
// Cho den khi fn(window.__yaHome, arg) (chay trong trang) tra ve gia tri "co"
const waitLib = (page, fn, arg, what, timeout) => page.until(`(arg) => { ${install}; return (${fn})(window.__yaHome, arg) }`, [arg], { what, timeout })

// Muc tieu theo nhan: regex de tim, text de bao loi de doc (driver bo qua regex neu thieu text)
const by = (regex, name) => ({ text: name, regex })
const inMenu = (regex, name) => ({ text: name, regex, within: { selector: SEL.overlay } })
const inDialog = (regex, name) => ({ text: name, regex, within: { selector: SEL.dialog } })
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
const noop = () => {}

function mouse(page, type, x, y, extra = {}) {
  page.wc.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), ...extra })
}

// ---- mo trang ---------------------------------------------------------------------
async function openHomeTab(page, input = {}, { urls, log = noop } = {}) {
  return page.run('Mở Tùy chỉnh kênh → Thẻ Trang chủ', async () => {
    const uc = input.ucId || channelOf(page.url())
    if (!uc) throw new StepError('Không biết mã kênh đích (UC…) để mở Thẻ Trang chủ.', page.step)
    await page.goto(`${urls.studio}/channel/${uc}/editing/hometab`, { wait: by(LABELS.addSection, 'Thêm phần kênh') })
    // danh sach phan kenh tai cham: cho toi khi so the dung yen
    let last = -1
    const end = Date.now() + 4000
    for (;;) {
      const n = (await lib(page, 'layout')).sections.length
      if (n === last && n > 0) break
      if (Date.now() > end) break
      last = n
      await sleep(400)
    }
    const lay = await lib(page, 'layout')
    if (!lay.homeTabOn) log('warn', 'Thẻ Trang chủ của kênh này đang TẮT: phần kênh vẫn sửa được nhưng người xem chưa thấy.')
    return lay
  })
}

const readLayout = async (page) => {
  const lay = await lib(page, 'layout')
  return { ...lay, limit: lay.limit || MAX_SECTIONS }
}

async function closeDialog(page) {
  if (!(await lib(page, 'dialogOpen'))) return
  for (const [r, n] of [[LABELS.cancel, 'Hủy'], [LABELS.close, 'Đóng']]) {
    if (await page.has(inDialog(r, n))) {
      await page.click(inDialog(r, n))
      await sleep(200)
      if (!(await lib(page, 'dialogOpen'))) return
    }
  }
  await page.press('Escape')
}

const limitError = (lay, step) => new StepError(`Trang chủ đã có ${lay.sections.length}/${lay.limit} phần kênh (giới hạn của YouTube). Xóa bớt một phần rồi chạy lại.`, step)

// Mo menu "+ Them phan kenh" va chon muc (bao loi neu muc bi lam mo)
async function addSectionMenu(page, itemRegex, name) {
  const btn = await lib(page, 'button', LABELS.addSection)
  if (btn.disabled) throw new StepError('Nút "Thêm phần kênh" đang bị khóa (có thể đã đủ số phần kênh tối đa).', page.step)
  await page.click(by(LABELS.addSection, 'Thêm phần kênh'))
  await page.waitFor(inMenu(itemRegex, name))
  const it = await lib(page, 'item', itemRegex)
  if (it.disabled) {
    await page.press('Escape')
    throw new StepError(`Mục "${name}" trong menu "Thêm phần kênh" đang bị làm mờ (có thể đã đủ số phần kênh tối đa).`, page.step)
  }
  await page.click(inMenu(itemRegex, name))
}

// ---- A. them kenh vao "Kenh noi bat" -------------------------------------------------
// input: { channel: { ucId, handle, url }, channelName?, target?: { ucId, handle }, searchTimeout? }
// Tra ve { status: 'added' | 'already' | 'self', name, created }
async function addFeaturedChannel(page, input, { log = noop } = {}) {
  const ch = input.channel
  const target = { ucId: (input.target && input.target.ucId) || channelOf(page.url()), handle: input.target && input.target.handle }
  if (sameChannel(target, ch)) {
    log('info', 'Kênh đích chính là kênh mới: bỏ qua bước thêm vào Kênh nổi bật.')
    return { status: 'self', name: input.channelName || '' }
  }
  return page.run('Thêm kênh vào "Kênh nổi bật"', async () => {
    const lay = await readLayout(page)
    const idx = lay.sections.findIndex((s) => s.kind === 'featured')
    let created = false
    if (idx >= 0) {
      const c = await lib(page, 'cardCenter', idx)
      mouse(page, 'mouseMove', c.x, c.y) // ⋮ chi hien khi re chuot vao the
      await sleep(250)
      if (!(await lib(page, 'markKebab', idx))) throw new StepError('Không thấy nút ⋮ của phần "Kênh nổi bật".', page.step)
      await page.click({ selector: '[data-yah="kebab"]', hidden: true })
      await page.click(inMenu(LABELS.editSection, 'Chỉnh sửa nội dung trong phần kênh'))
    } else {
      if (lay.sections.length >= lay.limit) throw limitError(lay, page.step)
      log('info', 'Kênh này chưa có phần "Kênh nổi bật": tạo phần mới.')
      await addSectionMenu(page, LABELS.menuFeatured, 'Kênh nổi bật')
      created = true
    }
    await page.waitFor(inDialog(LABELS.channelSearch, 'Một kênh YouTube bất kỳ'))
    const before = (await lib(page, 'sectionChannels')) || []
    const has = (name) => before.some((n) => norm(n) === norm(name))
    if (input.channelName && has(input.channelName)) {
      await closeDialog(page)
      return { status: 'already', name: input.channelName, created: false }
    }
    await page.type(inDialog(LABELS.channelSearch, 'Một kênh YouTube bất kỳ'), ch.url)
    const found = await waitLib(page, (h) => (h.channelRows().length ? 'ok' : h.noResult() ? 'none' : ''), {}, 'kết quả tìm kênh', input.searchTimeout || SEARCH_TIMEOUT)
      .catch(() => 'none')
    if (found !== 'ok') {
      await closeDialog(page)
      throw new StepError(`Không tìm thấy kênh ${ch.url} trong ô tìm kiếm của Studio (link sai, hoặc kênh mới tạo chưa tìm được).`, page.step)
    }
    const rows = await lib(page, 'channelRows')
    const row = (input.channelName && rows.find((r) => norm(r.name) === norm(input.channelName))) || rows[0]
    if (rows.length > 1 && !input.channelName) log('warn', `Tìm thấy ${rows.length} kênh, chọn kênh đầu tiên "${row.name}".`)
    // da tich san = da co trong phan: KHONG bam (bam se bo tich)
    if (row.checked || has(row.name)) {
      await closeDialog(page)
      return { status: 'already', name: row.name, created: false }
    }
    await page.click({ selector: `[data-yah-row="${row.i}"]` })
    const grown = await waitLib(page, (h, a) => (h.sectionChannels() || []).some((n) => n.toLowerCase() === a.name) || (h.sectionChannels() || []).length > a.n,
      { name: norm(row.name), n: before.length }, `"${row.name}" trong danh sách bên phải`, 5000).catch(() => false)
    if (!grown) {
      await closeDialog(page)
      throw new StepError(`Đã tích "${row.name}" nhưng kênh không vào danh sách (có thể phần đã đủ số kênh tối đa).`, page.step)
    }
    await page.click(inDialog(LABELS.done, 'Xong'))
    await waitLib(page, (h) => !h.dialogOpen(), {}, 'hộp thoại kênh đóng lại')
    // kiem lai: so kenh trong the tang
    const after = await readLayout(page)
    const f = after.sections.filter((s) => s.kind === 'featured')
    const ok = created ? f.length > 0 : f.length && f[0].count > lay.sections[idx].count
    if (!ok) log('warn', 'Không thấy số kênh trong "Kênh nổi bật" tăng lên. Kiểm tra lại trên Studio.')
    return { status: 'added', name: row.name, created }
  })
}

// ---- B. them phan "Danh sach phat don" -------------------------------------------------
// input: { playlist: { id, url }, playlistTitle?, searchTimeout? }
// Tra ve { status: 'added' | 'already', title, index }
async function addPlaylistSection(page, input, { log = noop } = {}) {
  return page.run('Thêm phần "Danh sách phát đơn"', async () => {
    const lay = await readLayout(page)
    const dup = (title) => lay.sections.find((s) => s.kind === 'playlist' && norm(s.name) === norm(title))
    if (input.playlistTitle && dup(input.playlistTitle)) return { status: 'already', title: input.playlistTitle, index: dup(input.playlistTitle).i }
    if (lay.sections.length >= lay.limit) throw limitError(lay, page.step)
    await addSectionMenu(page, LABELS.menuSinglePlaylist, 'Danh sách phát đơn')
    await page.waitFor(inDialog(LABELS.anyPlaylist, 'Danh sách phát bất kỳ trên YouTube'))
    const before = JSON.stringify(await lib(page, 'tiles'))
    await page.type(inDialog(LABELS.anyPlaylist, 'Danh sách phát bất kỳ trên YouTube'), input.playlist.url)
    const r = await waitLib(page, (h, a) => { const t = h.tiles(); return t.length && JSON.stringify(t) !== a ? 'ok' : h.noResult() ? 'none' : '' },
      before, 'kết quả tìm danh sách phát', input.searchTimeout || SEARCH_TIMEOUT).catch(() => 'none')
    if (r !== 'ok') {
      await closeDialog(page)
      throw new StepError(`Không tìm thấy danh sách phát ${input.playlist.url} (link sai, hoặc danh sách đang ở chế độ Riêng tư).`, page.step)
    }
    const tiles = await lib(page, 'tiles')
    const tile = (input.playlistTitle && tiles.find((t) => norm(t.title) === norm(input.playlistTitle))) || tiles[0]
    if (tiles.length > 1 && !input.playlistTitle) log('warn', `Có ${tiles.length} kết quả, chọn kết quả đầu "${tile.title}".`)
    if (dup(tile.title)) {
      await closeDialog(page)
      return { status: 'already', title: tile.title, index: dup(tile.title).i }
    }
    await page.click({ selector: `[data-yah-tile="${tile.i}"]` })
    await waitLib(page, (h) => !h.dialogOpen(), {}, 'hộp thoại danh sách phát đóng lại')
    const end = Date.now() + 5000
    for (;;) {
      const now = await readLayout(page)
      const hit = now.sections.filter((s) => s.kind === 'playlist' && norm(s.name) === norm(tile.title))
      if (hit.length && now.sections.length > lay.sections.length) return { status: 'added', title: tile.title, index: hit[hit.length - 1].i, total: now.sections.length }
      if (Date.now() > end) throw new StepError(`Đã chọn "${tile.title}" nhưng không thấy phần mới trong Bố cục.`, page.step)
      await sleep(250)
    }
  })
}

// ---- doi vi tri mot phan (keo tay ≡) --------------------------------------------------
// from, to: chi so tinh tu 0. Tra ve true neu thu tu da dung.
async function moveSection(page, from, to, { log = noop } = {}) {
  return page.run(`Kéo phần kênh tới vị trí ${to + 1}`, async () => {
    const lay = await readLayout(page)
    if (from === to) return true
    if (from < 0 || from >= lay.sections.length) throw new StepError('Không thấy phần kênh cần kéo.', page.step)
    to = Math.max(0, Math.min(to, lay.sections.length - 1))
    const want = lay.sections[from].title
    const okNow = async () => (await readLayout(page)).sections.findIndex((s) => s.title === want) === to
    // 1) Studio that dung keo-tha HTML5 (.maybe-draggable + vach .shelf-placeholder): gia lap su kien ngay
    //    trong trang. KHONG keo bang chuot that luc nay: Chromium se mo phien keo-tha cua he dieu hanh.
    if (await lib(page, 'html5', from)) {
      await lib(page, 'html5Drag', from, to)
      await sleep(500)
      if (await okNow()) return true
    } else {
      // 2) danh sach tu sap xep bang chuot: nhan ≡, di chuyen tung buoc, tha
      const pts = await lib(page, 'dragPoints', from, to)
      if (pts) {
        const { h: h2, t: tgt } = pts
        const y2 = to < from ? tgt.top + 6 : tgt.bottom - 6
        mouse(page, 'mouseMove', h2.x, h2.y)
        mouse(page, 'mouseDown', h2.x, h2.y, { button: 'left', clickCount: 1 })
        const steps = 14
        for (let k = 1; k <= steps; k++) {
          mouse(page, 'mouseMove', h2.x + 2, h2.y + ((y2 - h2.y) * k) / steps, { modifiers: ['leftButtonDown'] })
          await sleep(30)
        }
        await sleep(150)
        mouse(page, 'mouseUp', h2.x + 2, y2, { button: 'left', clickCount: 1 })
        await sleep(500)
        if (await okNow()) return true
      }
    }
    log('warn', `Không kéo được phần "${want}" tới vị trí ${to + 1}. Phần vẫn được thêm ở vị trí hiện tại; hãy kéo tay trên Studio nếu cần.`)
    return false
  })
}

// ---- xuat ban ------------------------------------------------------------------------
async function publish(page, { log = noop, timeout = 30000 } = {}) {
  return page.run('Xuất bản', async () => {
    const b = await lib(page, 'button', LABELS.publish)
    if (!b.found) throw new StepError('Không thấy nút "Xuất bản".', page.step)
    if (b.disabled) return false // khong co gi thay doi
    await page.click(by(LABELS.publish, 'Xuất bản'))
    const r = await waitLib(page, (h, L) => {
      if (h.toast(L.publishError)) return 'error'
      if (h.toast(L.published)) return 'toast'
      const b = h.button(L.publish)
      return b.found && b.disabled && !h.busy() ? 'disabled' : ''
    }, LABELS, 'thông báo "Đã áp dụng nội dung thay đổi"', timeout)
    if (r === 'error') throw new StepError('Studio báo lỗi khi xuất bản. Mở Thẻ Trang chủ để xem lại.', page.step)
    if (r === 'disabled') {
      // khong thay thong bao nhung nut da xam lai: cho them chut xem co bao loi khong
      await sleep(800)
      if (await lib(page, 'toast', LABELS.publishError)) throw new StepError('Studio báo lỗi khi xuất bản.', page.step)
    }
    log('ok', 'Đã xuất bản Thẻ Trang chủ.')
    return true
  })
}

// Bo thay doi chua xuat ban (nut "Hủy" dau trang), de lan mo trang sau khong bi hoi "roi trang?"
async function discard(page) {
  const b = await lib(page, 'markOutside', LABELS.cancel, 'discard')
  if (!b || b.disabled) return false
  await page.click({ selector: '[data-yah="discard"]' })
  await waitLib(page, (h, L) => { const x = h.button(L.publish); return !x.found || x.disabled }, LABELS, 'nút "Xuất bản" xám lại', 5000).catch(() => {})
  return true
}

// ---- tron goi cho mot kenh dich --------------------------------------------------------
// input: { ucId, target: {ucId, handle}, channel: {ucId, handle, url}, channelName?, playlist: {id, url},
//          playlistTitle?, position (0 = cuoi, N = vi tri thu N), doChannel, doPlaylist, searchTimeout? }
// Tra ve { channel, playlist, moved, published, errors: [] } (khong nem loi cho tung phan; chi loi mo trang)
async function updateHomeTab(page, input, { urls, log = noop, onStep = noop } = {}) {
  const out = { channel: null, playlist: null, moved: null, published: false, errors: [] }
  onStep('open')
  await openHomeTab(page, { ucId: input.ucId || (input.target && input.target.ucId) }, { urls, log })
  const fail = async (part, e) => {
    out[part] = { status: 'error', error: e.message }
    out.errors.push(e.message)
    log('error', e.message)
    await closeDialog(page).catch(() => {})
  }
  if (input.doChannel) {
    onStep('channel')
    try {
      out.channel = await addFeaturedChannel(page, input, { log })
      if (out.channel.status === 'already') log('info', `"${out.channel.name}" đã có trong Kênh nổi bật: bỏ qua.`)
      if (out.channel.status === 'added') log('ok', `Đã thêm "${out.channel.name}" vào Kênh nổi bật${out.channel.created ? ' (phần mới)' : ''}.`)
    } catch (e) { await fail('channel', e) }
  }
  if (input.doPlaylist) {
    onStep('playlist')
    try {
      out.playlist = await addPlaylistSection(page, input, { log })
      if (out.playlist.status === 'already') log('info', `Đã có phần "Danh sách phát đơn: ${out.playlist.title}": bỏ qua.`)
      if (out.playlist.status === 'added') {
        log('ok', `Đã thêm phần "Danh sách phát đơn: ${out.playlist.title}".`)
        if (input.position > 0 && input.position - 1 !== out.playlist.index) {
          onStep('move')
          out.moved = await moveSection(page, out.playlist.index, input.position - 1, { log })
        }
      }
    } catch (e) { await fail('playlist', e) }
  }
  const changed = (out.channel && out.channel.status === 'added') || (out.playlist && out.playlist.status === 'added') || out.moved
  if (changed) {
    onStep('publish')
    try { out.published = await publish(page, { log }) } catch (e) { out.errors.push(e.message); log('error', e.message) }
  } else await discard(page).catch(() => {})
  return out
}

module.exports = { LABELS, SEL, _install: install, openHomeTab, readLayout, addFeaturedChannel, addPlaylistSection, moveSection, publish, discard, updateHomeTab }
