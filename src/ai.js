// Gemini cho Dang bai AI (viet bai, ve anh) va Dang video (viet mo ta): mac dinh qua Gemini tren trinh duyet
// (ctx.geminiWeb, src/gemini-web.js, mien phi), hoac Gemini API bang key (settings.aiProvider = 'api').
// settings.aiFallbackApi: trinh duyet loi (tru khi nguoi dung bam Dung) va co key -> thu lai bang API.
// Tra loi binh luan (Cong dong) van goi thang ctx.gemini (API), khong qua day.
//   const ai = createAi(ctx, { fetchFn })
//   await ai.text({ prompt, system, json, label, shouldStop }) -> chuoi (json: doan JSON da boc)
//   await ai.image({ prompt, aspect, label, shouldStop, dir, model }) -> { file, mime }
//   ai.provider() -> 'web' | 'api'
const fs = require('fs')
const path = require('path')
const G = require('./google')
const AP = require('./ai-posts')

const WEB_JSON = 'Chỉ trả lời bằng một khối JSON hợp lệ, không thêm chữ khác.'
const err = (message, code) => Object.assign(new Error(message), { code })
// ten file an toan tu nhan ("Bài ảnh: Đức tin" -> "Bai-anh-Duc-tin")
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
  .replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// opts: { fetchFn, ep } cho Gemini API; { apiText, apiImage } thay ham API (bai kiem)
function createAi(ctx, opts = {}) {
  const apiText = opts.apiText || G.gemini
  const apiImage = opts.apiImage || AP.geminiImage
  const settings = () => (ctx.store && ctx.store.settings) || {}
  const key = () => (ctx.store && ctx.store.getSecret ? ctx.store.getSecret('gemini') : '') || ''
  const provider = () => (settings().aiProvider === 'api' ? 'api' : 'web')
  const log = (level, msg) => { if (ctx.log) ctx.log(level, msg) }
  const imgDir = () => ctx.logFile(path.join('ai-posts', 'anh'))
  const checkStop = (shouldStop) => { if (shouldStop && shouldStop()) throw err('Đã dừng theo yêu cầu.', 'GEMINI_STOPPED') }

  // bai kiem: Gemini trinh duyet gia (tests/gemini-web-fake.js tro toi tests/google-mock.js) thay ctx.geminiWeb
  let fake = null
  if (process.env.YA_GEMINI_WEB_FAKE) {
    try { fake = require(path.join(__dirname, '..', 'tests', 'gemini-web-fake.js'))(ctx, process.env.YA_GEMINI_WEB_FAKE) } catch (e) { log('warn', `Không mở được Gemini giả: ${e.message}`) }
  }
  const web = () => {
    const gw = fake || ctx.geminiWeb
    if (!gw) throw err('Bản này chưa có Gemini trên trình duyệt. Chọn "API key" ở Cài đặt → Gemini.', 'GEMINI_UNAVAILABLE')
    return gw
  }

  // ---- Gemini API (key, model trong Cai dat) ----
  async function apiTextCall({ prompt, system, json = false, shouldStop }) {
    checkStop(shouldStop)
    const s = settings()
    const out = await apiText({ key: key(), model: s.geminiModel, thinking: s.geminiThinking, prompt, system, json, fetchFn: opts.fetchFn, ep: opts.ep })
    return json ? G.extractJson(out) || String(out).trim() : String(out).trim()
  }
  async function apiImageCall({ prompt, aspect = '1:1', label, shouldStop, dir, model }) {
    checkStop(shouldStop)
    const img = await apiImage({ key: key(), model: model || undefined, prompt, aspect, fetchFn: opts.fetchFn, ep: opts.ep })
    const d = dir || imgDir()
    fs.mkdirSync(d, { recursive: true })
    const file = path.join(d, `${slug(label) || 'anh'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${img.ext}`)
    fs.writeFileSync(file, img.data)
    return { file, mime: img.mime }
  }

  // ---- Gemini tren trinh duyet: khong co system / che do JSON -> ghep vao loi nhac ----
  async function webTextCall({ prompt, system, json = false, label, shouldStop }) {
    const gw = web()
    checkStop(shouldStop)
    const full = [system && String(system).trim(), String(prompt || '').trim(), json ? WEB_JSON : ''].filter(Boolean).join('\n\n')
    const out = String((await gw.ask({ prompt: full, label, shouldStop })) || '').trim()
    if (!out) throw err('Gemini trên trình duyệt không trả lời.', 'GEMINI_EMPTY')
    return json ? G.extractJson(out) || out : out
  }
  async function webImageCall({ prompt, aspect = '1:1', label, shouldStop, dir }) {
    const gw = web()
    checkStop(shouldStop)
    const p = `Create an image (generate the picture itself, do not only describe it). Aspect ratio ${aspect}.\n${String(prompt || '').trim()}`
    return gw.image({ prompt: p, label, shouldStop, dir: dir || imgDir() })
  }

  // provider 'web': loi (tru Dung) + aiFallbackApi + co key -> thu bang API
  async function route(o, webCall, apiCall, what) {
    if (provider() === 'api') return apiCall(o)
    try {
      return await webCall(o)
    } catch (e) {
      if (e.code === 'GEMINI_STOPPED' || (o.shouldStop && o.shouldStop())) throw e
      if (!settings().aiFallbackApi || !key()) throw e
      log('warn', `Gemini trên trình duyệt chưa ${what} được (${e.message}): thử lại bằng Gemini API.`)
      try {
        return await apiCall(o)
      } catch (e2) {
        if (e2.code === 'GEMINI_STOPPED') throw e2
        throw Object.assign(new Error(`${e.message} Gemini API dự phòng cũng lỗi: ${e2.message}`), { code: e.code, apiError: e2 })
      }
    }
  }

  // nut "Mở Gemini": cua so Gemini de nguoi dung dang nhap / xu ly hop thoai. other: lenh gemini_web_open cua src/gemini-web.js
  function openWeb(other) {
    if (fake) return fake.open()
    if (other) return other()
    if (ctx.geminiWeb) return ctx.geminiWeb.open()
    log('warn', 'Bản này chưa có Gemini trên trình duyệt.')
  }

  return {
    provider, openWeb,
    text: (o = {}) => route(o, webTextCall, apiTextCall, 'viết'),
    image: (o = {}) => route(o, webImageCall, apiImageCall, 'vẽ ảnh'),
  }
}

module.exports = { createAi, WEB_JSON }
