// Dieu khien mot trang YouTube / YouTube Studio trong Electron giong nguoi dung:
// tim phan tu theo CHU HIEN TREN MAN HINH (hoac selector), bam bang chuot that
// (sendInputEvent), go chu bang insertText, chon file cho <input type=file> qua CDP.
// Moi buoc cho phan tu xuat hien (co han), loi thi bao bang tieng Viet + luu anh/HTML.
const fs = require('fs')
const path = require('path')

class StepError extends Error {
  constructor(message, step) { super(message); this.step = step || '' }
}

// Chay trong trang. Tim xuyen shadow DOM; chi lay phan tu dang hien.
const HELPER = `(() => {
  if (window.__ya) return
  // Studio co cho viet chu tieng Viet dang to hop (vd "i" + dau nang U+0323): dua ve NFC truoc khi so
  const norm = (s) => String(s || '').normalize('NFC').replace(/\\s+/g, ' ').trim().toLowerCase()
  const visible = (el) => {
    if (!el.isConnected) return false
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const st = getComputedStyle(el)
    return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) !== 0
  }
  const all = (root, sel, out = []) => {
    for (const el of root.querySelectorAll(sel)) out.push(el)
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) all(el.shadowRoot, sel, out)
    return out
  }
  const label = (el) => [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('placeholder'), el.innerText !== undefined ? el.innerText : el.textContent]
  const matches = (el, t) => {
    if (t.text === undefined && !t.regex) return true
    const ls = label(el).map(norm).filter(Boolean)
    if (t.regex) { const re = new RegExp(t.regex, 'i'); return ls.some((l) => re.test(l)) }
    const want = norm(t.text)
    return t.exact ? ls.some((l) => l === want) : ls.some((l) => l.includes(want))
  }
  // Chi giu phan tu "sau nhat": bo phan tu cha neu con cua no cung khop.
  const deepest = (list) => list.filter((el) => !list.some((o) => o !== el && el.contains(o)))
  function scope(t) {
    if (!t.within) return [document]
    const w = find(typeof t.within === 'string' ? { selector: t.within } : t.within, true)
    return w.length ? w : []
  }
  function find(t, many) {
    let found = []
    for (const root of scope(t)) {
      const list = all(root.shadowRoot || root, t.selector || '*').filter((el) => (t.hidden || visible(el)) && matches(el, t))
      found = found.concat(t.selector ? list : deepest(list))
    }
    if (t.nth !== undefined) { const el = found[t.nth < 0 ? found.length + t.nth : t.nth]; found = el ? [el] : [] }
    return many ? found : found.slice(0, 1)
  }
  let seq = 0
  window.__ya = {
    norm, visible, all, find,
    one: (t) => find(t)[0] || null,
    count: (t) => find(t, true).length,
    // danh dau phan tu de main tim lai (vd chon file qua CDP)
    mark: (t) => { const el = find(t)[0]; if (!el) return ''; const id = 'ya' + (++seq); el.setAttribute('data-ya', id); return id },
    rect: (t) => {
      const el = find(t)[0]
      if (!el) return null
      el.scrollIntoView({ block: 'center', inline: 'center' })
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      // phan tu bi che (hop thoai, lop phu)? khi do bam bang el.click()
      let top = document.elementFromPoint(x, y)
      while (top && top.shadowRoot) { const inner = top.shadowRoot.elementFromPoint(x, y); if (!inner || inner === top) break; top = inner }
      const covered = !(top && (el === top || el.contains(top) || top.contains(el)))
      return { x, y, covered }
    },
    text: (t) => { const el = find(t)[0]; return el ? (el.innerText || el.textContent || '').trim() : null },
    value: (t) => { const el = find(t)[0]; return el ? ('value' in el ? el.value : el.textContent) : null },
    domClick: (t) => { const el = find(t)[0]; if (!el) return false; el.click(); return true },
    focus: (t) => {
      const el = find(t)[0]
      if (!el) return false
      el.scrollIntoView({ block: 'center' })
      el.focus()
      return true
    },
    selectAll: () => {
      const el = document.activeElement && (document.activeElement.shadowRoot ? document.activeElement.shadowRoot.activeElement : document.activeElement)
      if (el && 'select' in el && 'value' in el) { el.select(); return true }
      document.execCommand('selectAll')
      return true
    },
  }
})()`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const describe = (t) => (typeof t === 'string' ? `"${t}"` : t.text !== undefined ? `"${t.text}"` : t.regex ? `/${t.regex}/` : t.selector)
const target = (t) => (typeof t === 'string' ? { text: t } : t)

