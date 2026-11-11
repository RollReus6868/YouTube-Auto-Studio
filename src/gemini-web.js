// Gemini qua trinh duyet (gemini.google.com) thay cho API: tool mo Gemini trong mot cua so rieng
// (phien dang nhap Google cua tai khoan chon o settings.geminiAccount), go loi nhac, cho tra loi va
// doc chu / tai anh - nhu nguoi dung tu lam. Khong dung khung Studio (paneChain) de khong phai cho
// viec dang video hang gio.
//
//   const gw = createGeminiWeb(ctx)        // main.js gan vao ctx.geminiWeb
//   await gw.ask({ prompt, label, shouldStop, timeoutMs })        -> chu tra loi
//   await gw.image({ prompt, label, shouldStop, dir, timeoutMs }) -> { file, mime }
//   gw.open() / gw.status() / gw.close()
//
// Loi nem ra: Error (message tieng Viet) co code GEMINI_SIGNIN | GEMINI_LIMIT | GEMINI_BLOCKED |
// GEMINI_TIMEOUT | GEMINI_EMPTY | GEMINI_STOPPED.
//
// Phan "chay mot yeu cau tren mot Page" (askOn, imageOn) tach rieng de kiem bang tests/flows/gemini.test.js
// voi trang Gemini gia (tests/mock-yt/gemini).
const fs = require('fs')
const path = require('path')
const { sleep } = require('./studio/driver')

const TITLE = 'Gemini · YT Auto Studio'
const geminiBase = () => String(process.env.YA_GEMINI_BASE || 'https://gemini.google.com').replace(/\/+$/, '')

const fail = (code, message) => Object.assign(new Error(message), { code })
const CODES = ['GEMINI_SIGNIN', 'GEMINI_LIMIT', 'GEMINI_BLOCKED', 'GEMINI_TIMEOUT', 'GEMINI_EMPTY', 'GEMINI_STOPPED']

