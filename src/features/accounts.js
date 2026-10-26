// Trang "Tai khoan": nhieu tai khoan Google, moi tai khoan mot phien rieng; kenh cua tung tai
// khoan; chay viec tren mot kenh (ctx.withChannel) trong cua so an, sau khi da chuyen dung kenh.
const fs = require('fs')
const path = require('path')
const { BrowserWindow } = require('electron')
const { Accounts } = require('../accounts')
const { Page, channelOf } = require('../studio/driver')
const { googleSession } = require('../studio/session')
const flows = require('../flows/channels')

const IDLE_MS = Number(process.env.YA_LANE_IDLE_MS) || 90e3 // dong cua so an khi ranh chung nay
const SIGNIN_URL = /accounts\.google\.com|\/signin|ServiceLogin/i

module.exports = (ctx) => {
  const S = ctx.state.f.accounts = { list: [], login: null, busy: {}, pane: { accountId: '', channelKey: '' }, paneBusy: false, debug: null }
  let model = null
  const m = () => {
    if (!model) {
      // phien Studio cua ban 0.3 ('persist:youtube') co du lieu -> thanh tai khoan #1, giu cookie
      const legacy = fs.existsSync(path.join(ctx.app.getPath('userData'), 'Partitions', 'youtube'))
      model = new Accounts(ctx.store, { legacy })
      if (model.migrated) ctx.log('info', 'Phiên YouTube Studio cũ đã thành "Tài khoản 1" ở trang Tài khoản (giữ nguyên đăng nhập).')
      const p = ctx.store.settings.studioPane || {}
      S.pane = { accountId: model.get(p.accountId) ? p.accountId : model.list_[0] ? model.list_[0].id : '', channelKey: p.channelKey || '' }
    }
    return model
  }
  const sync = () => { S.list = m().list(); ctx.push() }
  const label = (id) => (m().get(id) || { label: id }).label
  const setBusy = (id, what) => { if (what) S.busy[id] = what; else delete S.busy[id]; sync() }

  // ---- cua so an cho tung tai khoan (khong bao gio dung WebContentsView an) -------------
  const lanes = new Map() // accountId -> { win, page, chain, pending, timer }
  function closeLane(id) {
    const l = lanes.get(id)
    if (!l) return
    lanes.delete(id)
    clearTimeout(l.timer)
    if (!l.win.isDestroyed()) l.win.destroy()
  }
  function lane(acc) {
    const old = lanes.get(acc.id)
    if (old && !old.win.isDestroyed()) { clearTimeout(old.timer); return old }
    const win = new BrowserWindow({
      show: false, width: 1280, height: 800, skipTaskbar: true, title: `Studio · ${acc.label}`,
      webPreferences: { session: googleSession(acc.partition), backgroundThrottling: false, contextIsolation: true, sandbox: true, spellcheck: false },
    })
    const wc = win.webContents
    wc.setAudioMuted(true)
    wc.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) wc.loadURL(url); return { action: 'deny' } })
    const page = new Page(wc, { timeout: 20000, shotDir: ctx.logFile('loi-trang'), shouldStop: ctx.stopped })
    const l = { win, page, chain: Promise.resolve(), pending: 0, timer: null }
    lanes.set(acc.id, l)
    return l
  }
  // Chay fn(page) tren cua so an cua tai khoan; cac viec cung tai khoan chay lan luot.
  function onAccount(accountId, fn) {
    const acc = m().get(accountId)
    if (!acc) return Promise.reject(new Error('Không tìm thấy tài khoản.'))
    const l = lane(acc)
    l.pending++
    const run = l.chain.then(() => {
      if (l.win.isDestroyed()) throw new Error('Cửa sổ chạy ngầm đã bị đóng.')
      return fn(l.page)
    })
    l.chain = run.catch(() => {}).finally(() => {
      if (--l.pending === 0 && lanes.get(accountId) === l) l.timer = setTimeout(() => closeLane(accountId), IDLE_MS)
    })
    return run
  }

  // ---- kiem tra dang nhap ------------------------------------------------------------
  async function hasGoogleCookie(acc) {
    const ses = googleSession(acc.partition)
    const list = await ses.cookies.get({ domain: '.google.com' }).catch(() => [])
    if (list.some((c) => c.name === 'SID' || c.name === '__Secure-1PSID')) return true
    // bai kiem voi Studio gia (YA_STUDIO_BASE): trang dang nhap gia dat cookie MOCK_SID
    if (process.env.YA_STUDIO_BASE) return (await ses.cookies.get({ url: ctx.urls.studio }).catch(() => [])).some((c) => c.name === 'MOCK_SID')
    return false
  }

  // quick: chi xem cookie. Con lai: mo Studio trong cua so an, doc kenh mac dinh (va ca danh sach kenh)
  async function check(id, { quick = false, discover = false } = {}) {
    const acc = m().get(id)
    if (!acc) return
    setBusy(id, discover ? 'Đang đọc danh sách kênh…' : 'Đang kiểm tra…')
    try {
      if (!(await hasGoogleCookie(acc))) {
        m().update(id, { status: 'needs-sign-in' })
        if (!quick) ctx.log('warn', `"${acc.label}": chưa đăng nhập Google. Bấm "Đăng nhập" ở trang Tài khoản.`)
        return
      }
      if (quick) { m().update(id, { status: 'signed-in' }); return }
      await onAccount(id, async (page) => {
        const st = await flows.openStudio(page, { urls: ctx.urls })
        if (st.signedOut) {
          m().update(id, { status: 'needs-sign-in' })
          ctx.log('warn', `"${acc.label}": Google yêu cầu đăng nhập lại. Bấm "Đăng nhập" ở trang Tài khoản.`)
          return
        }
        m().update(id, { status: 'signed-in' })
        if (discover || !acc.channels.length) {
          const r = await flows.listChannels(page, { urls: ctx.urls })
          m().setChannels(id, r.channels)
          m().update(id, { email: r.email, name: r.account })
          const active = r.channels.find((c) => c.active)
          if (r.current.ucId) m().learn(id, { ucId: r.current.ucId, name: r.current.name || (active && active.name), handle: active && active.handle })
          ctx.log('ok', `"${acc.label}"${r.email ? ` (${r.email})` : ''}: đã đăng nhập, có ${r.channels.length} kênh. Tick các kênh tool được làm việc.`)
        } else {
          const cur = await flows.currentChannel(page)
          if (cur.ucId) m().learn(id, cur)
          ctx.log('ok', `"${acc.label}": đã đăng nhập Google, Studio mở kênh ${cur.name || cur.ucId}.`)
        }
      })
    } catch (e) {
      ctx.log('error', `"${acc.label}": không kiểm tra được (${e.message}).`)
    } finally {
      setBusy(id, '')
    }
  }

  // ---- chay viec tren mot kenh ----------------------------------------------------------
  async function withChannel(key, fn, { label: what = '' } = {}) {
    const ch = m().find(key)
    if (!ch) throw new Error(`Không có kênh "${key}" ở trang Tài khoản. Bấm "Làm mới kênh" rồi tick kênh cần dùng.`)
    const acc = m().get(ch.accountId)
    if (acc.status === 'needs-sign-in') throw new Error(`Tài khoản Google "${acc.label}" chưa đăng nhập (trang Tài khoản → Đăng nhập).`)
    return onAccount(acc.id, async (page) => {
      try {
        const r = await flows.switchChannel(page, ch, { urls: ctx.urls })
        const learnt = m().learn(acc.id, { ucId: r.ucId, name: ch.name, handle: ch.handle })
        if (learnt && !ch.ucId) ctx.log('info', `Kênh "${ch.name}" có mã ${r.ucId}.`)
        sync()
        // kiem lai lan cuoi ngay truoc khi lam viec: dung kenh moi chay
        if (channelOf(page.url()) !== r.ucId) throw new Error(`Studio rời khỏi kênh "${ch.name}" trước khi bắt đầu.`)
        return await fn(page)
      } catch (e) {
        if (SIGNIN_URL.test(page.url())) { m().update(acc.id, { status: 'needs-sign-in' }); sync() }
        const shot = await page.snapshot((what || 'kenh').replace(/[^\w-]+/g, '-').slice(0, 40))
        if (shot) ctx.log('warn', `${what ? `${what}: ` : ''}đã lưu ảnh trang lúc lỗi: ${shot}.png`)
        throw e
      }
    })
  }

  // ---- khung Studio hien (bang ben phai) ----------------------------------------------------
  const savePane = () => { ctx.store.save({ studioPane: S.pane }); ctx.push() }
  async function pane({ accountId, channelKey = '' } = {}) {
    const acc = m().get(accountId)
    if (!acc || S.paneBusy) return
    S.pane = { accountId, channelKey }
    savePane()
    ctx.studio.use(acc.partition)
    const ch = channelKey && m().find(channelKey)
    if (!ch) return
    S.paneBusy = true
    ctx.push()
    try {
      const page = new Page(ctx.studio.wc(), { timeout: 20000, shotDir: ctx.logFile('loi-trang') })
      await page.until(() => document.readyState === 'complete', [], { what: 'YouTube Studio mở xong' }).catch(() => {})
      const r = await flows.switchChannel(page, ch, { urls: ctx.urls })
      m().learn(acc.id, { ucId: r.ucId, name: ch.name, handle: ch.handle })
      S.pane.channelKey = channelKey
      ctx.log('ok', `Khung Studio: đã chuyển sang kênh "${ch.name}".`)
    } catch (e) {
      ctx.log('error', `Khung Studio: không chuyển được sang kênh "${ch.name}": ${e.message}`)
    } finally {
      S.paneBusy = false
      sync()
    }
  }

  // Khung Studio vua vao kenh ucId: doi chieu voi danh sach kenh
  ctx.onStudioChannel = async (ucId, wc) => {
    const f = m().byUc(ucId)
    if (f) { ctx.state.studio.channelName = f.channel.name; return }
    ctx.state.studio.channelName = ''
    const acc = m().get(S.pane.accountId)
    if (!acc || !wc) return
    const cur = await flows.currentChannel(new Page(wc), { wait: 4000 }).catch(() => null)
    if (cur && cur.ucId === ucId && cur.name && acc.channels.some((c) => c.name === cur.name)) {
      m().learn(acc.id, cur)
      ctx.state.studio.channelName = cur.name
      sync()
    }
  }

  // ---- cho cac tinh nang khac -------------------------------------------------------------
  ctx.accounts = {
    list: () => m().list(),
    channels: () => m().channels(),
    find: (key) => m().find(key),
    email: (accountId) => (m().get(accountId) || {}).email || '',
    panePartition: () => { const a = m().get(S.pane.accountId) || m().list_[0]; return a ? a.partition : '' },
  }
  ctx.withChannel = withChannel

  // ---- lenh tu giao dien --------------------------------------------------------------
  const commands = {
    accounts_add: async (p) => {
      const a = m().add(p && p.label)
      ctx.log('ok', `Đã thêm tài khoản "${a.label}".`)
      sync()
      if (p && p.login) await commands.accounts_login(a.id)
    },
    accounts_login: (id) => {
      const acc = m().get(id)
      if (!acc) return
      S.login = id
      S.pane = { accountId: id, channelKey: '' }
      savePane()
      ctx.studio.use(acc.partition, ctx.studio.home)
      ctx.log('info', `Đăng nhập Google cho "${acc.label}" trong khung bên phải (tool không lưu mật khẩu). Xong bấm "Xong, đóng lại".`)
      sync()
    },
    // Xong dang nhap: thoat che do dang nhap ngay, kiem tra chay nen
    accounts_login_done: () => {
      const id = S.login
      S.login = null
      sync()
      if (id) check(id, { discover: !(m().get(id) || { channels: [] }).channels.length })
    },
    accounts_check: (id) => check(id),
    accounts_channels: (id) => check(id, { discover: true }),
    accounts_rename: (p) => { if (p && m().rename(p.id, p.label)) sync() },
    accounts_enable: (p) => { if (p && m().setEnabled(p.key, p.enabled)) sync() },
    accounts_signout: async (id) => {
      const acc = m().get(id)
      if (!acc) return
      closeLane(id)
      if (S.login === id) S.login = null
      await googleSession(acc.partition).clearStorageData().catch(() => {})
      m().signedOut(id)
      if (S.pane.accountId === id) { S.pane.channelKey = ''; savePane(); ctx.studio.use(acc.partition, ctx.studio.home) }
      ctx.log('info', `Đã đăng xuất "${acc.label}" (xóa phiên trong tool, giữ danh sách kênh).`)
      sync()
    },
    accounts_remove: async (id) => {
      const acc = m().get(id)
      if (!acc) return
      if (m().list_.length <= 1) return ctx.log('warn', 'Phải giữ lại ít nhất một tài khoản.')
      closeLane(id)
      if (S.login === id) S.login = null
      m().remove(id)
      if (S.pane.accountId === id) { S.pane = { accountId: m().list_[0].id, channelKey: '' }; savePane(); ctx.studio.use(m().list_[0].partition) }
      await googleSession(acc.partition).clearStorageData().catch(() => {})
      ctx.log('info', `Đã xóa tài khoản "${acc.label}".`)
      sync()
    },
    accounts_pane: (p) => pane(p || {}),
    // Thu: chuyen sang kenh trong cua so an, doc lai dia chi + ten kenh (de kiem tra ctx.withChannel)
    accounts_try: async (key) => {
      S.debug = { key, busy: true }
      ctx.push()
      try {
        const r = await withChannel(key, async (page) => ({ url: page.url(), ...(await flows.currentChannel(page)) }), { label: 'thu-kenh' })
        S.debug = { key, ok: true, ...r }
        ctx.log('ok', `Thử kênh: Studio đang ở "${r.name}" (${r.ucId}).`)
      } catch (e) {
        S.debug = { key, ok: false, error: e.message }
        ctx.log('error', `Thử kênh: ${e.message}`)
      }
      sync()
    },
  }

  return {
    commands,
    start() {
      sync()
      // luc mo app: xem cookie tung tai khoan; tai khoan da dang nhap ma chua co kenh -> doc kenh
      ;(async () => {
        for (const a of m().list()) await check(a.id, { quick: true })
        for (const a of m().list()) if (a.status === 'signed-in' && !a.channels.length) await check(a.id, { discover: true })
      })()
    },
  }
}