class Page {
  // wc: webContents (BrowserWindow an hoac khung WebContentsView)
  constructor(wc, opts = {}) {
    this.wc = wc
    this.timeout = opts.timeout || 20000
    this.log = opts.log || (() => {})
    this.shotDir = opts.shotDir || ''
    this.step = ''
    this.shouldStop = opts.shouldStop || (() => false)
  }

  url() { return this.wc.getURL() }

  async goto(url, { wait } = {}) {
    try { await this.wc.loadURL(url) } catch (e) {
      // ERR_ABORTED: trang tu chuyen huong (SPA) - khong phai loi
      if (!/ERR_ABORTED|\(-3\)/.test(String(e.message))) throw new StepError(`Không mở được ${url}: ${e.message}`, this.step)
    }
    if (wait) await this.waitFor(wait)
  }

  async eval(fn, ...args) {
    if (this.wc.isDestroyed()) throw new StepError('Cửa sổ trình duyệt đã bị đóng.', this.step)
    const code = `${HELPER};(${fn})(${args.map((a) => JSON.stringify(a)).join(',')})`
    return this.wc.executeJavaScript(code, true)
  }

  // Cho den khi fn(trang) tra ve gia tri "co" (khong null/false/0/''); tra ve gia tri do.
  async until(fn, args = [], { timeout = this.timeout, what = 'trang phản hồi' } = {}) {
    const end = Date.now() + timeout
    let last
    for (;;) {
      if (this.shouldStop()) throw new StepError('Đã dừng theo yêu cầu.', this.step)
      try { last = await this.eval(fn, ...args) } catch (e) { last = null } // trang dang tai lai
      if (last) return last
      if (Date.now() > end) throw new StepError(`Quá ${Math.round(timeout / 1000)} giây vẫn chưa thấy ${what}.`, this.step)
      await sleep(250)
    }
  }

  // Cho phan tu (theo chu hoac selector) xuat hien.
  async waitFor(t, opts = {}) {
    t = target(t)
    return this.until((x) => window.__ya.count(x), [t], { what: describe(t), ...opts })
  }

  async waitGone(t, opts = {}) {
    t = target(t)
    return this.until((x) => !window.__ya.count(x), [t], { what: `${describe(t)} biến mất`, ...opts })
  }

  async waitUrl(re, opts = {}) {
    const end = Date.now() + (opts.timeout || this.timeout)
    while (!re.test(this.url())) {
      if (this.shouldStop()) throw new StepError('Đã dừng theo yêu cầu.', this.step)
      if (Date.now() > end) throw new StepError(`Trang không chuyển tới địa chỉ mong đợi (đang ở ${this.url()}).`, this.step)
      await sleep(250)
    }
    return this.url()
  }

  async has(t) { return (await this.eval((x) => window.__ya.count(x), target(t))) > 0 }
  async count(t) { return this.eval((x) => window.__ya.count(x), target(t)) }
  async text(t) { return this.eval((x) => window.__ya.text(x), target(t)) }
  async value(t) { return this.eval((x) => window.__ya.value(x), target(t)) }

