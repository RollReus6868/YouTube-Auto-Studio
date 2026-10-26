// YT Auto Studio - cua so chinh: thanh ben | cot dieu khien | (tuy trang) YouTube Studio
// nhung ngay ben phai (WebContentsView) cho cac viec API cua YouTube khong ho tro.
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell, net, dialog, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const updater = require('./updater')
const scanner = require('./scanner')
const { buildVideoMeta, validateMeta, planSchedule, CATEGORIES } = require('./metadata')
const { Store, parseOAuthClient } = require('./store')

const MAX_LOGS = 300
const STUDIO_URL = process.env.YA_STUDIO_URL || 'https://studio.youtube.com/'
// Phai dat TRUOC app.whenReady(): noi luu phien dang nhap, cai dat va log.
if (process.env.YA_DATA_DIR) app.setPath('userData', process.env.YA_DATA_DIR)

let win = null
let studio = null // WebContentsView
let store = null
let busy = false
let release = null // ban moi tim thay tren GitHub
const kind = updater.installKind({ exe: process.execPath, packaged: app.isPackaged, platform: process.platform })
const state = {
  status: 'idle', logs: [],
  version: app.getVersion(),
  update: { status: 'idle', latest: '', notes: '', progress: 0, error: '', manual: kind === 'manual' },
  settings: null,
  secrets: { gemini: false, geminiEncrypted: false, oauth: null },
  scan: { root: '', videos: [], posts: [], errors: [], at: '' },
  studio: { channelId: '', url: '', visible: false },
  categories: CATEGORIES,
}

const push = () => { if (win && !win.isDestroyed()) win.webContents.send('state', state) }
function log(level, msg) {
  state.logs.push({ t: new Date().toTimeString().slice(0, 8), level, msg })
  state.logs.splice(0, state.logs.length - MAX_LOGS)
  push()
}
const logFile = (name) => path.join(app.getPath('userData'), name)

// ---- cai dat ------------------------------------------------------------------------
function refreshSettings() {
  state.settings = store.settings
  let oauth = null
  try { oauth = store.hasSecret('oauthClient') ? JSON.parse(store.getSecret('oauthClient')) : null } catch (_) { /* hong */ }
  state.secrets = {
    gemini: store.hasSecret('gemini'),
    geminiEncrypted: store.secretEncrypted('gemini'),
    // chi gui ten du an va phan dau client_id; khong gui client_secret ra giao dien
    oauth: oauth ? { project_id: oauth.project_id, client_id: oauth.client_id.replace(/^(.{12}).*(\.apps\.googleusercontent\.com)$/, '$1…$2') } : null,
  }
}

// ---- quet thu muc -------------------------------------------------------------------
const fileUrl = (p) => (p ? pathToFileURL(p).href : '')

function runScan(quiet = false) {
  const r = scanner.scan(store.settings.root)
  const ready = r.videos.filter((v) => !v.errors.length)
  const plan = planSchedule(ready, (v) => store.presetFor(v))
  const planOf = new Map(ready.map((v, i) => [v.id, plan[i]]))
  const channel = store.settings.channel
  state.scan = {
    root: r.root, errors: r.errors, at: r.at,
    videos: r.videos.map((v) => {
      const preset = store.presetFor(v)
      const p = planOf.get(v.id) || { publishAt: null, warning: '' }
      const meta = buildVideoMeta(v, preset, { publishAt: p.publishAt, channel })
      const problems = v.errors.length ? v.errors : validateMeta(meta)
      return {
        id: v.id, dir: v.dir, folder: v.folder, name: v.name, size: v.size || 0,
        video: v.video ? path.basename(v.video) : '', thumbUrl: fileUrl(v.thumbnail),
        subtitles: v.subtitles.map((s) => ({ file: path.basename(s.file), lang: s.lang || meta.language })),
        preset: preset.name, meta: { ...meta, thumbnail: undefined, subtitles: undefined },
        errors: problems, warnings: v.warnings.concat(p.warning ? [p.warning] : []),
      }
    }),
    posts: r.posts.map((p) => ({ id: p.id, dir: p.dir, folder: p.folder, name: p.name, date: p.date, time: p.time, text: p.text, images: p.images.map(fileUrl), errors: p.errors, warnings: p.warnings })),
  }
  if (!quiet) {
    if (r.errors.length) log('warn', r.errors[0])
    else log('info', `Đã quét: ${r.videos.length} video (${state.scan.videos.filter((v) => !v.errors.length).length} sẵn sàng), ${r.posts.length} bài cộng đồng.`)
  }
  push()
}

// ---- kieu trinh duyet khi dang nhap Google ------------------------------------------
// (lay tu Gmail Cleaner) Google tu choi dang nhap ("This browser or app may not be
// secure") tuy User-Agent cua trinh duyet nhung. App tu thu lan luot cac kieu duoi day
// moi khi Google tu choi, va nho kieu nao dang nhap duoc.
const LOGIN_MODES = ['app', 'electron', 'firefox']
const REJECTED = /signin\/rejected|deniedsigninrejected/
const REJECTED_TEXT = /may not be secure|có thể không an toàn/i
let loginMode = 'app'
let triedModes = new Set()
let defaultUA = ''