// Chu Gemini bao het luot / chua dang nhap (chi xet cau tra loi ngan, de bai viet co chu "limit" khong bi bat nham)
const LIMIT_RE = /reached (your|the) [^.\n]{0,60}limit|limit (has been |was )?reached|you('|’)ve hit (your|the) [^.\n]{0,40}limit|đ(ã|a) đạt (đến |tới )?(giới hạn|hạn mức)|hết lượt|hết hạn mức/i
const SIGNIN_TEXT_RE = /are you signed in\?|can('|’)t seem to create any|bạn đã đăng nhập chưa/i
const SHORT = 1500

// O nhap: Quill (rich-textarea > div.ql-editor). div.ql-clipboard cung contenteditable nhung KHONG phai o nhap.
const INPUT_SELECTORS = [
  'rich-textarea div.ql-editor[contenteditable="true"]',
  'div.ql-editor[contenteditable="true"]',
  'input-area-v2 [contenteditable="true"][role="textbox"]',
]
const SEND_SELECTOR = 'button[aria-label="Send message"], gem-icon-button.send-button:not(.stop) button:not([aria-label*="Stop"]), button.send-button:not(.stop)'

// ---- doc trang (chay trong trang; mot ham tu chua - Trusted Types: khong eval chuoi trong trang) ----
function geminiScan(inputSelectors) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()
  const shown = (el) => {
    if (!el || !el.isConnected) return false
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const st = getComputedStyle(el)
    return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) !== 0
  }
  const inside = (el, sel) => !!(el.closest && el.closest(sel))
  const out = { url: location.href, input: '', inputText: '', signin: false, blocked: '', stop: false, send: false, turns: 0, queries: 0, text: '', raw: 0, images: [], alert: '' }

  for (const sel of inputSelectors) {
    const el = [...document.querySelectorAll(sel)].find((x) => shown(x) && !x.classList.contains('ql-clipboard'))
    if (el) { out.input = sel; out.inputText = el.textContent || ''; break }
  }

  // chua dang nhap: nut / link "Sign in" toi accounts.google.com (khong tinh link SignOutOptions cua avatar)
  for (const el of document.querySelectorAll('a, button')) {
    if (inside(el, 'model-response, user-query') || !shown(el)) continue
    const href = el.getAttribute('href') || ''
    if (/accounts\.google\.com\/(ServiceLogin|signin|v3\/signin|AccountChooser|InteractiveLogin)/i.test(href) || /^(sign in|đăng nhập)$/i.test(norm(el.textContent))) { out.signin = true; break }
  }

  // hop thoai chan (dieu khoan, xac minh, chon quoc gia...): hop thoai lon dang hien, hoac o nhap bi lop phu che
  const dialogs = [...document.querySelectorAll('mat-dialog-container, [role="dialog"], [role="alertdialog"]')].filter((d) => {
    if (!shown(d)) return false
    const r = d.getBoundingClientRect()
    return r.width >= 200 && r.height >= 100
  })
  if (dialogs.length) out.blocked = norm(dialogs[0].textContent).slice(0, 200) || 'hộp thoại'
  if (!out.blocked && out.input) {
    const el = document.querySelector(out.input)
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + Math.min(r.width / 2, 40), r.top + r.height / 2)
    if (top && !el.contains(top) && !top.contains(el) && inside(top, '.cdk-overlay-container, mat-dialog-container, [role="dialog"]')) out.blocked = norm(top.textContent).slice(0, 200) || 'lớp phủ che ô nhập'
  }

  // nut Dung (dang tra loi) / nut Gui - cung mot cho, trong vung nhap lieu
  const area = document.querySelector('input-area-v2, input-container, fieldset.input-area-fieldset') || document
  for (const b of area.querySelectorAll('button')) {
    if (!shown(b)) continue
    const label = b.getAttribute('aria-label') || ''
    const icon = b.querySelector('mat-icon')
    const iconName = icon ? (icon.getAttribute('fonticon') || icon.getAttribute('data-mat-icon-name') || '') : ''
    const wrap = b.closest('gem-icon-button, .send-button')
    if (/^(stop|dừng)/i.test(label) || iconName === 'stop' || b.classList.contains('stop') || (wrap && wrap.classList.contains('stop'))) out.stop = true
    else if (/^(send|gửi)/i.test(label) || iconName === 'send' || (wrap && wrap.classList.contains('send-button'))) out.send = true
  }

  const responses = document.querySelectorAll('model-response')
  out.turns = responses.length
  out.queries = document.querySelectorAll('user-query, pending-request').length

  // Doc chu cau tra loi CUOI bang textContent theo tung khoi (trang khong duoc ve thi innerText = "")
  const last = responses[responses.length - 1]
  if (last) {
    const root = last.querySelector('message-content .markdown-main-panel') || last.querySelector('message-content div.markdown') ||
      last.querySelector('message-content') || last.querySelector('div.markdown-main-panel') || last.querySelector('structured-content-container')
    const SKIP = /^(BUTTON|MAT-ICON|SVG|STYLE|SCRIPT|TEMPLATE|NOSCRIPT|SOURCES-LIST|SOURCE-FOOTNOTE|SOURCES-CAROUSEL|SOURCES-CAROUSEL-INLINE|THINKING-OVERLAY|MODEL-THOUGHTS|GENERATED-IMAGE|SINGLE-IMAGE|IMG)$/
    const skip = (el) => SKIP.test(el.tagName) || el.classList.contains('cdk-visually-hidden') || el.getAttribute('aria-hidden') === 'true'
    const inline = (n) => {
      if (n.nodeType === 3) return n.nodeValue.replace(/[ \t\r\n\f]+/g, ' ')
      if (n.nodeType !== 1 || skip(n)) return ''
      if (n.tagName === 'BR') return '\n'
      let s = ''
      for (const c of n.childNodes) s += inline(c)
      return s
    }
    const clean = (s) => s.split('\n').map((l) => l.trim()).join('\n').trim()
    const fence = (el) => {
      const code = el.querySelector('pre code, code[data-test-id="code-content"]') || el.querySelector('pre') || el
      let lang = (/(?:^|\s)language-([\w+#.-]+)/.exec(code.className || '') || [])[1] || ''
      if (!lang) {
        const head = el.querySelector('.code-block-decoration span, .code-block-decoration')
        const t = head ? norm(head.textContent).split(' ')[0] : ''
        if (/^[\w+#.-]{1,20}$/.test(t)) lang = t.toLowerCase()
      }
      return '```' + lang + '\n' + String(code.textContent || '').replace(/\n+$/, '') + '\n```'
    }
    const list = (ul, depth) => {
      const ord = ul.tagName === 'OL'
      let i = Number(ul.getAttribute('start')) || 1
      const lines = []
      for (const li of ul.children) {
        if (li.tagName !== 'LI') continue
        let t = ''
        const subs = []
        for (const c of li.childNodes) {
          if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) subs.push(list(c, depth + 1))
          else if (c.nodeType === 1 && (c.tagName === 'PRE' || c.tagName === 'CODE-BLOCK')) subs.push(fence(c))
          else t += (c.nodeType === 1 && c.tagName === 'P' && t ? ' ' : '') + inline(c)
        }
        lines.push('  '.repeat(depth) + (ord ? `${i++}. ` : '- ') + clean(t).replace(/\n+/g, ' '))
        lines.push(...subs.filter(Boolean))
      }
      return lines.join('\n')
    }
    const table = (t) => [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => norm(inline(c))).join(' | ')).join('\n')
    const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,ul,ol,pre,code-block,table,hr,blockquote,div,br,li'
    const blocks = (el, outList) => {
      let buf = ''
      const flush = () => { const t = clean(buf); if (t) outList.push(t); buf = '' }
      for (const c of el.childNodes) {
        if (c.nodeType === 3) { buf += c.nodeValue.replace(/[ \t\r\n\f]+/g, ' '); continue }
        if (c.nodeType !== 1 || skip(c)) continue
        const tag = c.tagName
        if (tag === 'BR') { buf += '\n'; continue }
        if (tag === 'PRE' || tag === 'CODE-BLOCK') { flush(); outList.push(fence(c)); continue }
        if (tag === 'P' || /^H[1-6]$/.test(tag)) { flush(); const t = clean(inline(c)); if (t) outList.push(t); continue }
        if (tag === 'UL' || tag === 'OL') { flush(); const t = list(c, 0); if (t) outList.push(t); continue }
        if (tag === 'TABLE') { flush(); const t = table(c); if (t) outList.push(t); continue }
        if (tag === 'HR') { flush(); outList.push('---'); continue }
        if (tag === 'DIV' || tag === 'BLOCKQUOTE' || tag === 'SECTION' || c.querySelector(BLOCKS)) { flush(); blocks(c, outList); continue }
        buf += inline(c)
      }
      flush()
    }
    if (root) {
      const parts = []
      blocks(root, parts)
      out.text = parts.join('\n\n')
      out.raw = (root.textContent || '').length
    }
    // anh Gemini tao: moi img du lon trong cau tra loi cuoi (generated-image / single-image > img.image ...)
    for (const img of last.querySelectorAll('img')) {
      if (inside(img, 'sources-list, user-query')) continue
      const src = img.currentSrc || img.src || ''
      if (!/^(https?:|blob:|data:image\/)/.test(src)) continue
      const r = img.getBoundingClientRect()
      const w = Math.max(img.naturalWidth || 0, r.width || 0, Number(img.getAttribute('width')) || 0)
      const h = Math.max(img.naturalHeight || 0, r.height || 0, Number(img.getAttribute('height')) || 0)
      if (Math.max(w, h) >= 256) out.images.push({ src, w, h, natural: img.naturalWidth || 0 })
    }
    out.images.sort((a, b) => b.w * b.h - a.w * a.h)
  }
  // thong bao nho (snackbar / alert) - vd het luot
  const alerts = [...document.querySelectorAll('mat-snack-bar-container, simple-snack-bar, [role="alert"]')].filter(shown)
  out.alert = alerts.map((a) => norm(a.textContent)).join(' ').slice(0, 500)
  return out
}

// bam nut Dung cua Gemini (khi nguoi dung bam Dung trong tool)
function geminiPressStop() {
  const area = document.querySelector('input-area-v2, input-container, fieldset.input-area-fieldset') || document
  for (const b of area.querySelectorAll('button')) {
    const label = b.getAttribute('aria-label') || ''
    const icon = b.querySelector('mat-icon')
    const iconName = icon ? (icon.getAttribute('fonticon') || icon.getAttribute('data-mat-icon-name') || '') : ''
    const wrap = b.closest('gem-icon-button, .send-button')
    if (/^(stop|dừng)/i.test(label) || iconName === 'stop' || b.classList.contains('stop') || (wrap && wrap.classList.contains('stop'))) { b.click(); return true }
  }
  return false
}

const strip = (s) => String(s || '').replace(/\s+/g, '')
const cut = (s, n = 200) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t }

async function scan(page) {
  try { return await page.eval(geminiScan, INPUT_SELECTORS) } catch (e) {
    if (page.wc.isDestroyed()) throw fail('GEMINI_STOPPED', 'Cửa sổ Gemini bị đóng giữa chừng.')
    return null // trang dang tai lai
  }
}

function checkStop(stopIf) {
  if (stopIf()) throw fail('GEMINI_STOPPED', 'Đã dừng theo yêu cầu.')
}

// Mo chat moi va cho o nhap (hoac dau hieu chua dang nhap / hop thoai chan)
async function openChat(page, { base, stopIf, deadline }) {
  checkStop(stopIf)
  await page.goto(`${base}/app`)
  const ready = Math.min(deadline, Date.now() + 45000)
  let seen = 0
  for (;;) {
    checkStop(stopIf)
    const s = await scan(page)
    if (s) {
      if (/^https:\/\/accounts\.google\.com\//.test(s.url)) throw fail('GEMINI_SIGNIN', 'Gemini chuyển sang trang đăng nhập Google: tài khoản dùng cho Gemini chưa đăng nhập.')
      if (/^https:\/\/consent\.google\.com\//.test(s.url)) throw fail('GEMINI_BLOCKED', 'Google hỏi đồng ý điều khoản trước khi mở Gemini: hãy xử lý trong cửa sổ Gemini rồi chạy lại.')
      if (s.signin) throw fail('GEMINI_SIGNIN', 'Gemini chưa đăng nhập Google (trang hiện nút "Sign in"). Hãy mở cửa sổ Gemini và đăng nhập tài khoản dùng cho Gemini.')
      if (s.blocked) throw fail('GEMINI_BLOCKED', `Gemini đang hiện hộp thoại chặn ("${cut(s.blocked, 120)}"): hãy xử lý trong cửa sổ Gemini rồi chạy lại.`)
      if (s.input) {
        // dau hieu dang nhap / hop thoai co the hien sau o nhap mot chut: xem lai mot lan
        if (!seen) { seen = Date.now(); await sleep(800); continue }
        return s
      }
    }
    if (Date.now() > ready) throw fail('GEMINI_TIMEOUT', 'Trang Gemini không hiện ô nhập lời nhắc.')
    await sleep(400)
  }
}

// Go loi nhac (selectAll + insertText - khong Backspace) va kiem o nhan du chu (bo qua khoang trang / xuong dong:
// Quill tach dong thanh <p>, textContent mat \n)
async function typePrompt(page, sel, prompt, stopIf) {
  const T = { selector: sel }
  const want = strip(prompt)
  const got = () => page.eval((s) => { const el = document.querySelector(s); return el ? el.textContent : '' }, sel).catch(() => '')
  for (let attempt = 0; attempt < 2; attempt++) {
    checkStop(stopIf)
    await page.click(T, { after: 150 })
    await page.eval((x) => window.__ya.focus(x), T)
    await page.eval(() => window.__ya.selectAll())
    await page.wc.insertText(String(prompt))
    // Loi nhac dai (kich ban hang chuc nghin ky tu) co the vao o rat cham (may cham / Quill): KHONG go lai khi o con
    // dang nhan chu (lan go truoc chua xong se chen them -> chu bi doi). Cho toi khi khop, hoac o dung yen 1,5 giay.
    const end = Date.now() + 8000 + Math.min(60000, prompt.length * 2)
    let have = ''
    let prev = -1
    let still = Date.now()
    while (Date.now() < end) {
      have = strip(await got())
      if (have === want) {
        await sleep(400) // khong con chu nao chen them sau do
        if (strip(await got()) === want) return
        continue
      }
      if (have.length !== prev) { prev = have.length; still = Date.now() } else if (Date.now() - still > 1500) break
      await sleep(200)
    }
    if (attempt) throw fail('GEMINI_BLOCKED', `Ô nhập của Gemini không nhận đủ lời nhắc (nhận ${have.length}/${want.length} ký tự không kể khoảng trắng).`)
  }
}

// Gui (bam nut gui; du phong phim Enter) va cho Gemini nhan
async function send(page, before, stopIf) {
  const sent = (s) => s && (s.turns > before.turns || s.queries > before.queries || s.stop || (s.url !== before.url && /\/app\/[\w-]+/.test(s.url)))
  if (await page.has({ selector: SEND_SELECTOR }).catch(() => false)) await page.click({ selector: SEND_SELECTOR }, { after: 200 })
  else await page.press('Enter')
  for (let i = 0; i < 2; i++) {
    const end = Date.now() + 4000
    while (Date.now() < end) {
      checkStop(stopIf)
      const s = await scan(page)
      if (sent(s)) return
      if (s && s.blocked) throw fail('GEMINI_BLOCKED', `Gemini đang hiện hộp thoại chặn ("${cut(s.blocked, 120)}"): hãy xử lý trong cửa sổ Gemini rồi chạy lại.`)
      await sleep(250)
    }
    if (!i) {
      const s = await scan(page)
      if (s && s.input && strip(s.inputText)) await page.press('Enter')
    }
  }
  throw fail('GEMINI_BLOCKED', 'Không gửi được lời nhắc cho Gemini (bấm Gửi và Enter đều không có tác dụng).')
}

// Cho cau tra loi xong: KHONG con nut Dung + co chu + chu khong doi stableMs (aria-busy / .pending co the ket khi
// trang khong duoc ve, nen khong dua vao chung). mode 'image': xong khi co anh (hoac het cho anh).
async function waitAnswer(page, before, { stopIf, deadline, stableMs, emptyMs, mode }) {
  let lastText = null
  let since = Date.now()
  let emptySince = 0
  let started = false
  let s = null
  for (;;) {
    if (stopIf()) {
      await page.eval(geminiPressStop).catch(() => {})
      throw fail('GEMINI_STOPPED', 'Đã dừng theo yêu cầu.')
    }
    if (Date.now() > deadline) {
      if (s && s.stop) await page.eval(geminiPressStop).catch(() => {})
      throw fail('GEMINI_TIMEOUT', `Gemini trả lời quá lâu${s && s.text ? ` (mới có ${s.text.length} ký tự)` : ''}.`)
    }
    s = await scan(page)
    if (s) {
      if (/^https:\/\/accounts\.google\.com\//.test(s.url)) throw fail('GEMINI_SIGNIN', 'Gemini chuyển sang trang đăng nhập Google: tài khoản dùng cho Gemini chưa đăng nhập.')
      if (s.blocked) throw fail('GEMINI_BLOCKED', `Gemini đang hiện hộp thoại chặn ("${cut(s.blocked, 120)}"): hãy xử lý trong cửa sổ Gemini rồi chạy lại.`)
      if (LIMIT_RE.test(s.alert)) throw fail('GEMINI_LIMIT', `Gemini báo hết lượt: "${cut(s.alert)}"`)
      if (s.turns > before.turns || s.stop) started = true
      if (started) {
        const cur = s.text + '|' + s.raw + '|' + s.images.map((i) => i.src).join(',')
        if (cur !== lastText) { lastText = cur; since = Date.now() }
        const quiet = Date.now() - since
        if (!s.stop) {
          if (mode === 'image' && s.images.length && quiet >= 1000) return s
          if (s.text.trim() && quiet >= stableMs && (mode !== 'image' || quiet >= stableMs + 8000 || LIMIT_RE.test(s.text) || SIGNIN_TEXT_RE.test(s.text))) return s
          if (!s.text.trim() && !s.images.length) {
            emptySince = emptySince || Date.now()
            if (Date.now() - emptySince >= emptyMs) return s
          } else emptySince = 0
        } else emptySince = 0
      }
    }
    await sleep(400)
  }
}

// Cau tra loi la thong bao het luot / can dang nhap?
function answerError(s, mode) {
  const t = s.text.trim()
  if (t.length < SHORT && LIMIT_RE.test(t)) return fail('GEMINI_LIMIT', `Gemini báo hết lượt: "${cut(t)}"`)
  if (t.length < SHORT && SIGNIN_TEXT_RE.test(t)) return fail('GEMINI_SIGNIN', `Gemini cần đăng nhập Google để ${mode === 'image' ? 'tạo ảnh' : 'trả lời'}: "${cut(t)}"`)
  return null
}

// Mot yeu cau viet chu tren page (cua so / khung bat ky dang dung phien Google can dung)
async function askOn(page, { prompt, base = geminiBase(), shouldStop, timeoutMs = 180000, stableMs = 2500, emptyMs = 15000, mode = 'text' } = {}) {
  const stopIf = () => !!(shouldStop && shouldStop())
  prompt = String(prompt || '')
  if (!prompt.trim()) throw fail('GEMINI_EMPTY', 'Lời nhắc cho Gemini trống.')
  const deadline = Date.now() + timeoutMs
  const before = await openChat(page, { base, stopIf, deadline })
  await typePrompt(page, before.input, prompt, stopIf)
  await send(page, before, stopIf)
  const s = await waitAnswer(page, before, { stopIf, deadline, stableMs, emptyMs, mode })
  const err = mode === 'image' && s.images.length ? null : answerError(s, mode)
  if (err) throw err
  return s
}

async function ask(page, opts) {
  const s = await askOn(page, opts)
  const text = s.text.trim()
  if (!text) throw fail('GEMINI_EMPTY', 'Gemini trả lời rỗng.')
  return text
}

// Anh lh3.googleusercontent.com: bo tham so co anh (=s1024, =w512-h512...) de lay co lon nhat
function fullSizeUrl(src) {
  let u
  try { u = new URL(src) } catch (_) { return src }
  if (!/(^|\.)googleusercontent\.com$/.test(u.hostname)) return src
  const p = u.pathname
  const i = p.lastIndexOf('=')
  u.pathname = (i > p.lastIndexOf('/') ? p.slice(0, i) : p) + '=s0'
  return u.toString()
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

// Tai byte anh: blob:/data: doc trong trang; http(s) qua session cua cua so (cookie Google)
async function imageBytes(page, src) {
  if (/^(blob|data):/.test(src)) {
    const r = await page.eval(async (u) => {
      const res = await fetch(u)
      const b = new Uint8Array(await res.arrayBuffer())
      let s = ''
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
      return { b64: btoa(s), type: res.headers.get('content-type') || '' }
    }, src)
    return { buf: Buffer.from(r.b64, 'base64'), mime: r.type }
  }
  const ses = page.wc.session
  const get = async (u) => {
    const res = await ses.fetch(u, { credentials: 'include', headers: { referer: page.url() } })
    const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!res.ok || !/^image\//.test(mime)) throw new Error(`HTTP ${res.status} ${mime}`)
    return { buf: Buffer.from(await res.arrayBuffer()), mime }
  }
  const big = fullSizeUrl(src)
  if (big !== src) { try { return await get(big) } catch (_) { /* thu dia chi goc */ } }
  return get(src)
}

// Mot yeu cau ve anh tren page -> luu vao dir
async function imageOn(page, { prompt, dir, base = geminiBase(), shouldStop, timeoutMs = 240000, stableMs = 2500, emptyMs = 15000 } = {}) {
  if (!dir) throw new Error('Thiếu thư mục lưu ảnh.')
  const s = await askOn(page, { prompt, base, shouldStop, timeoutMs, stableMs, emptyMs, mode: 'image' })
  if (!s.images.length) {
    const t = s.text.trim()
    if (SIGNIN_TEXT_RE.test(t)) throw fail('GEMINI_SIGNIN', `Gemini cần đăng nhập Google để tạo ảnh: "${cut(t)}"`)
    throw fail('GEMINI_EMPTY', t ? `Gemini không tạo ảnh mà trả lời: "${cut(t)}"` : 'Gemini không trả về ảnh nào.')
  }
  let got
  try { got = await imageBytes(page, s.images[0].src) } catch (e) {
    throw fail('GEMINI_EMPTY', `Không tải được ảnh Gemini đã tạo (${e.message}).`)
  }
  const mime = EXT[got.mime] ? got.mime : 'image/png'
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `gemini-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}.${EXT[mime]}`)
  fs.writeFileSync(file, got.buf)
  return { file, mime }
}

// ---- dich vu dung chung (cua so rieng) ---------------------------------------------------
function createGeminiWeb(ctx, opts = {}) {
  const { BrowserWindow, shell } = require('electron')
  const { googleSession } = require('./studio/session')
  const base = () => opts.base || geminiBase()
  const S = { busy: false, accountId: '', signedIn: null, lastError: '', open: false, queue: 0, try: null }
  let win = null
  let winPartition = ''
  let chain = Promise.resolve()

  function account() {
    try {
      const list = ctx.accounts ? ctx.accounts.list() : []
      const want = ctx.store && ctx.store.settings ? ctx.store.settings.geminiAccount : ''
      return list.find((a) => a.id === want) || list[0] || null
    } catch (_) { return null } // chua co store (truoc app.whenReady)
  }
  const status = () => {
    const acc = S.accountId ? null : account()
    return { busy: S.busy, accountId: S.accountId || (acc ? acc.id : ''), signedIn: S.signedIn, lastError: S.lastError, open: S.open, queue: S.queue, try: S.try }
  }
  const pushState = () => ctx.push()
  // state.geminiWeb luon la status() moi nhat (tai khoan doi o trang Tai khoan / Cai dat cung hien ngay); gan de thi bo qua
  // (bai kiem YA_GEMINI_WEB_FAKE: Gemini gia cua src/ai.js tu dat state.geminiWeb, khong khoa o day)
  if (!process.env.YA_GEMINI_WEB_FAKE) Object.defineProperty(ctx.state, 'geminiWeb', { get: status, set: () => {}, enumerable: true, configurable: true })

  // Cua so Gemini cua tai khoan dang chon; doi tai khoan -> tao lai tren phien khac
  function ensureWindow() {
    const acc = account()
    if (!acc) throw fail('GEMINI_SIGNIN', 'Chưa có tài khoản Google nào (trang Tài khoản) để dùng Gemini.')
    if (win && !win.isDestroyed() && winPartition === acc.partition) return win
    if (win && !win.isDestroyed()) win.destroy()
    winPartition = acc.partition
    if (S.accountId !== acc.id) S.signedIn = null
    S.accountId = acc.id
    const w = new BrowserWindow({
      show: false, width: 1100, height: 800, title: TITLE, autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'),
      webPreferences: { session: googleSession(acc.partition), backgroundThrottling: false, contextIsolation: true, sandbox: true, spellcheck: false },
    })
    w.setMenuBarVisibility(false)
    w.on('page-title-updated', (e) => e.preventDefault()) // giu ten cua so de nguoi dung nhan ra
    const wc = w.webContents
    wc.setAudioMuted(true)
    wc.on('will-prevent-unload', (e) => e.preventDefault())
    wc.setWindowOpenHandler(({ url }) => {
      // dang nhap / xac minh Google: cua so that (giu window.opener)
      if (/^https:\/\/accounts\.google\.com\//.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { parent: w, width: 520, height: 720, autoHideMenuBar: true, title: 'Google' } }
      if (/^https?:/.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
    const sync = () => { S.open = !w.isDestroyed() && w.isVisible(); pushState() }
    w.on('show', sync)
    w.on('hide', sync)
    w.on('closed', () => { if (win === w) { win = null; winPartition = '' } S.open = false; pushState() })
    win = w
    return w
  }

  function open() {
    let w
    try { w = ensureWindow() } catch (e) { ctx.log('warn', `Gemini (trình duyệt): ${e.message}`); return false }
    const u = w.webContents.getURL()
    if (!u || u === 'about:blank') w.webContents.loadURL(`${base()}/app`).catch(() => {})
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
    pushState()
    return true
  }

  function close() {
    if (win && !win.isDestroyed()) win.destroy()
    win = null
  }

  async function runJob(kind, o) {
    S.queue--
    const stopIf = () => !!(o.shouldStop && o.shouldStop())
    const what = o.label ? ` ${o.label}` : ''
    if (stopIf()) { pushState(); throw fail('GEMINI_STOPPED', 'Đã dừng theo yêu cầu.') }
    S.busy = true
    pushState()
    ctx.log('info', `Gemini (trình duyệt): đang ${kind === 'image' ? 'vẽ ảnh' : 'viết'}${what}…`)
    let page = null
    let w = null
    try {
      w = ensureWindow()
      // Windows khong ve cua so an: hien cua so (khong gianh focus) trong luc chay
      if (w.isMinimized()) w.restore()
      if (!w.isVisible()) w.showInactive()
      const { Page } = require('./studio/driver')
      page = new Page(w.webContents, { timeout: 20000, shotDir: ctx.logFile('loi-trang'), shouldStop: () => stopIf() || w.isDestroyed() })
      const common = { base: base(), shouldStop: o.shouldStop, ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}) }
      let r
      if (kind === 'image') {
        r = await imageOn(page, { ...common, prompt: o.prompt, dir: o.dir || ctx.logFile(path.join('ai-posts', 'anh')) })
        ctx.log('ok', `Gemini (trình duyệt):${what} xong (ảnh ${path.basename(r.file)}).`)
      } else {
        r = await ask(page, { ...common, prompt: o.prompt })
        ctx.log('ok', `Gemini (trình duyệt):${what} xong (${r.length.toLocaleString('vi-VN')} ký tự).`)
      }
      S.signedIn = true
      S.lastError = ''
      return r
    } catch (e0) {
      let e = e0
      if (w && w.isDestroyed()) e = fail('GEMINI_STOPPED', 'Cửa sổ Gemini bị đóng giữa chừng.')
      else if (!CODES.includes(e.code)) {
        // loi cua driver (Page): het gio / dung / phan tu khong bam duoc
        if (stopIf()) e = fail('GEMINI_STOPPED', 'Đã dừng theo yêu cầu.')
        else e = fail(/^Quá \d+ giây/.test(e.message) ? 'GEMINI_TIMEOUT' : 'GEMINI_BLOCKED', `Gemini: ${e.message}`)
      }
      if (e.code === 'GEMINI_SIGNIN') S.signedIn = false
      S.lastError = e.message
      if (e.code !== 'GEMINI_STOPPED' && page) {
        const shot = await page.snapshot('gemini').catch(() => '')
        if (shot) ctx.log('warn', `Gemini (trình duyệt): đã lưu ảnh trang lúc lỗi: ${shot}.png`)
      }
      if (e.code === 'GEMINI_BLOCKED') open() // nguoi dung xu ly hop thoai trong cua so Gemini
      ctx.log(e.code === 'GEMINI_STOPPED' ? 'warn' : 'error', `Gemini (trình duyệt):${what} ${e.message}`)
      throw e
    } finally {
      S.busy = false
      pushState()
    }
  }

  // Mot yeu cau mot luc (hang doi noi bo)
  function enqueue(kind, o = {}) {
    S.queue++
    pushState()
    const job = chain.then(() => runJob(kind, o))
    chain = job.catch(() => {})
    return job
  }

  const gw = {
    ask: (o = {}) => enqueue('text', o),
    image: (o = {}) => enqueue('image', o),
    open,
    close,
    status,
  }

  gw.commands = {
    // mo cua so Gemini (dang nhap / dong y dieu khoan / xem)
    gemini_web_open: () => { open() },
    // tai khoan Google dung cho Gemini (id o trang Tai khoan; '' = tai khoan dau tien)
    gemini_web_account: (id) => {
      ctx.store.save({ geminiAccount: String(id || '') })
      ctx.refreshSettings()
      const acc = account()
      S.accountId = ''
      S.signedIn = null
      if (acc) ctx.log('info', `Gemini (trình duyệt) dùng tài khoản "${acc.label}".`)
      pushState()
    },
    // thu Gemini: viet mot cau tra loi hoac ve mot anh, ket qua o state.geminiWeb.try (nut thu / bai kiem e2e)
    gemini_web_try: async (p = {}) => {
      const t0 = Date.now()
      S.try = { busy: true, kind: p.image ? 'image' : 'text' }
      pushState()
      try {
        const opts = { prompt: String(p.prompt || 'Xin chào! Trả lời đúng một câu ngắn.'), label: 'thử', ...(p.timeoutMs ? { timeoutMs: Number(p.timeoutMs) } : {}) }
        const r = p.image ? await gw.image(opts) : await gw.ask(opts)
        S.try = p.image ? { ok: true, kind: 'image', file: r.file, mime: r.mime, ms: Date.now() - t0 } : { ok: true, kind: 'text', text: r.slice(0, 20000), ms: Date.now() - t0 }
      } catch (e) {
        S.try = { ok: false, kind: p.image ? 'image' : 'text', code: e.code || '', error: e.message, ms: Date.now() - t0 }
      }
      pushState()
    },
  }
  return gw
}

module.exports = { createGeminiWeb, askOn, imageOn, ask, fullSizeUrl, geminiScan, LIMIT_RE, SIGNIN_TEXT_RE, TITLE }