  // Bam nhu nguoi dung (chuot that). Neu phan tu bi lop khac che thi dung el.click().
  async click(t, opts = {}) {
    t = target(t)
    await this.waitFor(t, opts)
    // cho trang ve xong 2 khung hinh: cua so an vua tai xong co luc bo mat cu bam dau tien
    await this.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {})
    const r = await this.eval((x) => window.__ya.rect(x), t)
    if (!r) throw new StepError(`Không thấy ${describe(t)} để bấm.`, this.step)
    if (r.covered || opts.dom) {
      await this.eval((x) => window.__ya.domClick(x), t)
    } else {
      const x = Math.round(r.x), y = Math.round(r.y)
      this.wc.sendInputEvent({ type: 'mouseMove', x, y })
      this.wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      this.wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    }
    await sleep(opts.after === undefined ? 300 : opts.after)
  }

  // Go chu vao o (input / textarea / contenteditable). clear: xoa noi dung cu truoc.
  async type(t, text, { clear = true, ...opts } = {}) {
    t = target(t)
    await this.waitFor(t, opts)
    await this.click(t, { after: 150 })
    await this.eval((x) => window.__ya.focus(x), t)
    // Khong dung phim Backspace: sendInputEvent chay bat dong bo, co luc toi SAU insertText
    // va xoa mat ky tu cuoi. insertText thay the vung dang chon; o trong thi xoa bang execCommand.
    if (clear) {
      await this.eval(() => window.__ya.selectAll())
      if (!text) await this.eval(() => document.execCommand('delete'))
    }
    if (text) await this.wc.insertText(String(text))
    // cho o nhan du chu (insertText cung co the den muon)
    const want = String(text || '')
    await this.until((w, c) => {
      let el = document.activeElement
      while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement
      if (!el) return true
      const v = 'value' in el ? el.value : el.textContent
      return c ? v.replace(/\s+$/, '') === w : v.includes(w)
    }, [want, clear], { timeout: 3000, what: `ô nhập nhận đủ chữ "${want.slice(0, 40)}"` }).catch(() => {})
    await sleep(150)
  }

  async press(key) {
    this.wc.sendInputEvent({ type: 'keyDown', keyCode: key })
    if (key.length === 1) this.wc.sendInputEvent({ type: 'char', keyCode: key })
    this.wc.sendInputEvent({ type: 'keyUp', keyCode: key })
    await sleep(150)
  }

  // Chon file cho <input type=file> ma khong mo hop thoai cua he dieu hanh.
  async setFiles(t, files) {
    t = { selector: 'input[type=file]', hidden: true, ...target(t) }
    await this.waitFor(t)
    const id = await this.eval((x) => window.__ya.mark(x), t)
    const dbg = this.wc.debugger
    const attached = dbg.isAttached()
    if (!attached) dbg.attach('1.3')
    try {
      const { result } = await dbg.sendCommand('Runtime.evaluate', {
        expression: `(${HELPER}, window.__ya.all(document, '[data-ya="${id}"]')[0])`,
      })
      if (!result || !result.objectId) throw new StepError('Không tìm thấy ô chọn file.', this.step)
      await dbg.sendCommand('DOM.setFileInputFiles', { objectId: result.objectId, files: files.map((f) => path.resolve(f)) })
    } finally { if (!attached) dbg.detach() }
    await sleep(300)
  }

  // Ghi lai anh + HTML khi loi, de nguoi dung gui lai cho nguoi sua tool.
  async snapshot(name) {
    if (!this.shotDir || this.wc.isDestroyed()) return ''
    try {
      fs.mkdirSync(this.shotDir, { recursive: true })
      const base = path.join(this.shotDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}`)
      const img = await this.wc.capturePage()
      fs.writeFileSync(`${base}.png`, img.toPNG())
      const html = await this.wc.executeJavaScript('document.documentElement.outerHTML').catch(() => '')
      fs.writeFileSync(`${base}.html`, `<!-- ${this.url()} -->\n${html}`)
      return base
    } catch (_) { return '' }
  }

  // Dat ten buoc dang lam (hien trong loi va nhat ky).
  async run(step, fn) {
    this.step = step
    this.log('info', step)
    return fn()
  }
}

// Trang Studio dang o kenh nao (lay tu dia chi).
const channelOf = (url) => (/\/channel\/(UC[\w-]{10,})/.exec(url) || [])[1] || ''

module.exports = { Page, StepError, HELPER, channelOf, sleep }
