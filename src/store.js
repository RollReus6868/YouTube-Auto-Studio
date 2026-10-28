// Luu cai dat (settings.json) va khoa bi mat (secrets.json) trong thu muc du lieu cua app.
// Khoa bi mat duoc ma hoa bang safeStorage cua Electron (truyen vao tu main.js) neu
// he dieu hanh ho tro; giao dien khong bao gio nhan lai gia tri khoa, chi biet "da co".
const fs = require('fs')
const path = require('path')
const { defaultPreset, normalizePreset } = require('./metadata')
const { presetSeed } = require('./optimize-template')
const { GEMINI_DEFAULT, GEMINI_UPGRADE } = require('./google')

const DEFAULTS = {
  root: '', // thu muc goc (posts/ cho trang Dang bai; ban cu: ca videos/)
  videoDir: '', // thu muc video phang cua trang Dang video (trong = dung thu muc goc)
  channel: '',
  presets: [defaultPreset()],
  defaultPreset: 'mac-dinh',
  geminiModel: GEMINI_DEFAULT,
  geminiThinking: 'low', // cap do tu duy: low | medium | high
  replyStyle: 'Trả lời thân thiện, ngắn gọn (1–2 câu), xưng "mình", gọi khán giả là "bạn". Cảm ơn khi được khen, trả lời đúng trọng tâm câu hỏi. Không hứa hẹn điều kênh không làm.',
  replyMode: 'review', // review | auto | off
  replyPerHour: 20,
  skipWords: '',
  // phan mo ta mac dinh (vd link donate / ebook) them vao mo ta moi video; co thi thay mo ta Studio dien san khi dang
  descDefault: '',
  descPosition: 'above', // phan Gemini viet / mo ta rieng cua video nam: above = tren | below = duoi phan mac dinh
  uploadChannel: '', // khoa kenh (UC ID) dang video qua hop thoai tai len cua Studio (trang Dang video)
}

class Store {
  constructor(dir, crypt = null) {
    this.dir = dir
    this.crypt = crypt // { isEncryptionAvailable(), encryptString(s) -> Buffer, decryptString(Buffer) -> s }
    this.file = path.join(dir, 'settings.json')
    this.secretFile = path.join(dir, 'secrets.json')
    this.settings = this.load()
  }

  load() {
    let s = {}
    try { s = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch (_) { /* lan dau */ }
    const out = { ...DEFAULTS, ...s }
    out.presets = (Array.isArray(s.presets) && s.presets.length ? s.presets : DEFAULTS.presets).map((p) => normalizePreset(p, presetSeed(p, s.optimizeTemplates)))
    if (!out.presets.some((p) => p.id === out.defaultPreset)) out.defaultPreset = out.presets[0].id
    // ban cu chon Gemini 2.5: doi sang model moi cung loai
    if (GEMINI_UPGRADE[out.geminiModel]) out.geminiModel = GEMINI_UPGRADE[out.geminiModel]
    return out
  }

  save(patch = {}) {
    const next = { ...this.settings, ...patch }
    if (patch.presets) {
      next.presets = patch.presets.map((p) => normalizePreset(p, presetSeed(p, next.optimizeTemplates)))
      const ids = new Set()
      for (const p of next.presets) {
        if (!p.id || ids.has(p.id)) p.id = `mau-${Date.now().toString(36)}-${ids.size}`
        ids.add(p.id)
      }
      if (!next.presets.length) next.presets = [defaultPreset()]
      if (!ids.has(next.defaultPreset)) next.defaultPreset = next.presets[0].id
    }
    this.settings = next
    fs.mkdirSync(this.dir, { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2))
    fs.renameSync(tmp, this.file)
    return next
  }

  presetFor(item) {
    const want = item && item.info && item.info.preset
    const ps = this.settings.presets
    return (want && ps.find((p) => p.name.toLowerCase() === String(want).toLowerCase() || p.id === want)) ||
      ps.find((p) => p.id === this.settings.defaultPreset) || ps[0]
  }

  // ---- khoa bi mat ----
  readSecrets() {
    try { return JSON.parse(fs.readFileSync(this.secretFile, 'utf8')) } catch (_) { return {} }
  }

  setSecret(name, value) {
    const all = this.readSecrets()
    if (!value) delete all[name]
    else if (this.crypt && this.crypt.isEncryptionAvailable()) all[name] = { enc: true, v: this.crypt.encryptString(value).toString('base64') }
    else all[name] = { enc: false, v: Buffer.from(value, 'utf8').toString('base64') }
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(this.secretFile, JSON.stringify(all), { mode: 0o600 })
  }

  getSecret(name) {
    const e = this.readSecrets()[name]
    if (!e) return ''
    try {
      const buf = Buffer.from(e.v, 'base64')
      return e.enc ? this.crypt.decryptString(buf) : buf.toString('utf8')
    } catch (_) { return '' }
  }

  hasSecret(name) { return !!this.readSecrets()[name] }
  secretEncrypted(name) { const e = this.readSecrets()[name]; return !!(e && e.enc) }
}

// Ban cu dang video qua YouTube Data API: bo OAuth client, token tung kenh va danh sach kenh API (khong con dung).
// Kenh dang video cu (youtubeChannel) thanh kenh dang video mac dinh. Tra ve so muc da bo.
function dropApiData(store) {
  const secrets = Object.keys(store.readSecrets()).filter((k) => k === 'oauthClient' || k === 'youtubeToken' || k.startsWith('ytToken:'))
  for (const k of secrets) store.setSecret(k, '')
  const s = store.settings
  const had = 'youtubeChannel' in s || 'apiChannels' in s
  if (had) {
    const old = s.youtubeChannel && /^UC[\w-]{10,}$/.test(s.youtubeChannel.id || '') ? s.youtubeChannel.id : ''
    const next = { ...s }
    delete next.youtubeChannel
    delete next.apiChannels
    if (!next.uploadChannel && old) next.uploadChannel = old
    store.settings = next
    store.save({})
  }
  return secrets.length + (had ? 1 : 0)
}

module.exports = { Store, DEFAULTS, dropApiData }
