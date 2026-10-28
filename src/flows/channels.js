// Luong YouTube Studio cho tai khoan / kenh (xem specs/dang-nhap-binh-luan.md muc A):
//  - openStudio: mo Studio, cho toi /channel/UC... (hoac trang dang nhap Google)
//  - currentChannel: kenh dang chon (UC ID tu dia chi + ten duoi "Kenh cua ban")
//  - listChannels: avatar -> "Chuyen doi tai khoan" -> doc cac kenh cua tai khoan nay
//  - switchChannel: bam dong cua kenh, cho Studio sang /channel/<UC>, kiem lai
// Ham thuan tren mot driver Page; khong dang nhap, khong luu gi.
const { StepError, channelOf, sleep } = require('../studio/driver')

// Nhan tren man hinh (Studio tieng Viet, chap nhan ca tieng Anh). Sua o day khi Studio doi chu.
const LABELS = {
  switchAccount: '^(Chuyển đổi tài khoản|Switch account)$',
  accountsTitle: '^(Tài khoản|Accounts)$',
  otherAccounts: '^(Các tài khoản khác|Other accounts)$',
  yourChannel: '^(Kênh của bạn|Your channel)$',
  // dong thu ba cua moi kenh: "415 người đăng ký", "Không có người đăng ký", "1,2 N người đăng ký"
  subs: '(người đăng ký|subscribers?)$',
  // tai khoan Google khong co kenh (bam vao se mo trang tao kenh): khong bao gio chon
  noChannel: '^(Không có kênh|No channel)$',
  // kenh da xoa ma ban van la nguoi quan ly: "Đã xoá kênh • Bạn là người quản lý" -> bo qua
  deleted: '^(Đã xoá kênh|Đã xóa kênh|Channel deleted|Deleted channel)',
  avatar: '^(Tài khoản|Account|Avatar|Ảnh hồ sơ.*|Profile.*)$',
}

// Cau truc trang (selector) Studio, do tu HTML that cua nguoi dung (html/yt-1-trang-chu.html, 26/10/2026);
// khong thay thi doan theo chu.
//  avatar: <ytd-topbar-menu-button-renderer><button id="avatar-btn" aria-label="Account">
//  dong kenh: <ytd-account-item-renderer><tp-yt-paper-icon-item role="option"> ... <tp-yt-paper-item-body>
//    <yt-formatted-string id="channel-title">Ten</yt-formatted-string>
//    <yt-formatted-string respect-lang-dir secondary dir="auto">@handle</yt-formatted-string>
//    <yt-formatted-string secondary>31.500 người đăng ký</yt-formatted-string>
//    </tp-yt-paper-item-body><yt-icon id="selected" icon="yt-icons:check" [hidden]>
//  anh dai dien: <div id="contentIcon"><yt-img-shadow><img id="img" src="https://yt3.ggpht.com/...=s48-c-k-c0x00ffffff-no-rj">
//    (src nap muon: luc dau <img> chua co src)
//  dau tai khoan: <ytd-google-account-header-renderer> #name, #email
//  "Cac tai khoan khac": <ytd-accounts-dialog-header-renderer>; email: <ytd-account-item-section-header-renderer>
//  thanh ben: <ytcp-navigation-drawer> #entity-type "Kênh của bạn", #entity-name "Ten kenh"
const SEL = {
  avatar: '#avatar-btn',
  menu: 'ytd-multi-page-menu-renderer, tp-yt-iron-dropdown',
  row: 'ytd-account-item-renderer',
  rowName: '#channel-title',
  rowHandle: 'yt-formatted-string[secondary][respect-lang-dir], #channel-handle',
  rowSubs: 'yt-formatted-string[secondary]:not([respect-lang-dir]):not([dir])',
  rowActive: '#selected:not([hidden])',
  rowAvatar: '#contentIcon img, yt-img-shadow img',
  email: 'ytd-google-account-header-renderer #email',
  accountName: 'ytd-google-account-header-renderer #name',
  sidebarName: 'ytcp-navigation-drawer #entity-name, #entity-name',
}

