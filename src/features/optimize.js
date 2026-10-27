// Tinh nang "Toi uu video": quet video da dang cua kenh, toi uu trong Studio theo mau cua kenh,
// roi Thich + binh luan + ghim tren trang xem video. Nho video da toi uu o optimized.json.
// Quet: doc 10 video moi nhat, mo tung trang Chi tiet (chi doc) xem con thieu muc nao so voi mau.
const fs = require('fs')
const { listVideos, optimizeVideo, inspectVideo, commentAndPin } = require('../flows/optimize')
const ot = require('../optimize-template')

// Binh luan duoc tren trang xem: video cong khai / khong cong khai (rieng tu, len lich thi khong)
const PUBLIC = /^(công khai|không công khai|public|unlisted)$/i
const LATEST = 10 // chi quet 10 video moi nhat (trang Noi dung xep moi nhat truoc)

module.exports = (ctx) => {
  const S = ctx.state.f.optimize = { channelKey: '', channels: [], videos: [], busy: false, at: '', templates: {} }
  const cache = new Map() // channelKey -> { videos, at }
  const dbFile = () => ctx.logFile('optimized.json')
  const readDb = () => { try { return JSON.parse(fs.readFileSync(dbFile(), 'utf8')) } catch (_) { return {} } }
  const writeDb = (db) => fs.writeFileSync(dbFile(), JSON.stringify(db, null, 1))

  const templates = () => {
    const t = (ctx.store && ctx.store.settings.optimizeTemplates) || {}
    return t.default ? t : { ...t, default: ot.defaultTemplate() }
  }
  function refresh() {
    S.channels = ctx.accounts ? ctx.accounts.channels().map((c) => ({ key: c.key, name: c.name, handle: c.handle || '', ucId: c.ucId || '' })) : []
    if (!S.channelKey && S.channels.length) S.channelKey = S.channels[0].key
    S.templates = templates()
    const c = cache.get(S.channelKey)
    S.videos = c ? c.videos : []
    S.at = c ? c.at : ''
    const db = readDb()
    // video da quet (co missing) giu trang thai cua lan quet / lan toi uu
    for (const v of S.videos) if (v.status !== 'run' && v.status !== 'scan' && !v.missing) v.status = ot.isOptimized(db, S.channelKey, v.id) ? 'done' : v.status === 'error' ? 'error' : 'new'
    ctx.push()
  }
  const set = (id, patch) => { const v = S.videos.find((x) => x.id === id); if (v) Object.assign(v, patch); ctx.push() }
  const channel = (key) => (ctx.accounts && ctx.accounts.find(key)) || S.channels.find((c) => c.key === key) || null
  const ucOf = (key) => { const c = channel(key); return (c && c.ucId) || (/^UC[\w-]{10,}$/.test(key) ? key : '') }

  function ready(key) {
    if (!ctx.withChannel) { ctx.log('warn', 'Chưa có tài khoản Google nào (trang Tài khoản).'); return false }
    if (!key) { ctx.log('warn', 'Hãy chọn kênh cần tối ưu.'); return false }
    if (S.busy) { ctx.log('warn', 'Đang tối ưu, đợi xong rồi thử lại.'); return false }
    return true
  }

  async function list(channelKey) {
    const key = String(channelKey || S.channelKey || '')
    if (!ready(key)) return
    S.channelKey = key
    S.busy = true
    ctx.push()
    ctx.resetStop()
    try {
      const tpl = ot.templateFor(templates(), key)
      await ctx.withChannel(key, async (page) => {
        const rows = await listVideos(page, ucOf(key), { urls: ctx.urls, log: ctx.log, limit: LATEST })
        const db = readDb()
        const prev = (id) => (db[key] && db[key][id]) || {}
        // viec o trang xem video (thich / binh luan / ghim) chua kiem lai duoc o lan toi uu truoc: quet khong doc duoc nen lay tu db
        const watchLeft = (id) => (prev(id).missing || []).filter((k) => ['thích', 'bình luận', 'ghim'].includes(k))
        S.videos = rows.map((r) => ({ ...r, status: 'scan', step: 'Chờ đọc', error: '', warnings: prev(r.id).warnings || [] }))
        S.at = new Date().toISOString()
        ctx.push()
        // doc tung video (chi doc): loi o mot video khong dung ca lan quet
        for (const [i, v] of S.videos.entries()) {
          if (ctx.stopped()) { Object.assign(v, { status: 'new', step: '', note: 'Chưa đọc (đã dừng).' }); continue }
          set(v.id, { step: `Đang đọc ${i + 1}/${S.videos.length}…` })
          try {
            const r = await inspectVideo(page, v.id, tpl, { urls: ctx.urls, log: ctx.log, video: v })
            const missing = [...r.missing, ...watchLeft(v.id)]
            Object.assign(v, { missing, note: r.notes.join(' · '), title: r.title || v.title, status: missing.length ? 'new' : 'done' })
          } catch (e) {
            if (page.snapshot) await page.snapshot(`quet-${v.id}`).catch(() => {})
            Object.assign(v, { missing: [], note: `Không đọc được trang Chi tiết: ${e.message}`, status: 'new' })
            ctx.log('warn', `${v.title || v.id}: không đọc được trang Chi tiết (${e.message}).`)
          }
          set(v.id, { step: '' })
        }
      }, { label: 'Quét video' })
      cache.set(key, { videos: S.videos, at: S.at })
      const left = S.videos.filter((v) => v.status === 'new').length
      ctx.log('ok', `Kênh ${(channel(key) || {}).name || key}: ${S.videos.length} video, ${left} chưa tối ưu.`)
    } catch (e) {
      ctx.log('error', `Không quét được video: ${e.message}`)
    } finally {
      for (const v of S.videos) if (v.status === 'scan') Object.assign(v, { status: 'new', step: '', note: v.note || 'Chưa đọc được.' })
      S.busy = false
      ctx.push()
    }
  }

  // Toi uu danh sach video `todo` cua kenh `key` (mot lan withChannel cho ca lo).
  // v.tpl (neu co): mau rieng cua video (mau Studio cua preset luc dang), khong thi mau cua kenh.
  async function optimizeMany(key, todo) {
    const chTpl = ot.templateFor(templates(), key)
    const name = (channel(key) || {}).name || ''
    const mine = () => key === S.channelKey
    const setV = (id, patch) => { if (mine()) set(id, patch) }
    ctx.resetStop()
    S.busy = true
    for (const v of todo) setV(v.id, { status: 'run', step: 'Chờ', error: '' })
    ctx.log('info', `Bắt đầu tối ưu ${todo.length} video.`)
    let ok = 0
    let partial = 0 // video chua thich / binh luan / ghim duoc
    try {
      await ctx.withChannel(key, async (page) => {
        for (const v of todo) {
          if (ctx.stopped()) { setV(v.id, { status: 'new', step: '' }); continue }
          const onStep = (step) => setV(v.id, { step })
          const tpl = v.tpl ? ot.normalizeTemplate(v.tpl) : chTpl
          try {
            const r = await optimizeVideo(page, v.id, tpl, { urls: ctx.urls, log: ctx.log, onStep, video: v, channelName: name })
            const warnings = [...r.warnings]
            const text = ot.renderComment(tpl.comment, { tieu_de: r.title || v.title, link: `https://youtu.be/${v.id}`, ten_kenh: name })
            let c = null
            if (tpl.like || text) {
              if (!v.visibility || PUBLIC.test(v.visibility)) {
                // phan Studio da luu: loi o trang xem video chi la canh bao (chay lai se khong dang trung)
                try {
                  const ch = channel(key) || {}
                  c = await commentAndPin(page, v.id, text, { urls: ctx.urls, log: ctx.log, onStep, like: tpl.like, pin: tpl.pin, channel: { name: ch.name || name, handle: ch.handle || '', ucId: ucOf(key) } })
                  warnings.push(...c.warnings)
                } catch (e) {
                  if (ctx.stopped()) throw e
                  if (page.snapshot) await page.snapshot(`binh-luan-${v.id}`)
                  warnings.push(`Đã tối ưu trong Studio nhưng chưa thích / bình luận được: ${e.message}`)
                }
              } else warnings.push(`Video đang "${v.visibility}" nên chưa thích / bình luận được. Tối ưu lại khi video đã công khai.`)
            }
            // viec muon lam o trang xem video ma CHUA kiem lai duoc (sau khi tai lai trang)
            const missing = [tpl.like && !(c && c.liked) && 'thích', text && !(c && c.commented) && 'bình luận', text && tpl.pin && !(c && c.pinned) && 'ghim'].filter(Boolean)
            for (const w of warnings) if (!r.warnings.includes(w)) ctx.log('warn', `${r.title || v.title}: ${w}`)
            if (missing.length) {
              partial++
              ctx.log('warn', `${r.title || v.title}: chưa ${missing.join(', ')} được (đã kiểm lại trên trang xem video).`)
            }
            writeDb(ot.markOptimized(readDb(), key, v.id, { title: r.title, changed: r.changed, liked: !!(c && c.liked), commented: !!(c && c.commented), pinned: !!(c && c.pinned), missing, warnings }))
            // khong quet lai: muc con thieu = muc quet thay thieu ma toi uu chua doi duoc (chi khi co canh bao Studio)
            const left = [...(r.warnings.length ? (v.missing || []).filter((k) => !r.changed.includes(k) && !['thích', 'bình luận', 'ghim'].includes(k)) : []), ...missing]
            setV(v.id, { status: left.length ? 'new' : 'done', step: '', title: r.title || v.title, warnings, missing: left, note: '' })
            ok++
          } catch (e) {
            if (page.snapshot) await page.snapshot(`toi-uu-${v.id}`)
            setV(v.id, { status: ctx.stopped() ? 'new' : 'error', step: '', error: e.message })
            ctx.log(ctx.stopped() ? 'warn' : 'error', `${v.title || v.id}: ${e.message}`)
          }
        }
      }, { label: 'Tối ưu video' })
    } catch (e) {
      ctx.log('error', `Không tối ưu được: ${e.message}`)
      for (const v of todo) if (mine() && S.videos.some((x) => x.id === v.id && x.status === 'run')) set(v.id, { status: 'error', step: '', error: e.message })
    } finally {
      S.busy = false
      if (mine()) cache.set(key, { videos: S.videos, at: S.at })
      ctx.log(ok === todo.length && !partial ? 'ok' : 'warn', `Xong: tối ưu được ${ok}/${todo.length} video${partial ? `, ${partial} video chưa thích / bình luận / ghim được (xem cảnh báo)` : ''}.`)
    }
    return ok
  }

  async function run({ channelKey, ids } = {}) {
    const key = String(channelKey || S.channelKey || '')
    if (!ready(key)) return
    if (key !== S.channelKey) { S.channelKey = key; refresh() }
    const want = (ids && ids.length ? ids : S.videos.filter((v) => v.status === 'new').map((v) => v.id))
    const todo = want.map((id) => S.videos.find((v) => v.id === id) || { id, title: id, visibility: '', date: '' })
    if (!todo.length) return ctx.log('warn', 'Không có video nào cần tối ưu.')
    await optimizeMany(key, todo)
  }

  // ---- tu toi uu sau khi dang (preset.optimizeAfterUpload) ----
  // main.js goi ctx.afterUpload sau moi video dang xong. Video duoc xep hang cho toi khi qua gio
  // dang + 15 phut (cho YouTube xu ly xong), roi tu toi uu bang mau Studio cua preset (preset.optimize,
  // cac muc API da dat thi giu nguyen). Preset/hang cho cu khong co mau: dung mau cua kenh nhu truoc.
  const pendingFile = () => ctx.logFile('optimize-pending.json')
  const readPending = () => { try { return JSON.parse(fs.readFileSync(pendingFile(), 'utf8')) } catch (_) { return [] } }
  const writePending = (list) => fs.writeFileSync(pendingFile(), JSON.stringify(list, null, 1))
  const AFTER_MS = 15 * 60e3
  ctx.afterUpload = ({ videoId, title, publishAt, preset, channelId } = {}) => {
    if (!preset || !preset.optimizeAfterUpload || !videoId || !channelId) return
    try { // khong bao gio lam hong buoc dang video
      const due = Math.max(Date.now(), (publishAt && Date.parse(publishAt)) || 0) + AFTER_MS
      const entry = { channelKey: channelId, id: videoId, title: title || videoId, due }
      if (preset.optimize) Object.assign(entry, { presetId: preset.id || '', tpl: ot.withoutApiFields(preset.optimize) })
      writePending(readPending().filter((x) => x.id !== videoId).concat([entry]))
      ctx.log('info', `Đã xếp "${title || videoId}" vào hàng chờ tự tối ưu (lúc ${new Date(due).toLocaleString('vi-VN')}).`)
    } catch (e) { ctx.log('warn', `Không xếp được video vào hàng chờ tối ưu: ${e.message}`) }
  }
  // Mau cho video trong hang cho: preset hien tai (nguoi dung co the da sua mau sau khi dang),
  // preset da xoa thi mau chup luc dang, khong co ca hai -> null (mau cua kenh).
  function pendingTemplate(x) {
    const ps = (ctx.store && ctx.store.settings.presets) || []
    const p = x.presetId && ps.find((q) => q.id === x.presetId)
    if (p && p.optimize) return ot.withoutApiFields(p.optimize)
    return x.tpl ? ot.withoutApiFields(x.tpl) : null
  }
  async function processPending(now = Date.now()) {
    if (S.busy || !ctx.withChannel) return 0
    const due = readPending().filter((x) => x.due <= now)
    if (!due.length) return 0
    const key = due[0].channelKey
    const batch = due.filter((x) => x.channelKey === key)
    // bo khoi hang cho truoc khi chay: loi thi video van hien trong trang Toi uu video de chay lai
    writePending(readPending().filter((x) => !batch.some((b) => b.id === x.id)))
    ctx.log('info', `Tự tối ưu ${batch.length} video vừa đăng.`)
    return optimizeMany(key, batch.map((x) => ({ id: x.id, title: x.title, visibility: '', date: '', tpl: pendingTemplate(x) })))
  }

  function saveTemplate({ channelKey, template } = {}) {
    const key = channelKey || 'default'
    const next = ot.setTemplate(templates(), key, template === null ? null : template || {})
    ctx.store.save({ optimizeTemplates: next })
    ctx.refreshSettings()
    S.templates = next
    ctx.log('ok', template === null ? 'Kênh này dùng lại mẫu tối ưu mặc định.' : key === 'default' ? 'Đã lưu mẫu tối ưu mặc định.' : `Đã lưu mẫu tối ưu cho kênh ${(channel(key) || {}).name || key}.`)
  }

  return {
    commands: {
      optimize_open: () => refresh(),
      optimize_select: (key) => { if (!S.busy) { S.channelKey = String(key || ''); refresh() } },
      optimize_list: (key) => list(key),
      optimize_run: (p) => run(p || {}),
      optimize_template_save: (p) => saveTemplate(p || {}),
    },
    start() {
      refresh()
      setInterval(() => processPending().catch((e) => ctx.log('error', `Tự tối ưu: ${e.message}`)), 5 * 60e3)
    },
    processPending, // cho bai kiem
  }
}