function userAgentFor(mode) {
  if (mode === 'electron') return defaultUA
  if (mode === 'firefox') {
    const os = process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15'
      : process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'
    return `Mozilla/5.0 (${os}; rv:140.0) Gecko/20100101 Firefox/140.0`
  }
  return defaultUA.replace(/\s(Electron|YTAutoStudio|yt-auto-studio)\/\S+/gi, '')
}

function applyLoginMode() {
  const ua = userAgentFor(loginMode)
  studio.webContents.session.setUserAgent(ua)
  studio.webContents.setUserAgent(ua)
}

let rotating = false
async function nextLoginMode() {
  if (rotating) return
  rotating = true
  try {
    triedModes.add(loginMode)
    const next = LOGIN_MODES.find((m) => !triedModes.has(m))
    if (!next) {
      if (!triedModes.has('het')) {
        triedModes.add('het')
        log('error', 'Google từ chối đăng nhập với cả 3 kiểu trình duyệt của tool. Bấm "Về Studio" để thử lại, hoặc báo lại kèm ảnh chụp.')
      }
      return
    }
    log('warn', `Google từ chối đăng nhập (kiểu "${loginMode}"). Tool tự thử lại với kiểu "${next}"…`)
    loginMode = next
    await studio.webContents.session.clearStorageData().catch(() => {})
    applyLoginMode()
    await studio.webContents.loadURL(STUDIO_URL).catch(() => {})
  } finally { rotating = false }
}

// ---- khung YouTube Studio -----------------------------------------------------------
function createStudioView() {
  const ses = session.fromPartition('persist:youtube')
  defaultUA = ses.getUserAgent()
  if (LOGIN_MODES.includes(store.settings.loginMode)) loginMode = store.settings.loginMode
  ses.webRequest.onBeforeSendHeaders((details, done) => {
    const headers = details.requestHeaders
    if (loginMode === 'firefox') for (const h of Object.keys(headers)) if (/^sec-ch-ua/i.test(h)) delete headers[h]
    done({ requestHeaders: headers })
  })
  studio = new WebContentsView({ webPreferences: { session: ses, backgroundThrottling: false } })
  applyLoginMode()
  const wc = studio.webContents
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([\w-]+\.)*(google|youtube)\.com\//.test(url)) wc.loadURL(url)
    else if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (studio.setBorderRadius) studio.setBorderRadius(10)
  studio.setVisible(false) // chi hien khi trang hien tai co khung trinh duyet
  win.contentView.addChildView(studio)
  wc.loadURL(STUDIO_URL).catch(() => {})
}

// Giao dien bao vi tri khung (px cua cua so); null = trang nay khong co khung.
function setPane(r) {
  if (!studio) return
  state.studio.visible = !!(r && r.width >= 50 && r.height >= 50)
  if (!state.studio.visible) return studio.setVisible(false)
  studio.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })
  studio.setVisible(true)
}

// Da dang nhap Studio chua? Studio chuyen toi /channel/UC... khi da vao kenh.
async function refreshStudio() {
  if (!studio || studio.webContents.isDestroyed() || busy) return
  const wc = studio.webContents
  const url = wc.getURL()
  if (REJECTED.test(url)) return nextLoginMode()
  if (/^https:\/\/accounts\.google\.com\//.test(url) && !wc.isLoading()) {
    const text = await wc.executeJavaScript('document.body ? document.body.innerText.slice(0, 2000) : ""').catch(() => '')
    if (REJECTED_TEXT.test(text)) return nextLoginMode()
  }
  const channelId = (/\/channel\/(UC[\w-]{10,})/.exec(url) || [])[1] || ''
  if (channelId !== state.studio.channelId) {
    state.studio.channelId = channelId
    if (channelId) {
      log('ok', `Đã vào YouTube Studio của kênh ${channelId}.`)
      if (store.settings.loginMode !== loginMode) { store.save({ loginMode }); refreshSettings() }
    }
  }
  if (url !== state.studio.url) {
    state.studio.url = url
    push()
  }
}

// ---- cap nhat -----------------------------------------------------------------------
function setUpdate(patch) {
  Object.assign(state.update, patch)
  push()
}

async function updateCheck() {
  setUpdate({ status: 'checking', error: '' })
  try {
    release = await updater.check(net.fetch)
    if (release) setUpdate({ status: 'available', latest: release.version, notes: release.notes })
    else setUpdate({ status: 'none' })
  } catch (e) {
    setUpdate({ status: 'error', error: e.message })
  }
}

async function updateInstall() {
  if (!release || busy) return
  busy = true
  state.status = 'update'
  setUpdate({ status: 'downloading', progress: 0, error: '' })
  try {
    const file = await updater.download(net.fetch, release, kind, process.arch, (progress) => setUpdate({ progress }))
    setUpdate({ status: 'installing' })
    await updater.apply(kind, file, { exe: process.execPath, log: logFile('update.log') })
    app.quit()
  } catch (e) {
    setUpdate({ status: 'error', error: e.message })
    busy = false
    state.status = 'idle'
    push()
  }
}