const UC_URL = /\/channel\/(UC[\w-]{22})(?:[/?#]|$)/
const SIGNIN_URL = /accounts\.google\.com|\/signin|ServiceLogin|\/v3\/signin/i
const ucOf = (url) => (UC_URL.exec(url) || [])[1] || channelOf(url)

// Mo Studio, cho toi khi vao kenh (tra ve { ucId }) hoac bi dua sang trang dang nhap ({ signedOut: true }).
// Studio co the di qua studio.youtube.com (khong co UC) khoang 1 giay: khong coi la dang xuat.
async function openStudio(page, { urls, timeout = 30000 } = {}) {
  return page.run('Mở YouTube Studio', async () => {
    if (!UC_URL.test(page.url())) await page.goto(`${urls.studio}/`)
    const end = Date.now() + timeout
    for (;;) {
      const url = page.url()
      if (UC_URL.test(url)) return { ucId: ucOf(url) }
      if (SIGNIN_URL.test(url)) return { signedOut: true, url }
      if (page.shouldStop()) throw new StepError('Đã dừng theo yêu cầu.', page.step)
      if (Date.now() > end) throw new StepError(`Quá ${Math.round(timeout / 1000)} giây YouTube Studio vẫn chưa vào kênh nào (đang ở ${url}).`, page.step)
      await sleep(250)
    }
  })
}

// Chay trong trang: ten kenh duoi "Kenh cua ban" o thanh ben trai Studio.
function readSidebar(sel, L) {
  const ya = window.__ya
  const el = ya.all(document, sel.sidebarName).find(ya.visible)
  if (el) return (el.innerText || '').trim()
  const re = new RegExp(L.yourChannel, 'i')
  const menu = ya.all(document, sel.menu)
  for (const lab of ya.find({ text: '', regex: L.yourChannel }, true)) {
    if (menu.some((m) => m.contains(lab))) continue
    // ten nam ngay sau nhan (co the con rong khi trang chua nap xong)
    if (lab.nextElementSibling) return (lab.nextElementSibling.innerText || '').trim().split('\n')[0]
    const lines = (lab.parentElement.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean)
    const i = lines.findIndex((l) => re.test(l))
    if (i >= 0 && lines[i + 1]) return lines[i + 1]
  }
  return ''
}
const sidebarName = (page) => page.eval(readSidebar, SEL, LABELS)

// Ten kenh nap muon sau khi trang mo: cho toi da `wait` ms
async function currentChannel(page, { wait = 5000 } = {}) {
  const name = await page.until(readSidebar, [SEL, LABELS], { timeout: wait, what: 'tên kênh ở thanh bên' }).catch(() => '')
  return { ucId: ucOf(page.url()), name }
}

// Mo menu avatar -> "Chuyen doi tai khoan"; cho danh sach kenh hien ra.
async function openSwitcher(page) {
  await page.run('Mở menu tài khoản (avatar góc phải)', async () => {
    // trang vua chuyen kenh co the chua nap xong script: cu bam roi vao luc do se mat
    await page.until(() => document.readyState === 'complete', [], { timeout: 10000, what: 'YouTube Studio mở xong' }).catch(() => {})
    const byId = await page.has({ selector: SEL.avatar })
    const av = byId ? { selector: SEL.avatar } : { text: 'Tài khoản', regex: LABELS.avatar, selector: 'button' }
    const sw = { text: 'Chuyển đổi tài khoản', regex: LABELS.switchAccount }
    await page.click(av)
    // menu chua mo sau 6 giay: cu bam bi mat -> bam lai mot lan
    const open = await page.until((t) => window.__ya.count(t), [sw], { timeout: 6000, what: 'menu tài khoản' }).then(() => true, () => false)
    if (!open && !(await page.has(sw))) await page.click(av)
  })
  await page.run('Bấm "Chuyển đổi tài khoản"', () => page.click({ text: 'Chuyển đổi tài khoản', regex: LABELS.switchAccount }))
  await page.run('Chờ danh sách kênh', () => page.until(readRows, [SEL, LABELS], { timeout: 15000, what: 'danh sách kênh trong "Chuyển đổi tài khoản"' }))
}

// Chay trong trang: doc cac dong kenh cua tai khoan dang dung (bo "Cac tai khoan khac" va "Khong co kenh").
// Tra ve null khi chua co dong nao (de until() cho tiep). waitImg: tra null khi con <img> chua co src.
function readRows(sel, L, mark, waitImg) {
  const ya = window.__ya
  const lines = (el) => (el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const subsRe = new RegExp(L.subs, 'i')
  const noRe = new RegExp(L.noChannel, 'i')
  const delRe = new RegExp(L.deleted, 'i')
  const isSubs = (l) => subsRe.test(l) || noRe.test(l)
  let rows = ya.all(document, sel.row).filter(ya.visible)
  if (!rows.length) {
    // khong thay the quen thuoc: doan theo chu. Pham vi: khung co tieu de "Tai khoan".
    const tre = new RegExp(L.accountsTitle, 'i')
    const title = ya.find({ text: '', regex: L.accountsTitle }, true).find((e) => tre.test((e.innerText || '').trim()))
    // khung = to tien gan nhat (toi da 8 cap) co tu 2 dong "nguoi dang ky" va mot dong @handle;
    // khong tran ra ca trang (trang tong quan cung co "So nguoi dang ky")
    let scope = title
    const okScope = (el) => { const ls = lines(el); return ls.filter(isSubs).length >= 2 && ls.some((l) => /^@\S+$/.test(l) || noRe.test(l)) }
    for (let i = 0; scope && i < 8 && !okScope(scope); i++) scope = scope.parentElement
    if (!scope || !okScope(scope) || scope === document.body) return null
    const all = ya.all(scope, '*').filter((el) => ya.visible(el) && lines(el).filter(isSubs).length === 1 && lines(el).length >= 2)
    // lay phan tu lon nhat chi chua MOT kenh
    rows = all.filter((el) => !all.includes(el.parentElement))
  }
  if (!rows.length) return null
  const other = ya.find({ text: '', regex: L.otherAccounts }, true)[0]
  const out = []
  let header = null
  for (const row of rows) {
    if (other && (other.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
    const ls = lines(row)
    const pick = (s) => { const e = row.querySelector(s); return e ? (e.innerText || '').trim() : '' }
    // dong dau co the la chu cai cua anh dai dien (vd "T")
    const name = pick(sel.rowName) || (ls[0] && [...ls[0]].length === 1 && ls.length >= 3 ? ls[1] : ls[0]) || ''
    const handle = pick(sel.rowHandle) || ls.find((l) => /^@\S+$/.test(l)) || ''
    const subs = pick(sel.rowSubs) || ls.find(isSubs) || ''
    if (!name || noRe.test(subs) || delRe.test(subs) || ls.some((l) => delRe.test(l))) continue
    const active = !!row.querySelector(sel.rowActive) || row.getAttribute('aria-selected') === 'true' || ls.includes('✓')
    // anh dai dien: chi lay dia chi http(s) (bo data:, anh trong suot luc chua nap)
    const img = row.querySelector(sel.rowAvatar) || row.querySelector('img')
    const src = img ? img.src || '' : ''
    if (waitImg && img && !/^https?:\/\//.test(src)) return null
    out.push({ name, handle: /^@/.test(handle) ? handle : '', subs, active, avatar: /^https?:\/\//.test(src) ? src : '' })
    if (mark && mark(name, handle)) row.setAttribute('data-ya-pick', '1')
    if (!header) header = row
  }
  if (!out.length) return null
  // email + ten tai khoan Google: phan dau khung, truoc dong kenh dau tien
  let email = ''
  let account = ''
  const emailEl = ya.all(document, sel.email).find((e) => ya.visible(e) && !(other && (other.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)))
  if (emailEl) {
    email = (emailEl.innerText || '').trim()
    const nameEl = ya.all(document, sel.accountName).find(ya.visible)
    const prev = lines(emailEl.parentElement)
    account = nameEl ? (nameEl.innerText || '').trim() : prev[0] && prev[0] !== email ? prev[0] : ''
  } else {
    let box = header.parentElement
    while (box && !/\S+@\S+\.\w+/.test(box.innerText || '')) box = box.parentElement
    if (box) {
      const ls = lines(box)
      const i = ls.findIndex((l) => /^\S+@\S+\.\w+$/.test(l))
      if (i >= 0) { email = ls[i]; account = i > 0 && !new RegExp(L.accountsTitle, 'i').test(ls[i - 1]) ? ls[i - 1] : '' }
    }
  }
  return { email, account, channels: out }
}

// Anh 48px cua Studio -> 88px cho net tren man hinh HiDPI (chi anh cua Google: ...=s48-c-k...)
function bigAvatar(url) {
  return String(url || '').replace(/^(https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[^=\s]+=s)\d+(?=-|$)/, '$188')
}

async function closeMenu(page) {
  await page.press('Escape').catch(() => {})
}

// Doc danh sach kenh cua tai khoan Google dang dang nhap.
// -> { email, account, channels: [{ name, handle, subs, active, avatar }], current: { ucId, name } }
async function listChannels(page, { urls, log = () => {} } = {}) {
  const st = await openStudio(page, { urls })
  if (st.signedOut) throw new StepError('Tài khoản Google này chưa đăng nhập (Studio chuyển sang trang đăng nhập).', page.step)
  const current = await currentChannel(page)
  await openSwitcher(page)
  // anh dai dien nap muon: cho toi da 3 giay, het gio thi doc nhung gi da co
  const r = (await page.until(readRows, [SEL, LABELS, null, true], { timeout: 3000, what: 'ảnh đại diện kênh' }).catch(() => null)) || (await page.eval(readRows, SEL, LABELS))
  for (const c of r.channels) c.avatar = bigAvatar(c.avatar)
  await closeMenu(page)
  log('info', `Đọc được ${r.channels.length} kênh của ${r.email || r.account || 'tài khoản'}.`)
  return { ...r, current }
}

// Chuyen Studio sang kenh `target` ({ name, handle, ucId }); tra ve { ucId, name } sau khi da kiem.
// Menu avatar khong mo / khong co kenh: tai lai Studio thu lai mot lan, roi chuyen qua trang chon kenh cua YouTube.
async function switchChannel(page, target, { urls, log = () => {}, timeout = 20000 } = {}) {
  const st = await openStudio(page, { urls })
  if (st.signedOut) throw new StepError('Tài khoản Google này chưa đăng nhập (Studio chuyển sang trang đăng nhập).', page.step)
  if (target.ucId && st.ucId === target.ucId) return verify(page, target)
  let first = null
  for (let i = 0; i < 2; i++) {
    try {
      return await viaMenu(page, target, { urls, log, timeout })
    } catch (e) {
      if (page.shouldStop()) throw e
      first = first || e
      const why = await menuDiag(page)
      // menu mo duoc nhung khong co kenh: tai lai cung vay, sang thang trang chon kenh cua YouTube
      const last = i || /^Không thấy kênh/.test(e.message)
      log('warn', `Chuyển sang kênh "${target.name}" bằng menu tài khoản chưa được: ${e.message}${why ? ` (${why})` : ''}. ${last ? 'Thử trang chọn kênh của YouTube.' : 'Tải lại Studio rồi thử lại.'}`)
      await closeMenu(page)
      if (last) break
      await page.goto(`${urls.studio}/`)
      const s2 = await openStudio(page, { urls })
      if (s2.signedOut) throw first
      if (target.ucId && s2.ucId === target.ucId) return verify(page, target)
    }
  }
  try {
    return await viaYouTube(page, target, { urls, log, timeout })
  } catch (e) {
    if (page.shouldStop()) throw e
    log('warn', `Trang chọn kênh của YouTube cũng không chuyển được: ${e.message}`)
    throw first
  }
}

// Cac muc dang hien trong menu tai khoan + trang co duoc ve khong: ghi vao nhat ky khi khong chuyen duoc kenh
async function menuDiag(page) {
  const items = await page.eval((sel) => {
    const ya = window.__ya
    const menu = ya.all(document, sel.menu).filter(ya.visible)
    const ls = menu.flatMap((m) => String(m.innerText || '').split('\n')).map((s) => s.trim()).filter(Boolean)
    return [...new Set(ls)].slice(0, 8)
  }, SEL).catch(() => null)
  const r = page.renderState ? await page.renderState().catch(() => '') : ''
  return [items ? (items.length ? `menu đang hiện: ${items.join(' | ')}` : 'menu tài khoản không mở') : '', r].filter(Boolean).join('; ')
}

async function viaMenu(page, target, { urls, log, timeout }) {
  const before = ucOf(page.url())
  await openSwitcher(page)
  // danh dau dong can bam (theo @handle neu co, khong thi theo ten)
  const want = { name: String(target.name || '').trim().toLowerCase(), handle: String(target.handle || '').toLowerCase() }
  // (khong dung new Function trong trang: Studio co CSP)
  const picker = `(sel, L, w) => {
    for (const el of window.__ya.all(document, '[data-ya-pick]')) el.removeAttribute('data-ya-pick')
    const n = (s) => s.replace(/\\s+/g, ' ').trim().toLowerCase()
    return (${readRows.toString()})(sel, L, (name, handle) => (w.handle && handle ? handle.toLowerCase() === w.handle : n(name) === w.name))
  }`
  const r = await page.eval(picker, SEL, LABELS, want)
  const row = r && r.channels.find((c) => (want.handle && c.handle ? c.handle.toLowerCase() === want.handle : c.name.replace(/\s+/g, ' ').trim().toLowerCase() === want.name))
  if (!row) {
    await closeMenu(page)
    throw new StepError(`Không thấy kênh "${target.name}" trong "Chuyển đổi tài khoản" của tài khoản này. Bấm "Làm mới kênh" ở trang Tài khoản.`, page.step)
  }
  if (row.active && before) {
    await closeMenu(page)
    // phien da o kenh nay (cua so khac vua chuyen) nhung trang con o kenh cu: tai lai Studio
    if (target.ucId && before !== target.ucId) {
      await page.goto(`${urls.studio}/`)
      await openStudio(page, { urls })
    }
    return verify(page, target)
  }
  await page.run(`Chọn kênh "${target.name}"`, () => page.click({ selector: '[data-ya-pick]' }))
  log('info', `Đang chuyển sang kênh "${target.name}"…`)
  // Studio ve trang tong quan cua kenh moi (co the qua studio.youtube.com khong co UC mot luc)
  await page.run('Chờ Studio chuyển kênh', () => page.until((b, t) => {
    const m = /\/channel\/(UC[\w-]{22})(?:[/?#]|$)/.exec(location.href)
    return !!(m && (t ? m[1] === t : m[1] !== b))
  }, [before, target.ucId || ''], { timeout, what: `Studio chuyển sang kênh "${target.name}"` }))
  return verify(page, target)
}

// Trang chon kenh cua YouTube (www.youtube.com/channel_switcher): danh sach kenh la trang thuong, khong can mo menu.
// Bam kenh -> YouTube doi kenh cua phien dang nhap; mo lai Studio va kiem.
async function viaYouTube(page, target, { urls, log, timeout }) {
  await page.run('Mở trang chọn kênh của YouTube', () => page.goto(`${urls.youtube}/channel_switcher?next=%2F`))
  const want = { name: String(target.name || '').replace(/\s+/g, ' ').trim().toLowerCase(), handle: String(target.handle || '').toLowerCase() }
  const found = await page.run('Tìm kênh trong trang chọn kênh', () => page.until((sel, w) => {
    const ya = window.__ya
    for (const el of ya.all(document, '[data-ya-pick]')) el.removeAttribute('data-ya-pick')
    const n = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const rows = ya.all(document, sel.row).filter(ya.visible)
    if (!rows.length) return ''
    const hit = rows.find((row) => {
      const t = row.querySelector(sel.rowName)
      const ls = String(row.innerText || '').split('\n').map(n)
      if (w.handle && ls.includes(w.handle)) return true
      return t ? n(t.innerText) === w.name : ls.includes(w.name)
    })
    if (!hit) return 'none'
    ;(hit.querySelector('a[href]') || hit.querySelector('[role=option]') || hit).setAttribute('data-ya-pick', '1')
    return 'ok'
  }, [SEL, want], { timeout: 15000, what: 'danh sách kênh trong trang chọn kênh của YouTube' }))
  if (found !== 'ok') throw new StepError(`Không thấy kênh "${target.name}" trong trang chọn kênh của YouTube.`, page.step)
  const from = page.url()
  await page.run(`Chọn kênh "${target.name}"`, () => page.click({ selector: '[data-ya-pick]' }))
  await page.until((u) => location.href !== u && !/channel_switcher/.test(location.href), [from], { timeout, what: `YouTube chuyển sang kênh "${target.name}"` })
  await page.goto(`${urls.studio}/`)
  const st = await openStudio(page, { urls })
  if (st.signedOut) throw new StepError('Tài khoản Google này chưa đăng nhập (Studio chuyển sang trang đăng nhập).', page.step)
  log('info', `Đã chuyển sang kênh "${target.name}" qua trang chọn kênh của YouTube.`)
  return verify(page, target)
}

// Kiem lai: dia chi co UC (dung UC neu da biet) va ten o thanh ben la ten kenh mong doi.
async function verify(page, target) {
  return page.run(`Kiểm tra đang ở kênh "${target.name}"`, async () => {
    const ucId = ucOf(page.url())
    if (!ucId) throw new StepError('Studio không ở trang của kênh nào.', page.step)
    if (target.ucId && ucId !== target.ucId) throw new StepError(`Studio đang ở kênh ${ucId}, không phải kênh "${target.name}" (${target.ucId}).`, page.step)
    const want = String(target.name || '').replace(/\s+/g, ' ').trim().toLowerCase()
    let name = ''
    try {
      name = await page.until(readSidebar, [SEL, LABELS], { timeout: 8000, what: 'tên kênh ở thanh bên ("Kênh của bạn")' })
    } catch (_) { /* Studio doi giao dien: chi dua vao UC ID */ }
    // Studio nap ten muon: cho them neu ten chua khop
    for (let i = 0; want && name && name.replace(/\s+/g, ' ').trim().toLowerCase() !== want && i < 20; i++) {
      await sleep(250)
      name = await sidebarName(page).catch(() => name)
    }
    if (want && name && name.replace(/\s+/g, ' ').trim().toLowerCase() !== want) {
      throw new StepError(`Studio đang ở kênh "${name}", không phải kênh "${target.name}".`, page.step)
    }
    return { ucId, name: name || target.name }
  })
}

module.exports = { LABELS, SEL, openStudio, currentChannel, listChannels, switchChannel, verify, readRows, readSidebar, ucOf, bigAvatar }
