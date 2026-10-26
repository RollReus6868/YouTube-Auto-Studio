// Luu cai dat (settings.json) va khoa bi mat (secrets.json) trong thu muc du lieu cua app.
// Khoa bi mat duoc ma hoa bang safeStorage cua Electron (truyen vao tu main.js) neu
// he dieu hanh ho tro; giao dien khong bao gio nhan lai gia tri khoa, chi biet "da co".
const fs = require('fs')
const path = require('path')
const { defaultPreset, normalizePreset } = require('./metadata')

const DEFAULTS = {
  root: '',
  channel: '',
  presets: [defaultPreset()],
  defaultPreset: 'mac-dinh',
  geminiModel: 'gemini-2.5-flash',
  replyStyle: 'Trả lời thân thiện, ngắn gọn (1–2 câu), xưng "mình", gọi khán giả là "bạn". Cảm ơn khi được khen, trả lời đúng trọng tâm câu hỏi. Không hứa hẹn điều kênh không làm.',
  replyMode: 'review', // review | auto | off
  replyPerHour: 20,
  skipWords: '',
  loginMode: '',
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
    out.presets = (Array.isArray(s.presets) && s.presets.length ? s.presets : DEFAULTS.presets).map(normalizePreset)
    if (!out.presets.some((p) => p.id === out.defaultPreset)) out.defaultPreset = out.presets[0].id
    return out
  }

  save(patch = {}) {
    const next = { ...this.settings, ...patch }
    if (patch.presets) {
      next.presets = patch.presets.map(normalizePreset)
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

// File client OAuth tai tu Google Cloud (loai "Desktop app"): { installed: { client_id, client_secret, ... } }
function parseOAuthClient(text) {
  let j
  try { j = JSON.parse(text) } catch (_) { throw new Error('File không phải JSON hợp lệ.') }
  const c = j.installed || j.web
  if (!c || !c.client_id || !c.client_secret) throw new Error('Không thấy client_id / client_secret. Hãy tải file JSON của OAuth client loại "Desktop app".')
  if (j.web && !j.installed) throw new Error('Đây là OAuth client loại "Web application". Hãy tạo loại "Desktop app" rồi tải lại file JSON.')
  return { client_id: c.client_id, client_secret: c.client_secret, project_id: c.project_id || '' }
}

module.exports = { Store, DEFAULTS, parseOAuthClient }