// ---- lenh tu giao dien --------------------------------------------------------------
async function chooseRoot() {
  const r = await dialog.showOpenDialog(win, { title: 'Chọn thư mục gốc chứa video và bài viết', properties: ['openDirectory', 'createDirectory'] })
  if (r.canceled || !r.filePaths[0]) return
  setRoot(r.filePaths[0])
}

function setRoot(root) {
  store.save({ root })
  refreshSettings()
  log('ok', `Thư mục gốc: ${root}`)
  runScan()
}

async function importOAuth(file) {
  if (!file) {
    const r = await dialog.showOpenDialog(win, { title: 'Chọn file JSON của OAuth client (Desktop app)', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return
    file = r.filePaths[0]
  }
  try {
    const c = parseOAuthClient(fs.readFileSync(file, 'utf8'))
    store.setSecret('oauthClient', JSON.stringify(c))
    refreshSettings()
    log('ok', `Đã nhập OAuth client của dự án ${c.project_id || '(không tên)'}.`)
  } catch (e) {
    log('error', `Không nhập được OAuth client: ${e.message}`)
  }
}

const commands = {
  hello: () => {},
  pane: (r) => setPane(r),
  clear: () => { state.logs = [] },
  scan: () => runScan(),
  choose_root: () => chooseRoot(),
  set_root: (p) => p && setRoot(String(p)),
  create_skeleton: () => {
    if (!store.settings.root) return log('warn', 'Hãy chọn thư mục gốc trước.')
    try { scanner.createSkeleton(store.settings.root); log('ok', 'Đã tạo các thư mục videos, posts, da-dang và file HUONG-DAN.txt.'); runScan(true) } catch (e) { log('error', e.message) }
  },
  open_path: (p) => p && shell.openPath(String(p)),
  open_url: (u) => /^https:\/\//.test(u) && shell.openExternal(u),
  settings_save: (patch) => {
    // chi nhan cac truong cai dat thuong; khoa bi mat di lenh rieng
    const allowed = ['channel', 'presets', 'defaultPreset', 'geminiModel', 'replyStyle', 'replyMode', 'replyPerHour', 'skipWords']
    const clean = {}
    for (const k of allowed) if (patch && patch[k] !== undefined) clean[k] = patch[k]
    store.save(clean)
    refreshSettings()
    if (clean.presets || clean.defaultPreset || clean.channel !== undefined) runScan(true)
  },
  oauth_import: (file) => importOAuth(file),
  oauth_clear: () => { store.setSecret('oauthClient', ''); refreshSettings(); log('info', 'Đã xóa OAuth client.') },
  gemini_set: (key) => {
    key = String(key || '').trim()
    if (!key) return
    store.setSecret('gemini', key)
    refreshSettings()
    log('ok', state.secrets.geminiEncrypted ? 'Đã lưu Gemini API key (mã hóa bằng kho khóa của hệ điều hành).' : 'Đã lưu Gemini API key (hệ điều hành không có kho khóa, lưu dạng mã hóa đơn giản).')
  },
  gemini_clear: () => { store.setSecret('gemini', ''); refreshSettings(); log('info', 'Đã xóa Gemini API key.') },
  studio_home: () => { triedModes = new Set(); studio.webContents.loadURL(STUDIO_URL).catch(() => {}) },
  update_open: () => shell.openExternal(release ? release.url : updater.RELEASES_PAGE),
  update_check: () => !busy && updateCheck(),
  update_install: () => !busy && updateInstall(),
}

ipcMain.handle('call', async (_e, cmd, payload) => {
  const fn = commands[cmd]
  if (fn) {
    try { await fn(payload) } catch (e) { log('error', `${cmd}: ${e.message}`) }
  }
  return state
})

// ---- khoi dong ----------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680,
    title: 'YT Auto Studio', backgroundColor: '#0a0a0b', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  })
  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, '..', 'ui_dist', 'index.html'))
  createStudioView()
  win.on('closed', () => { win = null })
}

function fatal(err) {
  const text = String((err && err.stack) || err)
  try { fs.writeFileSync(logFile('error.log'), text) } catch (_) { /* bo qua */ }
  dialog.showErrorBox('YT Auto Studio - lỗi', `${text.slice(-900)}\n\nChi tiết: ${logFile('error.log')}`)
  app.exit(1)
}
process.on('uncaughtException', fatal)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (win) { win.restore(); win.focus() } })
  app.on('window-all-closed', () => app.quit())
  app.whenReady().then(() => {
    store = new Store(app.getPath('userData'), safeStorage)
    refreshSettings()
    createWindow()
    if (store.settings.root) runScan(true)
    setInterval(refreshStudio, 2000)
    if (!process.env.YA_NO_UPDATE_CHECK) updateCheck()
  }).catch(fatal)
}
