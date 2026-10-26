// YT Auto Studio - cua so chinh: thanh ben | cot dieu khien | (tuy trang) YouTube Studio
// nhung ngay ben phai (WebContentsView) cho cac viec API cua YouTube khong ho tro.
const { app, BrowserWindow, WebContentsView, ipcMain, shell, net, dialog, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const updater = require('./updater')
const scanner = require('./scanner')
const { buildVideoMeta, validateMeta, planSchedule, CATEGORIES } = require('./metadata')
const { Store, parseOAuthClient } = require('./store')
const { Google, endpoints, gemini, descriptionPrompt, replyPrompt, parseReply } = require('./google')
const { CommentDesk } = require('./comments')
const { uploadOne } = require('./uploader')
const { googleSession, REJECTED, REJECTED_TEXT } = require('./studio/session')
const { tokenName, migrateApiToken, checkApiChannel } = require('./accounts')

const MAX_LOGS = 300
const STUDIO_URL = process.env.YA_STUDIO_URL || 'https://studio.youtube.com/'
// Goc dia chi cho cac luong tu dong (bai kiem tro sang may chu gia tests/mock-yt)
const URLS = {
  studio: process.env.YA_STUDIO_BASE || 'https://studio.youtube.com',
  youtube: process.env.YA_YOUTUBE_BASE || 'https://www.youtube.com',
}
// Phai dat TRUOC app.whenReady(): noi luu phien dang nhap, cai dat va log.
if (process.env.YA_DATA_DIR) app.setPath('userData', process.env.YA_DATA_DIR)

let win = null
let studio = null // WebContentsView
let store = null
let busy = false
let release = null // ban moi tim thay tren GitHub
let stop = false
let raw = new Map() // id -> du lieu quet day du (duong dan file) cho viec dang
let desk = null // CommentDesk
let commentsBusy = false
const kind = updater.installKind({ exe: process.execPath, packaged: app.isPackaged, platform: process.platform })
const state = {
  status: 'idle', logs: [],
  version: app.getVersion(),
  update: { status: 'idle', latest: '', notes: '', progress: 0, error: '', manual: kind === 'manual' },
  settings: null,
  secrets: { gemini: false, geminiEncrypted: false, oauth: null },
  scan: { root: '', videos: [], posts: [], errors: [], at: '' },
  studio: { channelId: '', channelName: '', url: '', visible: false },
  youtube: { channel: null, busy: false },
  jobs: {}, // id video -> { status: queued|run|done|error|stopped, step, progress, error, url }
  draft: null, // { id, text, loading, error } mo ta Gemini dang soan
  comments: { items: [], busy: false, at: '', sentLastHour: 0 },
  categories: CATEGORIES,
  f: {}, // trang thai rieng cua tung tinh nang (src/features/*), vd f.optimize
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

// Lich su da dang: chan dang lai mot thu muc neu chua chuyen duoc vao da-dang/
const historyFile = () => logFile('uploads.json')
function readHistory() {
  try { return JSON.parse(fs.readFileSync(historyFile(), 'utf8')) } catch (_) { return [] }
}
function addHistory(entry) {
  const h = readHistory()
  h.push(entry)
  fs.writeFileSync(historyFile(), JSON.stringify(h.slice(-2000), null, 1))
}

function runScan(quiet = false) {
  const r = scanner.scan(store.settings.root)
  const done = new Map(readHistory().map((h) => [h.folder, h]))
  for (const v of r.videos) {
    const h = done.get(v.folder)
    if (h) v.errors.unshift(`Đã đăng lên YouTube lúc ${new Date(h.at).toLocaleString('vi-VN')} (${h.url}). Chuyển thư mục này vào da-dang/ để ẩn.`)
  }
  const ready = r.videos.filter((v) => !v.errors.length)
  const plan = planSchedule(ready, (v) => store.presetFor(v))
  const planOf = new Map(ready.map((v, i) => [v.id, plan[i]]))
  const channel = store.settings.channel
  raw = new Map()
  state.scan = {
    root: r.root, errors: r.errors, at: r.at,
    videos: r.videos.map((v) => {
      const preset = store.presetFor(v)
      const p = planOf.get(v.id) || { publishAt: null, warning: '' }
      const meta = buildVideoMeta(v, preset, { publishAt: p.publishAt, channel })
      const problems = v.errors.length ? v.errors : validateMeta(meta)
      raw.set(v.id, { folder: v.folder, video: v.video, meta, info: v.info, name: v.name, ok: !problems.length })
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

// ---- dang nhap Google trong app --------------------------------------------------------
// Nhu AI Automation Studio: moi tai khoan Google mot phien rieng, giu user agent THAT cua app
// (src/studio/session.js). Google tu choi thi chi bao lai, khong doi UA, khong xoa phien.
let rejectedAt = ''
function reportRejected(url) {
  if (rejectedAt === url) return
  rejectedAt = url
  log('error', 'Google từ chối đăng nhập trong tool ("trình duyệt hoặc ứng dụng có thể không an toàn"). Hãy chụp màn hình khung Studio gửi cho người hỗ trợ tool; tool không tự đổi cách đăng nhập.')
}

// ---- khung YouTube Studio -----------------------------------------------------------
// Khung hien Studio cua MOT tai khoan (phien); doi tai khoan = tao lai khung tren phien khac.
let studioPartition = ''
let lastPane = null
function createStudioView(partition, url = STUDIO_URL) {
  studioPartition = partition
  studio = new WebContentsView({ webPreferences: { session: googleSession(partition), backgroundThrottling: false } })
  const wc = studio.webContents
  wc.setWindowOpenHandler(({ url: u }) => {
    if (/^https:\/\/([\w-]+\.)*(google|youtube)\.com\//.test(u)) wc.loadURL(u)
    else if (/^https?:/.test(u)) shell.openExternal(u)
    return { action: 'deny' }
  })
  if (studio.setBorderRadius) studio.setBorderRadius(10)
  studio.setVisible(false) // chi hien khi trang hien tai co khung trinh duyet
  win.contentView.addChildView(studio)
  wc.loadURL(url).catch(() => {})
}

function useStudio(partition, url) {
  if (!win) return
  if (studio && studioPartition === partition) {
    if (url) studio.webContents.loadURL(url).catch(() => {})
    return
  }
  if (studio) {
    try { win.contentView.removeChildView(studio) } catch (_) { /* da go */ }
    try { studio.webContents.close() } catch (_) { /* da dong */ }
  }
  Object.assign(state.studio, { channelId: '', channelName: '', url: '' })
  createStudioView(partition, url)
  if (lastPane) setPane(lastPane)
  push()
}

// Giao dien bao vi tri khung (px cua cua so); null = trang nay khong co khung.
function setPane(r) {
  lastPane = r
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
  if (REJECTED.test(url)) reportRejected(url)
  else if (/^https:\/\/accounts\.google\.com\//.test(url) && !wc.isLoading()) {
    const text = await wc.executeJavaScript('document.body ? document.body.innerText.slice(0, 2000) : ""').catch(() => '')
    if (REJECTED_TEXT.test(text)) reportRejected(url)
  }
  const channelId = (/\/channel\/(UC[\w-]{10,})/.exec(url) || [])[1] || ''
  if (channelId !== state.studio.channelId) {
    state.studio.channelId = channelId
    state.studio.channelName = ''
    if (channelId) {
      log('ok', `Đã vào YouTube Studio của kênh ${channelId}.`)
      if (ctx.onStudioChannel) await ctx.onStudioChannel(channelId, wc).catch(() => {})
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

// ---- YouTube API --------------------------------------------------------------------
function oauthClient() {
  try { return store.hasSecret('oauthClient') ? JSON.parse(store.getSecret('oauthClient')) : null } catch (_) { return null }
}
// Token API cua kenh `ch` (mac dinh: kenh dang video chon o Cai dat), luu o khoa 'ytToken:<UC>'
function google(ch = state.youtube.channel) {
  const client = oauthClient()
  if (!client) throw new Error('Chưa nhập OAuth client (Cài đặt → Kết nối YouTube API).')
  const name = ch ? tokenName(ch.id) : ''
  let tokens = null
  try { tokens = name && store.hasSecret(name) ? JSON.parse(store.getSecret(name)) : null } catch (_) { /* hong */ }
  return new Google({ client, tokens, fetchFn: net.fetch, ep: endpoints(), onTokens: (t) => name && store.setSecret(name, JSON.stringify(t)) })
}
// Trong kiem thu (YA_GOOGLE_MOCK) "trinh duyet" chi la mot lan fetch di theo chuyen huong
async function openLogin(url) {
  if (process.env.YA_GOOGLE_MOCK) {
    const r = await fetch(url, { redirect: 'manual' })
    await fetch(r.headers.get('location')).then((x) => x.text())
  } else await shell.openExternal(url)
}

// p.ucId: kenh nguoi dung chon o Cai dat (de trong = kenh bat ky chon tren trang Google).
// Token chi duoc luu khi Google tra ve DUNG kenh do.
async function ytLogin(p) {
  state.youtube.busy = true
  push()
  try {
    const want = p && p.ucId ? (ctx.accounts && ctx.accounts.find(p.ucId)) || { ucId: p.ucId, name: p.ucId } : null
    const hint = want && want.accountId ? ctx.accounts.email(want.accountId) : ''
    const client = oauthClient()
    if (!client) throw new Error('Chưa nhập OAuth client (Cài đặt → Kết nối YouTube API).')
    const g = new Google({ client, fetchFn: net.fetch, ep: endpoints() })
    log('info', `Đã mở trang đăng nhập Google trong trình duyệt. ${want ? `Chọn kênh "${want.name}"` : 'Chọn tài khoản có kênh'} và bấm Cho phép.`)
    await g.login(openLogin, { loginHint: hint })
    const ch = await g.myChannel()
    const bad = checkApiChannel(ch, want)
    if (bad) return log('error', bad) // bo token vua nhan
    store.setSecret(tokenName(ch.id), JSON.stringify(g.tokens))
    const list = (store.settings.apiChannels || []).filter((c) => c.id !== ch.id).concat([{ id: ch.id, title: ch.title }])
    store.save({ apiChannels: list, youtubeChannel: ch })
    state.youtube.channel = ch
    refreshSettings()
    log('ok', `Đã kết nối API kênh "${ch.title}".`)
  } catch (e) {
    log('error', `Không đăng nhập được kênh: ${e.message}`)
  } finally {
    state.youtube.busy = false
    push()
  }
}

// Chon kenh dang video trong cac kenh da ket noi API
function ytUse(ucId) {
  const ch = (store.settings.apiChannels || []).find((c) => c.id === ucId)
  if (!ch || !store.hasSecret(tokenName(ucId))) return
  store.save({ youtubeChannel: ch })
  state.youtube.channel = ch
  refreshSettings()
  log('ok', `Kênh đăng video: "${ch.title}".`)
}

function ytLogout(ucId) {
  const id = ucId || (state.youtube.channel && state.youtube.channel.id)
  if (!id) return
  store.setSecret(tokenName(id), '')
  const list = (store.settings.apiChannels || []).filter((c) => c.id !== id)
  const active = state.youtube.channel && state.youtube.channel.id !== id ? state.youtube.channel : list[0] || null
  store.save({ apiChannels: list, youtubeChannel: active })
  state.youtube.channel = active
  refreshSettings()
  log('info', 'Đã ngắt kết nối API của kênh.')
}

function setJob(id, patch) {
  state.jobs[id] = { ...(state.jobs[id] || {}), ...patch }
  push()
}

async function runUploads(ids) {
  if (!state.youtube.channel) return log('warn', 'Hãy đăng nhập kênh YouTube trước (Cài đặt → Đăng nhập kênh).')
  const list = (ids && ids.length ? ids : [...raw.keys()]).filter((id) => raw.get(id) && raw.get(id).ok && (!state.jobs[id] || state.jobs[id].status !== 'done'))
  if (!list.length) return log('warn', 'Không có video nào sẵn sàng để đăng.')
  let g
  try { g = google() } catch (e) { return log('error', e.message) }
  busy = true
  stop = false
  state.status = 'run'
  for (const id of list) setJob(id, { status: 'queued', step: '', progress: 0, error: '', url: '', title: raw.get(id).meta.title })
  log('info', `Bắt đầu đăng ${list.length} video.`)
  let ok = 0
  try {
    for (const id of list) {
      if (stop) { setJob(id, { status: 'stopped' }); continue }
      const item = raw.get(id)
      setJob(id, { status: 'run', step: 'upload', progress: 0 })
      try {
        const r = await uploadOne(g, item, {
          root: store.settings.root, log, shouldStop: () => stop,
          onStep: (step, progress) => setJob(id, progress === undefined ? { step } : { step, progress }),
        })
        addHistory({ folder: item.folder, movedTo: r.folder, id: r.id, url: r.url, title: item.meta.title, at: new Date().toISOString() })
        setJob(id, { status: 'done', step: '', progress: 100, url: r.url, warnings: r.warnings })
        ok++
      } catch (e) {
        setJob(id, { status: e.reason === 'stopped' ? 'stopped' : 'error', error: e.message })
        log(e.reason === 'stopped' ? 'warn' : 'error', `${item.meta.title}: ${e.message}`)
        // het han muc / mat dang nhap: cac video sau cung se loi, dung han
        if (['quotaExceeded', 'uploadLimitExceeded', 'invalid_grant', 'youtubeSignupRequired', 'accessNotConfigured'].includes(e.reason)) stop = true
      }
    }
  } finally {
    busy = false
    state.status = 'idle'
    log(ok === list.length ? 'ok' : 'warn', `Xong: đăng được ${ok}/${list.length} video.`)
    runScan(true)
  }
}

// ---- Gemini viet mo ta -------------------------------------------------------------
async function describe(id) {
  const item = raw.get(id)
  if (!item) return
  state.draft = { id, text: '', loading: true, error: '' }
  push()
  try {
    const text = await gemini({
      key: store.getSecret('gemini'), model: store.settings.geminiModel, fetchFn: net.fetch, ep: endpoints(),
      prompt: descriptionPrompt({ title: item.meta.title, name: item.name, notes: item.info.ghi_chu, channel: store.settings.channel, language: item.meta.language, current: item.info.mo_ta }),
    })
    state.draft = { id, text: text.replace(/[<>]/g, ''), loading: false, error: '' }
  } catch (e) {
    state.draft = { id, text: '', loading: false, error: e.message }
  }
  push()
}

// Ghi mo ta vao info.txt (giu nguyen cac dong khoa phia tren, thay phan sau "---")
function saveDescription({ id, text }) {
  const item = raw.get(id)
  if (!item || !text) return
  const file = ['info.txt', 'thong-tin.txt', 'mo-ta.txt'].map((f) => path.join(item.folder, f)).find((f) => fs.existsSync(f)) || path.join(item.folder, 'info.txt')
  let head = ''
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    const cut = lines.findIndex((l) => /^\s*-{3,}/.test(l) || /^\s*(mô tả|mo ta|description)\s*:\s*$/i.test(l))
    head = (cut === -1 ? lines : lines.slice(0, cut)).join('\r\n').trimEnd()
  }
  fs.writeFileSync(file, `${head ? `${head}\r\n` : ''}---\r\n${text.trim().replace(/\r?\n/g, '\r\n')}\r\n`)
  state.draft = null
  log('ok', `Đã lưu mô tả vào ${path.relative(store.settings.root, file)}.`)
  runScan(true)
}

// ---- binh luan duoi video (API) ---------------------------------------------------------
const COMMENT_POLL_MS = Number(process.env.YA_COMMENT_POLL_MS) || 10 * 60e3
const DRAFTS_PER_ROUND = 20

function pushComments() {
  state.comments = { ...state.comments, items: desk.items.slice(0, 200), sentLastHour: desk.sentLastHour() }
  push()
}

async function draftReply(item) {
  const p = replyPrompt({ style: store.settings.replyStyle, channel: store.settings.channel || (state.youtube.channel && state.youtube.channel.title), videoTitle: item.videoTitle, author: item.author, text: item.text })
  const out = await gemini({ key: store.getSecret('gemini'), model: store.settings.geminiModel, system: p.system, prompt: p.prompt, json: true, fetchFn: net.fetch, ep: endpoints() })
  const r = parseReply(out)
  if (r.kind === 'spam' || !r.reply) return desk.update(item.id, { status: 'skipped', kind: r.kind, draft: '', note: 'Gemini đánh giá là spam' })
  return desk.update(item.id, { status: 'ready', kind: r.kind, draft: r.reply, error: '' })
}

async function sendReply(id, text) {
  const item = desk.get(id)
  text = String(text || '').trim().replace(/[<>]/g, '')
  if (!item || !text) return false
  if (!desk.canSend(store.settings.replyPerHour)) {
    log('warn', `Đã gửi đủ ${store.settings.replyPerHour} trả lời trong 1 giờ qua (giới hạn trong Cài đặt). Thử lại sau.`)
    return false
  }
  try {
    await google().reply(id, text)
    desk.markSent(id, text)
    return true
  } catch (e) {
    desk.update(id, { status: 'error', error: e.message })
    log('error', `Không gửi được trả lời cho ${item.author}: ${e.message}`)
    return false
  }
}

// Lay binh luan moi -> Gemini soan nhap -> (che do tu gui) gui loi khen ngan
async function commentsRound(manual = false) {
  if (commentsBusy || !state.youtube.channel) return
  if (!manual && store.settings.replyMode === 'off') return
  commentsBusy = true
  state.comments.busy = true
  pushComments()
  try {
    const g = google()
    const list = await g.channelComments(state.youtube.channel.id)
    const fresh = list.filter((c) => !desk.get(c.commentId))
    const titles = fresh.length ? await g.videoTitles(fresh.map((c) => c.videoId)) : {}
    const added = desk.merge(list, { channelId: state.youtube.channel.id, titles, skipWords: store.settings.skipWords })
    if (added || manual) log('info', `Bình luận: ${added} bình luận mới.`)
    state.comments.at = new Date().toISOString()
    pushComments()
    if (store.settings.replyMode !== 'off' && store.hasSecret('gemini')) {
      let n = 0
      let sent = 0
      for (const it of desk.items.filter((x) => x.status === 'new')) {
        if (n++ >= DRAFTS_PER_ROUND) break
        try { await draftReply(it) } catch (e) {
          desk.update(it.id, { status: 'error', error: e.message })
          if (e.reason === 'badKey' || e.reason === 'quota' || e.reason === 'model') { log('error', `Gemini: ${e.message}`); break }
        }
        pushComments()
        const cur = desk.get(it.id)
        if (store.settings.replyMode === 'auto' && CommentDesk.autoOk(cur) && desk.canSend(store.settings.replyPerHour)) {
          if (await sendReply(cur.id, cur.draft)) sent++
          pushComments()
        }
      }
      if (sent) log('ok', `Đã tự gửi ${sent} trả lời cho bình luận khen.`)
    } else if (store.settings.replyMode !== 'off' && desk.items.some((x) => x.status === 'new')) {
      log('warn', 'Chưa có Gemini API key nên chưa soạn được trả lời (Cài đặt → Gemini API).')
    }
  } catch (e) {
    log('error', `Không lấy được bình luận: ${e.message}`)
  } finally {
    commentsBusy = false
    state.comments.busy = false
    pushComments()
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
  stop: () => { stop = true },
  yt_login: (p) => !busy && !state.youtube.busy && ytLogin(p),
  yt_logout: (ucId) => !busy && ytLogout(ucId),
  yt_use: (ucId) => !busy && ytUse(ucId),
  upload: (ids) => !busy && runUploads(ids),
  describe: (id) => describe(id),
  draft_close: () => { state.draft = null },
  save_description: (p) => !busy && saveDescription(p || {}),
  comments_fetch: () => commentsRound(true),
  comment_send: async (p) => { if (await sendReply(p && p.id, p && p.text)) log('ok', 'Đã gửi trả lời.'); pushComments() },
  comment_skip: (id) => { desk.update(id, { status: 'skipped', note: 'Bạn bỏ qua' }); pushComments() },
  comment_redraft: async (id) => {
    const it = desk.get(id)
    if (!it) return
    try { await draftReply(it) } catch (e) { desk.update(id, { status: 'error', error: e.message }) }
    pushComments()
  },
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
  studio_home: () => { rejectedAt = ''; studio.webContents.loadURL(STUDIO_URL).catch(() => {}) },
  update_open: () => shell.openExternal(release ? release.url : updater.RELEASES_PAGE),
  update_check: () => !busy && updateCheck(),
  update_install: () => !busy && updateInstall(),
}

// ---- tinh nang dang mo-dun (src/features/*.js) -----------------------------------------
// Moi tinh nang: module.exports = (ctx) => ({ commands: { ten_lenh: fn }, start?: fn })
// va giu trang thai cua minh trong state.f.<ten>.
const ctx = {
  app, state, push, log, logFile, urls: URLS,
  get store() { return store },
  refreshSettings,
  stopped: () => stop,
  resetStop: () => { stop = false },
  isBusy: () => busy,
  setBusy: (b) => { busy = b; state.status = b ? 'run' : 'idle'; push() },
  gemini: (opts) => gemini({ key: store.getSecret('gemini'), model: store.settings.geminiModel, ...opts }),
  // dat boi tinh nang accounts: chay fn(page) tren kenh da chon (tu chuyen kenh, kiem UC ID)
  withChannel: null,
  accounts: null,
  // khung Studio hien ben phai: doi sang phien cua tai khoan khac
  studio: { use: (partition, url) => useStudio(partition, url), wc: () => studio && studio.webContents, home: STUDIO_URL },
}
const FEATURES = ['accounts']
const started = []
for (const name of FEATURES) {
  const f = require(`./features/${name}`)(ctx)
  Object.assign(commands, f.commands || {})
  if (f.start) started.push(f.start)
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
    title: 'YT Auto Studio', backgroundColor: '#0a0a0b', autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  })
  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, '..', 'ui_dist', 'index.html'))
  createStudioView((ctx.accounts && ctx.accounts.panePartition()) || 'persist:youtube')
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
    migrateApiToken(store)
    refreshSettings() // token 0.3 -> token cua kenh
    const ch = store.settings.youtubeChannel
    if (ch && store.hasSecret(tokenName(ch.id))) state.youtube.channel = ch
    desk = new CommentDesk(app.getPath('userData'))
    state.comments.items = desk.items.slice(0, 200)
    setInterval(() => commentsRound(false), COMMENT_POLL_MS)
    createWindow()
    for (const fn of started) fn()
    if (store.settings.root) runScan(true)
    setInterval(refreshStudio, 2000)
    if (!process.env.YA_NO_UPDATE_CHECK) updateCheck()
  }).catch(fatal)
}
