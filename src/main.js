// YT Auto Studio - cua so chinh: thanh ben | cot dieu khien | (tuy trang) YouTube Studio
// nhung ngay ben phai (WebContentsView). Moi viec tren YouTube (dang video, toi uu, binh luan, dang bai...)
// chay trong cua so Studio an cua tung tai khoan (ctx.withChannel, src/features/accounts.js).
const { app, BrowserWindow, WebContentsView, ipcMain, shell, net, dialog, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const updater = require('./updater')
const scanner = require('./scanner')
const { buildVideoMeta, validateMeta, planSchedule, CATEGORIES, DESC_POSITIONS } = require('./metadata')
const { readScript, SCRIPT_EXT } = require('./docx')
const { Store, dropApiData } = require('./store')
const { endpoints, gemini, geminiModels, GEMINI_MODELS, descriptionPrompt } = require('./google')
const { CommentDesk } = require('./comments')
const { uploadOne } = require('./uploader')
const { googleSession, REJECTED, REJECTED_TEXT } = require('./studio/session')
const { channelOf } = require('./studio/driver')

const MAX_LOGS = 300
const STUDIO_URL = process.env.YA_STUDIO_URL || 'https://studio.youtube.com/'
// Goc dia chi cho cac luong tu dong (bai kiem tro sang may chu gia tests/mock-yt)
const URLS = {
  studio: process.env.YA_STUDIO_BASE || 'https://studio.youtube.com',
  youtube: process.env.YA_YOUTUBE_BASE || 'https://www.youtube.com',
}
// Phai dat TRUOC app.whenReady(): noi luu phien dang nhap, cai dat va log.
if (process.env.YA_DATA_DIR) app.setPath('userData', process.env.YA_DATA_DIR)
// Windows: Chromium coi cua so bi cua so khac che (cua so Studio chay ngam nam sau cua so chinh) la "an" va
// ngung ve trang -> menu / hop thoai Studio khong mo, binh luan khong tai, khong chup duoc anh loi.
// Tat viec do (giong cac cong cu tu dong hoa trinh duyet chay nen).
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')

let win = null
let studio = null // WebContentsView
let store = null
let busy = false
let release = null // ban moi tim thay tren GitHub
let stop = false
let raw = new Map() // id -> du lieu quet day du (duong dan file) cho viec dang
// kich ban cho Gemini viet mo ta, chon tay theo id video (chi giu trong bo nho): duong dan, '' = bo kich ban tu nhan
const scripts = new Map()
let desk = null // CommentDesk
const kind = updater.installKind({ exe: process.execPath, packaged: app.isPackaged, platform: process.platform })
const state = {
  status: 'idle', logs: [],
  version: app.getVersion(),
  update: { status: 'idle', latest: '', notes: '', progress: 0, error: '', manual: kind === 'manual' },
  settings: null,
  secrets: { gemini: false, geminiEncrypted: false },
  // model Gemini de chon trong Cai dat: danh sach co san, "Tai danh sach model" thay bang danh sach cua API key
  gemini: { models: GEMINI_MODELS, loading: false, error: '', at: '' },
  scan: { root: '', videoDir: '', videos: [], posts: [], errors: [], at: '' }, // root: thu muc goc (bai dang); videoDir: thu muc video
  // job: viec tool dang chay trong khung (nguoi dung xem; khong doi tai khoan / kenh cua khung luc do)
  studio: { channelId: '', channelName: '', url: '', visible: false, job: '' },
  upload: { channelKey: '', channels: [] }, // kenh dang video (trang Dang video) + cac kenh da tick o trang Tai khoan
  jobs: {}, // id video -> { status: queued|run|done|error|stopped, step, progress, error, url }
  draft: null, // { id, text, loading, error, script } mo ta Gemini dang soan (script: ten file kich ban da gui)
  comments: { items: [], busy: false, at: '', sentLastHour: 0 },
  categories: CATEGORIES,
  f: {}, // trang thai rieng cua tung tinh nang (src/features/*), vd f.optimize
}

const push = () => { if (win && !win.isDestroyed()) win.webContents.send('state', state) }
function log(level, msg) {
  state.logs.push({ t: new Date().toTimeString().slice(0, 8), level, msg })
  state.logs.splice(0, state.logs.length - MAX_LOGS)
  saveLog(level, msg)
  push()
}
const logFile = (name) => path.join(app.getPath('userData'), name)

// Ghi nhat ky ra <userData>/nhat-ky.txt (de nguoi dung gui lai khi bao loi); qua 2 MB thi doi
// thanh nhat-ky.old.txt (chi giu mot ban cu).
const LOG_MAX = 2 * 1024 * 1024
let logSize = -1
function saveLog(level, msg) {
  try {
    const file = logFile('nhat-ky.txt')
    if (logSize < 0) logSize = fs.existsSync(file) ? fs.statSync(file).size : 0
    if (logSize > LOG_MAX) {
      fs.rmSync(logFile('nhat-ky.old.txt'), { force: true })
      fs.renameSync(file, logFile('nhat-ky.old.txt'))
      logSize = 0
    }
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const line = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${d.toTimeString().slice(0, 8)} [${level}] ${String(msg).replace(/\r?\n/g, ' | ')}\n`
    fs.appendFileSync(file, line)
    logSize += Buffer.byteLength(line)
  } catch (_) { /* khong de loi ghi file lam hong viec dang chay */ }
}

// ---- cai dat ------------------------------------------------------------------------
function refreshSettings() {
  state.settings = store.settings
  state.secrets = { gemini: store.hasSecret('gemini'), geminiEncrypted: store.secretEncrypted('gemini') }
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

// Thu muc video cua trang Dang video: da chon rieng, chua chon thi dung thu muc goc (ban cu: <goc>/videos/<thu muc>)
const videoDir = () => store.settings.videoDir || store.settings.root || ''

// Kich ban cua video: chon tay (scripts) truoc, khong thi file tu nhan canh video (scanner: "Ten.kich-ban.txt"...)
function scriptFor(v) {
  if (scripts.has(v.id)) return scripts.get(v.id) ? { path: scripts.get(v.id), auto: false } : null
  return v.script ? { path: v.script, auto: true } : null
}

function runScan(quiet = false) {
  const root = store.settings.root
  const vdir = videoDir()
  const v = scanner.scanVideos(vdir)
  const posts = root ? scanner.scan(root).posts : []
  const r = { root, videos: v.videos, posts, errors: vdir ? v.errors : [], at: v.at }
  // lich su da dang (uploads.json): chan dang lai video chua chuyen duoc vao da-dang/ (khoa: file video | thu muc kieu cu)
  const done = new Map(readHistory().map((h) => [h.folder, h]))
  for (const it of r.videos) {
    const h = done.get(it.key)
    if (h) it.errors.unshift(`Đã đăng lên YouTube lúc ${new Date(h.at).toLocaleString('vi-VN')} (${h.url}). Chuyển ${it.layout === 'flat' ? 'file' : 'thư mục'} này vào da-dang/ để ẩn.`)
  }
  const ready = r.videos.filter((v) => !v.errors.length)
  const plan = planSchedule(ready, (v) => store.presetFor(v))
  const planOf = new Map(ready.map((v, i) => [v.id, plan[i]]))
  const channel = store.settings.channel
  raw = new Map()
  state.scan = {
    root: r.root, videoDir: vdir, errors: r.errors, at: r.at,
    videos: r.videos.map((v) => {
      const preset = store.presetFor(v)
      const p = planOf.get(v.id) || { publishAt: null, warning: '' }
      const meta = buildVideoMeta(v, preset, { publishAt: p.publishAt, channel, settings: store.settings })
      const problems = v.errors.length ? v.errors : validateMeta(meta)
      const script = scriptFor(v)
      raw.set(v.id, { layout: v.layout, key: v.key, folder: v.folder, video: v.video, files: v.files, doneDir: v.doneDir, infoFile: v.infoFile, thumbnail: v.thumbnail, meta, info: v.info, name: v.name, script, ok: !problems.length })
      return {
        id: v.id, layout: v.layout, dir: v.dir, folder: v.folder, name: v.name, size: v.size || 0,
        thumb: v.thumbnail ? path.basename(v.thumbnail) : '', infoFile: v.infoFile ? path.basename(v.infoFile) : '',
        video: v.video ? path.basename(v.video) : '', thumbUrl: fileUrl(v.thumbnail),
        subtitles: v.subtitles.map((s) => ({ file: path.basename(s.file), lang: s.lang || '' })),
        preset: preset.name, meta: { ...meta, thumbnail: undefined, subtitles: undefined },
        script: script ? { file: path.basename(script.path), auto: script.auto } : null,
        errors: problems, warnings: v.warnings.concat(p.warning ? [p.warning] : []),
      }
    }),
    posts: r.posts.map((p) => ({
      id: p.id, dir: p.dir, folder: p.folder, name: p.name, date: p.date, time: p.time, text: p.text, images: p.images.map(fileUrl), errors: p.errors, warnings: p.warnings,
      type: p.type, when: p.when, channel: p.channel, video: p.video, explanation: p.explanation,
      options: p.options.map((o) => ({ text: o.text, image: o.image ? fileUrl(o.image) : '' })),
      answers: p.answers.map((a) => ({ text: a.text, image: a.image ? fileUrl(a.image) : '', correct: a.correct })),
    })),
  }
  if (!quiet) {
    if (r.errors.length) log('warn', r.errors[0])
    else log('info', `Đã quét: ${r.videos.length} video (${state.scan.videos.filter((x) => !x.errors.length).length} sẵn sàng)${root ? `, ${r.posts.length} bài cộng đồng` : ''}.`)
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
  // tool dang chay trong khung: Studio chan roi trang khi con thay doi chua luu -> khong ai bam "Roi trang", bo qua
  wc.on('will-prevent-unload', (e) => { if (state.studio.job) e.preventDefault() })
  wc.setWindowOpenHandler(({ url: u }) => {
    // "Xac minh danh tinh" cua Studio mo cua so dang nhap Google roi bao ket qua ve cua so mo no (window.opener).
    // Mo de trong cung khung thi mat window.opener -> Google treo o "Dang xu ly, vui long doi". Cho mo cua so that.
    if (/^https:\/\/accounts\.google\.com\//.test(u)) {
      return { action: 'allow', overrideBrowserWindowOptions: { parent: win, width: 520, height: 720, autoHideMenuBar: true, title: 'Google', webPreferences: { backgroundThrottling: false } } }
    }
    if (/^https:\/\/([\w-]+\.)*(google|youtube)\.com\//.test(u)) wc.loadURL(u)
    else if (/^https?:/.test(u)) shell.openExternal(u)
    return { action: 'deny' }
  })
  if (studio.setBorderRadius) studio.setBorderRadius(10)
  studio.setVisible(false) // chi hien khi trang hien tai co khung trinh duyet
  win.contentView.addChildView(studio)
  wc.loadURL(url).catch(() => {})
}

function useStudio(partition, url, { force = false } = {}) {
  if (!win) return
  // tool dang chay trong khung: nguoi dung khong doi duoc tai khoan / trang cua khung
  if (state.studio.job && !force) return log('warn', `Khung trình duyệt đang chạy "${state.studio.job}". Đợi xong (hoặc bấm Dừng) rồi thử lại.`)
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
      if (!state.studio.job) log('ok', `Đã vào YouTube Studio của kênh ${channelId}.`)
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

// ---- kenh dang video ------------------------------------------------------------------
// Danh sach = cac kenh da tick o trang Tai khoan; nho kenh da chon (settings.uploadChannel).
function syncUploadChannels() {
  const list = (ctx.accounts ? ctx.accounts.channels() : []).map((c) => ({ key: c.key, name: c.name, handle: c.handle || '', ucId: c.ucId || '', avatar: c.avatar || '' }))
  let key = state.upload.channelKey || store.settings.uploadChannel || ''
  // khoa cu (UC, hoac "tai-khoan:Ten kenh" truoc khi biet UC) -> kenh tuong ung; khong con -> kenh dau tien
  if (list.length && !list.some((c) => c.key === key)) key = (list.find((c) => (c.ucId && c.ucId === key) || key.endsWith(`:${c.name}`)) || list[0]).key
  if (JSON.stringify(list) !== JSON.stringify(state.upload.channels) || key !== state.upload.channelKey) {
    state.upload = { channelKey: key, channels: list }
    push()
  }
}
function setUploadChannel(key) {
  state.upload.channelKey = String(key || '')
  store.save({ uploadChannel: state.upload.channelKey })
  refreshSettings()
  push()
}

function setJob(id, patch) {
  state.jobs[id] = { ...(state.jobs[id] || {}), ...patch }
  push()
}

// Dang cac video da chon len kenh dang video, lan luot, bang hop thoai tai len cua Studio trong cua so an
// cua tai khoan (src/flows/upload.js). Dung giua chung khi dang tai len se de lai ban nhap trong Studio,
// nen bam Dung luc dang tai len thi dung sau video do.
let uploading = false
let stopAfter = false
async function runUploads(ids) {
  syncUploadChannels()
  const key = state.upload.channelKey
  const ch = key && ctx.accounts && ctx.accounts.find(key)
  if (!ch) return log('warn', 'Hãy chọn kênh đăng video (trang Đăng video). Kênh lấy từ trang Tài khoản: đăng nhập Google rồi tick kênh.')
  if (!ctx.withChannel) return log('error', 'Chưa có tài khoản Google nào (trang Tài khoản).')
  const list = (ids && ids.length ? ids : [...raw.keys()]).filter((id) => raw.get(id) && raw.get(id).ok && (!state.jobs[id] || state.jobs[id].status !== 'done'))
  if (!list.length) return log('warn', 'Không có video nào sẵn sàng để đăng.')
  busy = true
  stop = false
  stopAfter = false
  state.status = 'run'
  for (const id of list) setJob(id, { status: 'queued', step: '', progress: 0, error: '', url: '', title: raw.get(id).meta.title })
  log('info', `Bắt đầu đăng ${list.length} video lên kênh "${ch.name}".`)
  let ok = 0
  try {
    for (const id of list) {
      if (stop || stopAfter) { setJob(id, { status: 'stopped' }); continue }
      const item = raw.get(id)
      const preset = store.presetFor({ info: item.info })
      setJob(id, { status: 'run', step: 'open', progress: 0 })
      uploading = true
      try {
        const r = await ctx.withChannel(key, (page) => uploadOne(page, item, {
          urls: URLS, uc: channelOf(page.url()) || ch.ucId, root: videoDir(), preset, channelName: ch.name, log,
          onStep: (step) => setJob(id, { step }),
          onProgress: (progress) => setJob(id, { progress }),
        }), { label: `dang-video-${item.name || id}` })
        addHistory({ folder: item.key || item.folder, movedTo: r.folder, id: r.id, url: r.url, title: item.meta.title, channel: ch.ucId || key, at: new Date().toISOString() })
        setJob(id, { status: 'done', step: '', progress: 100, url: r.url, warnings: r.warnings })
        if (r.after && ctx.afterUpload) ctx.afterUpload({ videoId: r.id, title: item.meta.title, publishAt: r.schedule || item.meta.publishAt, tpl: r.after, presetId: preset.id || '', channelId: key })
        ok++
      } catch (e) {
        const stopped = stop && /dừng theo yêu cầu/.test(e.message)
        setJob(id, { status: stopped ? 'stopped' : 'error', error: e.message })
        log(stopped ? 'warn' : 'error', `${item.meta.title}: ${e.message}`)
        // gioi han tai len hang ngay / mat dang nhap: cac video sau cung se loi, dung han
        // ... hoac Google doi xac minh danh tinh (nguoi dung phai tu lam o trang Tai khoan)
        if (/giới hạn tải lên|upload limit|chưa đăng nhập|đăng nhập lại|xác minh danh tính/i.test(e.message)) stopAfter = true
      } finally {
        uploading = false
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
  const file = item.script ? path.basename(item.script.path) : ''
  state.draft = { id, text: '', loading: true, error: '', script: file }
  push()
  try {
    let script = ''
    if (item.script) {
      try { script = readScript(item.script.path) } catch (e) { throw new Error(`Không đọc được kịch bản "${file}": ${e.code === 'ENOENT' ? 'không tìm thấy file' : e.message}.`) }
      if (!script.trim()) throw new Error(`Kịch bản "${file}" không có chữ.`)
      log('info', `Gemini viết mô tả cho "${item.meta.title}" theo kịch bản ${file} (${script.length.toLocaleString('vi-VN')} ký tự).`)
    }
    const text = await gemini({
      key: store.getSecret('gemini'), model: store.settings.geminiModel, thinking: store.settings.geminiThinking, fetchFn: net.fetch, ep: endpoints(),
      prompt: descriptionPrompt({ title: item.meta.title, name: item.name, notes: item.info.ghi_chu, channel: store.settings.channel, language: (store.presetFor({ info: item.info }).optimize || {}).language || '', current: item.info.mo_ta, script }),
    })
    state.draft = { id, text: text.replace(/[<>]/g, ''), loading: false, error: '', script: file }
  } catch (e) {
    state.draft = { id, text: '', loading: false, error: e.message, script: file }
  }
  push()
}

// Dinh kem kich ban cho video (hop thoai mo file); Gemini viet mo ta theo kich ban nay
async function attachScript(id) {
  const item = raw.get(id)
  if (!item) return
  const r = await dialog.showOpenDialog(win, {
    title: `Chọn kịch bản cho "${item.meta.title || item.name}"`,
    defaultPath: item.folder || videoDir() || undefined,
    properties: ['openFile'],
    filters: [{ name: 'Kịch bản (.txt, .md, .docx, .srt)', extensions: SCRIPT_EXT.map((e) => e.slice(1)) }],
  })
  if (r.canceled || !r.filePaths[0]) return
  setScript(id, r.filePaths[0])
}
function setScript(id, file) {
  const item = raw.get(id)
  if (!item) return
  if (file && !SCRIPT_EXT.includes(path.extname(file).toLowerCase())) return log('warn', `Kịch bản phải là file .txt, .md, .docx hoặc .srt ("${path.basename(file)}").`)
  scripts.set(id, file || '')
  // sua tai cho (khong quet lai thu muc: co the dang dang video)
  item.script = file ? { path: file, auto: false } : null
  const v = state.scan.videos.find((x) => x.id === id)
  if (v) v.script = file ? { file: path.basename(file), auto: false } : null
  log(file ? 'ok' : 'info', file ? `Đã đính kèm kịch bản ${path.basename(file)} cho "${item.meta.title}".` : `Đã bỏ kịch bản của "${item.meta.title}".`)
}

// Ghi mo ta vao "<ten video>.txt" (thu muc phang) hoac info.txt (thu muc con kieu cu): giu cac dong khoa, thay phan sau "---"
function saveDescription({ id, text }) {
  const item = raw.get(id)
  if (!item || !text) return
  const file = item.layout === 'flat' ? item.infoFile
    : ['info.txt', 'thong-tin.txt', 'mo-ta.txt'].map((f) => path.join(item.folder, f)).find((f) => fs.existsSync(f)) || path.join(item.folder, 'info.txt')
  let head = ''
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    const cut = lines.findIndex((l) => /^\s*-{3,}/.test(l) || /^\s*(mô tả|mo ta|description)\s*:\s*$/i.test(l))
    head = (cut === -1 ? lines : lines.slice(0, cut)).join('\r\n').trimEnd()
  }
  fs.writeFileSync(file, `${head ? `${head}\r\n` : ''}---\r\n${text.trim().replace(/\r?\n/g, '\r\n')}\r\n`)
  state.draft = null
  log('ok', `Đã lưu mô tả vào ${path.relative(videoDir(), file) || path.basename(file)}.`)
  runScan(true)
}

// Binh luan duoi video: tra loi qua hop thu Studio (src/features/inbox.js, trang Cong dong).
// Trang "Binh luan" (lay qua API) da bo tu 0.4.1 vi trung voi Cong dong (tranh tra loi 2 lan).


// ---- lenh tu giao dien --------------------------------------------------------------
async function chooseRoot() {
  const r = await dialog.showOpenDialog(win, { title: 'Chọn thư mục gốc chứa video và bài viết', properties: ['openDirectory', 'createDirectory'] })
  if (r.canceled || !r.filePaths[0]) return
  setRoot(r.filePaths[0])
}

async function chooseVideoDir() {
  const r = await dialog.showOpenDialog(win, { title: 'Chọn thư mục chứa video và ảnh thumbnail (cùng tên)', properties: ['openDirectory', 'createDirectory'] })
  if (r.canceled || !r.filePaths[0]) return
  setVideoDir(r.filePaths[0])
}
function setVideoDir(dir) {
  store.save({ videoDir: dir })
  refreshSettings()
  log('ok', `Thư mục video: ${dir}`)
  runScan()
}

function setRoot(root) {
  store.save({ root })
  refreshSettings()
  log('ok', `Thư mục gốc: ${root}`)
  runScan()
}

const commands = {
  hello: () => {},
  stop: () => {
    if (uploading && !stopAfter) {
      stopAfter = true
      log('info', 'Sẽ dừng sau khi video đang tải lên xong (dừng giữa chừng sẽ để lại bản nháp trong Studio).')
      return
    }
    stop = true
  },
  upload: (ids) => !busy && runUploads(ids),
  upload_channel: (key) => !busy && setUploadChannel(key),
  describe: (id) => describe(id),
  draft_close: () => { state.draft = null },
  script_attach: (id) => attachScript(id),
  script_remove: (id) => setScript(id, ''),
  save_description: (p) => !busy && saveDescription(p || {}),
  pane: (r) => setPane(r),
  clear: () => { state.logs = [] },
  scan: () => runScan(),
  choose_root: () => chooseRoot(),
  set_root: (p) => p && setRoot(String(p)),
  choose_video_dir: () => chooseVideoDir(),
  set_video_dir: (p) => p && setVideoDir(String(p)),
  create_skeleton: () => {
    if (!store.settings.root) return log('warn', 'Hãy chọn thư mục gốc trước.')
    try { scanner.createSkeleton(store.settings.root); log('ok', 'Đã tạo các thư mục videos, posts, da-dang và file HUONG-DAN.txt.'); runScan(true) } catch (e) { log('error', e.message) }
  },
  open_path: (p) => p && shell.openPath(String(p)),
  open_data: () => shell.openPath(app.getPath('userData')), // nhat-ky.txt, loi-trang/, optimized.json...
  open_url: (u) => /^https:\/\//.test(u) && shell.openExternal(u),
  settings_save: (patch) => {
    // chi nhan cac truong cai dat thuong; khoa bi mat di lenh rieng
    const allowed = ['channel', 'presets', 'defaultPreset', 'runInPane', 'geminiModel', 'geminiThinking', 'replyStyle', 'replyMode', 'replyPerHour', 'skipWords', 'descDefault', 'descPosition']
    const clean = {}
    for (const k of allowed) if (patch && patch[k] !== undefined) clean[k] = patch[k]
    if (clean.descDefault !== undefined) clean.descDefault = String(clean.descDefault).replace(/\r\n?/g, '\n')
    if (clean.descPosition !== undefined && !DESC_POSITIONS.includes(clean.descPosition)) clean.descPosition = 'above'
    const rescan = clean.presets || clean.defaultPreset || ['channel', 'descDefault', 'descPosition'].some((k) => clean[k] !== undefined && clean[k] !== store.settings[k])
    store.save(clean)
    refreshSettings()
    if (rescan) runScan(true)
  },
  gemini_set: (key) => {
    key = String(key || '').trim()
    if (!key) return
    store.setSecret('gemini', key)
    refreshSettings()
    log('ok', state.secrets.geminiEncrypted ? 'Đã lưu Gemini API key (mã hóa bằng kho khóa của hệ điều hành).' : 'Đã lưu Gemini API key (hệ điều hành không có kho khóa, lưu dạng mã hóa đơn giản).')
  },
  gemini_clear: () => { store.setSecret('gemini', ''); refreshSettings(); log('info', 'Đã xóa Gemini API key.') },
  // hoi Google cac model Gemini ma key nay dung duoc (model moi ra them sau ban nay van chon duoc)
  gemini_models: async () => {
    if (state.gemini.loading) return
    Object.assign(state.gemini, { loading: true, error: '' })
    push()
    try {
      const list = await geminiModels({ key: store.getSecret('gemini'), fetchFn: net.fetch, ep: endpoints() })
      // model goi y len dau, sau do cac model khac cua API
      const known = GEMINI_MODELS.filter(([id]) => list.some(([x]) => x === id))
      const rest = list.filter(([id]) => !GEMINI_MODELS.some(([x]) => x === id)).sort((a, b) => b[0].localeCompare(a[0]))
      Object.assign(state.gemini, { models: [...(known.length ? known : GEMINI_MODELS), ...rest], at: new Date().toISOString() })
      log('ok', `Gemini: key này dùng được ${list.length} model viết chữ.`)
    } catch (e) {
      state.gemini.error = e.message
      log('error', `Không lấy được danh sách model Gemini: ${e.message}`)
    } finally {
      state.gemini.loading = false
      push()
    }
  },
  studio_home: () => { if (state.studio.job) return log('warn', `Khung trình duyệt đang chạy "${state.studio.job}". Đợi xong rồi thử lại.`); rejectedAt = ''; studio.webContents.loadURL(STUDIO_URL).catch(() => {}) },
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
  gemini: (opts) => gemini({ key: store.getSecret('gemini'), model: store.settings.geminiModel, thinking: store.settings.geminiThinking, ...opts }),
  // dat boi tinh nang accounts: chay fn(page) tren kenh da chon (tu chuyen kenh, kiem UC ID)
  withChannel: null,
  accounts: null,
  // khung Studio hien ben phai: doi sang phien cua tai khoan khac
  studio: {
    use: (partition, url, o) => useStudio(partition, url, o), wc: () => studio && studio.webContents, home: STUDIO_URL,
    // viec tu dong chay trong khung (de nguoi dung theo doi): giao dien hien khung o moi trang khi job != ''
    claim: (job) => { state.studio.job = job || 'Tool đang chạy'; push() },
    release: () => { state.studio.job = ''; push() },
    // cua so chinh thu nho / an -> Chromium dung ve khung (Studio lam do dang): mo lai, khong cuop focus
    wake: () => {
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) { log('warn', 'Cửa sổ tool đang thu nhỏ trong lúc tool chạy: đã mở lại để YouTube Studio chạy đúng.'); win.restore() }
      else if (!win.isVisible()) win.showInactive()
    },
  },
  get desk() { return desk }, // CommentDesk chung (binh luan API + hop thu Studio), co sau app.whenReady
}
const FEATURES = ['accounts', 'inbox', 'optimize', 'posts', 'hometab']
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
  // thu nho luc tool dang chay trong khung: Windows dung ve trang -> menu / hop thoai Studio hong
  win.on('minimize', () => { if (state.studio.job) log('warn', `Đừng thu nhỏ cửa sổ khi tool đang chạy ("${state.studio.job}"): YouTube Studio sẽ ngừng chạy đúng. Có thể để cửa sổ khác che lên.`) })
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
    log('info', `YT Auto Studio ${app.getVersion()} đã mở.`)
    // ban cu dang qua YouTube Data API: bo OAuth client / token, kenh dang video cu thanh kenh mac dinh
    if (dropApiData(store)) log('info', 'Đã bỏ dữ liệu YouTube Data API cũ (OAuth, token): video giờ đăng bằng hộp thoại tải lên của YouTube Studio.')
    refreshSettings()
    desk = new CommentDesk(app.getPath('userData'))
    createWindow()
    for (const fn of started) fn()
    syncUploadChannels()
    setInterval(syncUploadChannels, 3000).unref()
    if (videoDir() || store.settings.root) runScan(true)
    setInterval(refreshStudio, 2000)
    if (!process.env.YA_NO_UPDATE_CHECK) updateCheck()
  }).catch(fatal)
}
