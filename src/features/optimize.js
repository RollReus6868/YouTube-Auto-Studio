// Tinh nang "Toi uu video": quet video da dang cua kenh, toi uu trong Studio theo mau cua kenh,
// roi Thich + binh luan + ghim tren trang xem video. Nho video da toi uu o optimized.json.
// Quet: doc N video moi nhat (nguoi dung chon, mac dinh 10), mo tung trang Chi tiet (chi doc) xem con thieu muc nao so voi mau.
// Quet toan bo: 2 video moi nhat cua MOI kenh da tick (trang Tai khoan), lan luot tung kenh (ctx.withChannel).
// Toi uu: chi lam cac muc lan quet bao thieu (muc da dien giu nguyen, tinh la xong).
// Ket qua quet luu o optimize-scan.json (mo lai tool van con).
// Video lan truoc da "Đã tối ưu" (the xanh) thi quet bo qua, khong mo trang Chi tiet nua (ot.alreadyOptimized);
// "Quét lại" o tung video (optimize_rescan) ep doc lai. Ket qua quet cua tung video luu them o optimized.json (_scanned).
const fs = require('fs')
const { listVideos, optimizeVideo, videoVisibility, inspectVideo, commentAndPin, pinNote } = require('../flows/optimize')
const ot = require('../optimize-template')
const { QUIET_MS } = require('../idle')

// Binh luan duoc tren trang xem: video cong khai / khong cong khai (rieng tu, len lich, cong chieu thi khong).
// Nhan ca Studio tieng Viet lan tieng Anh (Public / Unlisted / Private / Scheduled / Premiere): xem ot.visibilityKind
// so video moi nhat se quet (trang Noi dung xep moi nhat truoc); luu o settings.optimizeScanLimit
const LIMITS = [5, 10, 20, 30, 50]
const LATEST = 10
const ALL_LIMIT = 2 // quet toan bo: so video moi nhat moi kenh
const SKIP_NOTE = 'Đã tối ưu ở lần trước: không quét lại.'
const limitOf = (n) => (LIMITS.includes(Number(n)) ? Number(n) : LATEST)
const WATCH = ot.WATCH_KEYS // 'thích' | 'bình luận' | 'ghim'

module.exports = (ctx) => {
  const S = ctx.state.f.optimize = {
    channelKey: '', channels: [], videos: [], busy: false, at: '', templates: {}, limit: LATEST, limits: LIMITS,
    // quet toan bo: { at, running, current (kenh dang quet), perChannel, groups: [{ key, name, error, videos }] }
    all: { at: '', running: false, current: '', perChannel: ALL_LIMIT, groups: [] },
    // hang cho tu toi uu sau khi dang: auto = cong tac settings.optimizeAuto; pending: [{ id, title, channelKey, channelName, due, preset }];
    // pendingWait: vi sao video da toi gio chua chay (tool dang ban / dang tat); quietMin: phut khong thao tac thi coi la ranh
    auto: true, pending: [], pendingWait: '', quietMin: Math.round(QUIET_MS / 60e3),
  }
  const cache = new Map() // channelKey -> { videos, at } (S.videos la cung mang voi cache cua kenh dang chon)
  const allMeta = { at: '', keys: [], ids: {}, errors: {} } // lan quet toan bo gan nhat
  const dbFile = () => ctx.logFile('optimized.json')
  const readDb = () => { try { return JSON.parse(fs.readFileSync(dbFile(), 'utf8')) } catch (_) { return {} } }
  const writeDb = (db) => fs.writeFileSync(dbFile(), JSON.stringify(db, null, 1))
  const scanFile = () => ctx.logFile('optimize-scan.json')
  const saveScan = () => {
    try {
      fs.writeFileSync(scanFile(), JSON.stringify({ channels: Object.fromEntries(cache), all: allMeta }, null, 1))
    } catch (e) { ctx.log('warn', `Không lưu được kết quả quét: ${e.message}`) }
  }
  // video dang doc / dang toi uu luc tat tool -> "chua toi uu"
  const settle = (v) => (v.status === 'scan' || v.status === 'run' ? Object.assign(v, { status: 'new', step: '' }) : v)
  try {
    const saved = JSON.parse(fs.readFileSync(scanFile(), 'utf8'))
    for (const [key, c] of Object.entries(saved.channels || {})) if (c && Array.isArray(c.videos)) cache.set(key, { videos: c.videos.map(settle), at: c.at || '' })
    if (saved.all && Array.isArray(saved.all.keys)) Object.assign(allMeta, { at: saved.all.at || '', keys: saved.all.keys, ids: saved.all.ids || {}, errors: saved.all.errors || {} })
  } catch (_) { /* chua co / hong: bo qua */ }

  const templates = () => {
    const t = (ctx.store && ctx.store.settings.optimizeTemplates) || {}
    return t.default ? t : { ...t, default: ot.defaultTemplate() }
  }
  const channel = (key) => (ctx.accounts && ctx.accounts.find(key)) || S.channels.find((c) => c.key === key) || null
  const ucOf = (key) => { const c = channel(key); return (c && c.ucId) || (/^UC[\w-]{10,}$/.test(key) ? key : '') }
  const nameOf = (key) => (channel(key) || {}).name || key
  const findV = (key, id) => ((cache.get(key) || {}).videos || []).find((x) => x.id === id) || (key === S.channelKey ? S.videos.find((x) => x.id === id) : null)
  // nhom video cua lan quet toan bo (lay tu cache: cung doi tuong voi danh sach tung kenh)
  function syncAll() {
    S.all.at = allMeta.at
    S.all.groups = allMeta.keys.map((key) => ({ key, name: nameOf(key), error: allMeta.errors[key] || '', videos: (allMeta.ids[key] || []).map((id) => findV(key, id)).filter(Boolean) }))
  }
  const push = () => { syncAll(); ctx.push() }

  function refresh() {
    S.channels = ctx.accounts ? ctx.accounts.channels().map((c) => ({ key: c.key, name: c.name, handle: c.handle || '', ucId: c.ucId || '' })) : []
    if (!S.channelKey && S.channels.length) S.channelKey = S.channels[0].key
    S.templates = templates()
    S.limit = limitOf(ctx.store && ctx.store.settings.optimizeScanLimit)
    const c = cache.get(S.channelKey)
    S.videos = c ? c.videos : []
    S.at = c ? c.at : ''
    const db = readDb()
    // video chua quet duoc (khong co missing) lay trang thai tu lan toi uu; video da quet giu trang thai cua lan quet / toi uu
    for (const v of S.videos) if (v.status !== 'run' && v.status !== 'scan' && !v.missing && !v.unread) v.status = ot.isOptimized(db, S.channelKey, v.id) ? 'done' : v.status === 'error' ? 'error' : 'new'
    syncPending()
    push()
  }
  const setIn = (key, id, patch) => { const v = findV(key, id); if (v) Object.assign(v, patch); push() }

  function ready(key) {
    if (!ctx.withChannel) { ctx.log('warn', 'Chưa có tài khoản Google nào (trang Tài khoản).'); return false }
    if (!key) { ctx.log('warn', 'Hãy chọn kênh cần tối ưu.'); return false }
    if (S.busy) { ctx.log('warn', 'Đang tối ưu, đợi xong rồi thử lại.'); return false }
    return true
  }

  function setLimit(n) {
    const limit = limitOf(n)
    if (ctx.store && ctx.store.settings.optimizeScanLimit !== limit) ctx.store.save({ optimizeScanLimit: limit })
    S.limit = limit
    push()
  }

  // ---- doc 1 video (chi doc) -> cap nhat v: { status, missing, note } ----
  // viec o trang xem video (thich / binh luan / ghim) chua kiem lai duoc o lan toi uu truoc: quet khong doc duoc nen lay tu db.
  // Kenh khong ghim duoc (cannotPin): khong tinh "ghim" la thieu, ghi chu "đã thích và bình luận - chưa ghim".
  async function scanOne(page, key, v, tpl, db) {
    const prev = (db[key] && db[key][v.id]) || {}
    const watchLeft = (prev.missing || []).filter((k) => WATCH.includes(k) && !(k === 'ghim' && prev.cannotPin))
    const r = await inspectVideo(page, v.id, tpl, { urls: ctx.urls, log: ctx.log, video: v })
    const missing = [...r.missing, ...watchLeft]
    const notes = [...r.notes]
    if (prev.cannotPin && prev.note && !missing.includes('ghim')) notes.push(prev.note)
    Object.assign(v, { missing, unread: false, note: notes.join(' · '), title: r.title || v.title, status: missing.length ? 'new' : 'done' })
    // nho ket qua quet (ca khi con thieu): lan quet sau biet video nao da "Đã tối ưu" ma khong mo lai trang Chi tiet
    try { writeDb(ot.markScanned(readDb(), key, v.id, { title: v.title, done: !missing.length })) } catch (e) { ctx.log('warn', `Không lưu được kết quả quét: ${e.message}`) }
  }
  // Lan truoc video da "Đã tối ưu" (old: video trong ket qua quet da luu) -> khong quet lai
  const skipScan = (key, id, db, old) => ot.alreadyOptimized({ video: old || null, record: ot.optimizedRecord(db, key, id), scanned: ot.scannedRecord(db, key, id) })
  // video bo qua: "Đã tối ưu" ngay, giu ghi chu "đã thích và bình luận - chưa ghim" (kenh khong ghim duoc)
  function skippedPatch(key, id, db) {
    const rec = ot.optimizedRecord(db, key, id) || {}
    const note = [rec.cannotPin && rec.note, SKIP_NOTE].filter(Boolean).join(' · ')
    return { status: 'done', step: '', error: '', missing: [], unread: false, note }
  }
  // doc lan luot `list` cua kenh key; hop thoai xac minh danh tinh -> dung cac video con lai cua kenh nay
  async function scanList(page, key, list, tpl) {
    const db = readDb()
    let blocked = ''
    for (const [i, v] of list.entries()) {
      if (ctx.stopped()) { Object.assign(v, { status: 'new', step: '', note: 'Chưa đọc (đã dừng).' }); continue }
      if (blocked) { Object.assign(v, { status: 'new', step: '', unread: true, missing: undefined, note: blocked }); continue }
      setIn(key, v.id, { step: `Đang đọc ${i + 1}/${list.length}…` })
      try {
        await scanOne(page, key, v, tpl, db)
      } catch (e) {
        if (page.snapshot) await page.snapshot(`quet-${v.id}`).catch(() => {})
        if (e.code === 'verify') {
          blocked = e.message
          ctx.log('error', `Kênh ${nameOf(key)}: ${e.message}`)
        } else ctx.log('warn', `${v.title || v.id}: không đọc được trang Chi tiết (${e.message}).`)
        // chua doc duoc: khong biet thieu gi (missing undefined) -> toi uu se lam ca mau
        Object.assign(v, { missing: undefined, unread: true, note: e.code === 'verify' ? e.message : `Không đọc được trang Chi tiết: ${e.message}`, status: 'new' })
      }
      setIn(key, v.id, { step: '' })
    }
  }

  // p: ma kenh (cu) hoac { channelKey, limit }
  async function list(p) {
    const o = p && typeof p === 'object' ? p : { channelKey: p }
    const key = String(o.channelKey || S.channelKey || '')
    if (o.limit !== undefined) setLimit(o.limit)
    if (!ready(key)) return
    S.channelKey = key
    S.busy = true
    push()
    ctx.resetStop()
    const limit = S.limit
    let skipped = 0 // video lan truoc da toi uu: khong quet lai
    const n = { ok: 0, partial: 0 }
    let total = 0 // so video da dua vao toi uu (o.optimize)
    try {
      const tpl = ot.templateFor(templates(), key)
      await ctx.withChannel(key, async (page) => {
        const rows = await listVideos(page, ucOf(key), { urls: ctx.urls, log: ctx.log, limit, maxPages: Math.max(10, Math.ceil(limit / 5)) })
        const db = readDb()
        const prev = (id) => (db[key] && db[key][id]) || {}
        const old = (cache.get(key) || {}).videos || []
        S.videos = rows.map((r) => {
          const v = { ...r, error: '', warnings: prev(r.id).warnings || [] }
          return Object.assign(v, skipScan(key, r.id, db, old.find((x) => x.id === r.id)) ? skippedPatch(key, r.id, db) : { status: 'scan', step: 'Chờ đọc' })
        })
        skipped = S.videos.filter((v) => v.status === 'done').length
        S.at = new Date().toISOString()
        cache.set(key, { videos: S.videos, at: S.at })
        push()
        // doc tung video (chi doc): loi o mot video khong dung ca lan quet
        await scanList(page, key, S.videos.filter((v) => v.status === 'scan'), tpl)
        const left = S.videos.filter((v) => v.status === 'new').length
        ctx.log('ok', `Kênh ${nameOf(key)}: ${S.videos.length} video, ${left} chưa tối ưu${skipped ? ` (bỏ qua ${skipped} video đã tối ưu)` : ''}.`)
        if (o.optimize) total += await optimizeScanned(page, key, S.videos, n)
      }, { label: o.optimize ? 'Quét và tối ưu' : 'Quét video' })
    } catch (e) {
      ctx.log('error', `Không quét được video: ${e.message}`)
    } finally {
      for (const v of S.videos) if (v.status === 'scan' || v.status === 'run') Object.assign(v, { status: 'new', step: '', note: v.note || (v.status === 'scan' ? 'Chưa đọc được.' : '') })
      S.busy = false
      saveScan()
      push()
      if (total) doneLog(n, total)
    }
  }

  // ---- quet toan bo: 2 video moi nhat cua moi kenh da tick ----
  // video cua lan quet nay hop vao danh sach cua kenh (cung doi tuong): trang tung kenh va nhom "Quet toan bo" cung trang thai
  // video lan truoc da toi uu: "Đã tối ưu" ngay, khong quet (status 'done'); con lai status 'scan'
  function mergeIntoChannel(key, rows, db) {
    const c = cache.get(key) || { videos: [], at: '' }
    const prev = (id) => (db[key] && db[key][id]) || {}
    const out = rows.map((r) => {
      const old = c.videos.find((x) => x.id === r.id)
      const patch = skipScan(key, r.id, db, old) ? skippedPatch(key, r.id, db) : { status: 'scan', step: 'Chờ đọc', error: '' }
      return Object.assign(old || { warnings: prev(r.id).warnings || [] }, r, patch)
    })
    c.videos.unshift(...out.filter((v) => !c.videos.includes(v))) // giu mang cu (S.videos tro toi cung mang)
    if (!c.at) c.at = new Date().toISOString()
    cache.set(key, c)
    if (key === S.channelKey) { S.videos = c.videos; S.at = c.at }
    return out
  }
  async function scanAll({ optimize = false } = {}) {
    if (!ctx.withChannel) return ctx.log('warn', 'Chưa có tài khoản Google nào (trang Tài khoản).')
    if (S.busy) return ctx.log('warn', 'Đang tối ưu, đợi xong rồi thử lại.')
    const chans = ctx.accounts ? ctx.accounts.channels() : []
    if (!chans.length) return ctx.log('warn', 'Chưa tick kênh nào ở trang Tài khoản.')
    S.busy = true
    S.all.running = true
    Object.assign(allMeta, { at: new Date().toISOString(), keys: chans.map((c) => c.key), ids: {}, errors: {} })
    ctx.resetStop()
    push()
    ctx.log('info', `Quét toàn bộ: ${ALL_LIMIT} video mới nhất của ${chans.length} kênh.`)
    let left = 0
    let skipped = 0
    const n = { ok: 0, partial: 0 }
    let total = 0
    try {
      for (const ch of chans) {
        if (ctx.stopped()) { allMeta.errors[ch.key] = 'Chưa quét (đã dừng).'; continue }
        S.all.current = ch.key
        push()
        try {
          const tpl = ot.templateFor(templates(), ch.key)
          await ctx.withChannel(ch.key, async (page) => {
            const rows = await listVideos(page, ucOf(ch.key), { urls: ctx.urls, log: ctx.log, limit: ALL_LIMIT, maxPages: 1 })
            const vids = mergeIntoChannel(ch.key, rows, readDb())
            allMeta.ids[ch.key] = vids.map((v) => v.id)
            skipped += vids.filter((v) => v.status === 'done').length
            push()
            await scanList(page, ch.key, vids.filter((v) => v.status === 'scan'), tpl)
            left += vids.filter((v) => v.status === 'new').length
            if (optimize) total += await optimizeScanned(page, ch.key, vids, n)
          }, { label: optimize ? 'Quét và tối ưu toàn bộ' : 'Quét toàn bộ' })
        } catch (e) {
          allMeta.errors[ch.key] = e.message
          ctx.log('error', `Kênh ${ch.name || ch.key}: không quét được (${e.message}).`)
        }
        for (const id of allMeta.ids[ch.key] || []) { const v = findV(ch.key, id); if (v && (v.status === 'scan' || v.status === 'run')) Object.assign(v, { status: 'new', step: '', note: v.note || (v.status === 'scan' ? 'Chưa đọc được.' : '') }) }
      }
      ctx.log('ok', `Quét toàn bộ xong: ${chans.length} kênh, ${left} video chưa tối ưu${skipped ? ` (bỏ qua ${skipped} video đã tối ưu)` : ''}.`)
    } finally {
      if (total) doneLog(n, total)
      S.busy = false
      S.all.running = false
      S.all.current = ''
      saveScan()
      push()
    }
  }

  // "Quét lại" mot video (ke ca video da toi uu / bo qua): doc lai trang Chi tiet; ket qua quet moi nhat
  // (markScanned) quyet dinh lan quet sau co bo qua video nay khong
  async function rescan({ channelKey, id } = {}) {
    const key = String(channelKey || S.channelKey || '')
    if (!ready(key)) return
    const v = findV(key, String(id || ''))
    if (!v) return ctx.log('warn', 'Không rõ video cần quét lại.')
    S.busy = true
    ctx.resetStop()
    Object.assign(v, { status: 'scan', step: 'Chờ đọc', error: '', note: '' })
    push()
    try {
      await ctx.withChannel(key, (page) => scanList(page, key, [v], ot.templateFor(templates(), key)), { label: 'Quét lại video' })
      if (!v.unread && v.status !== 'scan') ctx.log('ok', `${v.title || v.id}: quét lại xong, ${v.missing && v.missing.length ? `còn thiếu ${v.missing.length} mục` : 'không thiếu mục nào'}.`)
    } catch (e) {
      ctx.log('error', `Không quét lại được video: ${e.message}`)
    } finally {
      if (v.status === 'scan') Object.assign(v, { status: 'new', step: '', note: v.note || 'Chưa đọc được.' })
      S.busy = false
      saveScan()
      push()
    }
  }

  // Toi uu danh sach video `todo` cua kenh `key` (mot lan withChannel cho ca lo).
  // v.tpl (neu co): mau rieng cua video (mau Studio cua preset luc dang), khong thi mau cua kenh.
  // Video da quet (v.missing): chi lam muc quet bao thieu; muc da dien giu nguyen (tinh la xong).
  // Lam lan luot `todo` tren page da o dung kenh (trong withChannel). n: { ok, partial } cong don.
  async function optimizeOn(page, key, todo, n) {
    const chTpl = ot.templateFor(templates(), key)
    const name = nameOf(key) === key ? '' : nameOf(key)
    const setV = (id, patch) => setIn(key, id, patch)
    let blocked = '' // hop thoai xac minh danh tinh: dung cac video con lai cua tai khoan nay
    for (const v of todo) {
      if (ctx.stopped()) { setV(v.id, { status: 'new', step: '' }); continue }
      if (blocked) { setV(v.id, { status: 'error', step: '', error: blocked }); continue }
      const onStep = (step) => setV(v.id, { step })
      const base = v.tpl ? ot.normalizeTemplate(v.tpl) : chTpl
      const prev = (readDb()[key] || {})[v.id]
      // da quet: chi cac muc con thieu; video tool chua tung lam o trang xem video -> van thich / binh luan / ghim
      // (quet khong biet; commentAndPin tu kiem nen khong dang trung)
      let scanned = !v.tpl && Array.isArray(v.missing) && !v.unread
      let tpl = scanned ? ot.missingTemplate(base, v.missing, { watch: !prev }) : base
      try {
        // chua doc duoc trang Chi tiet (lan quet bi dung / loi): doc truoc roi chi lam muc con trong / con mac dinh, khong
        // ap ca mau len video (loi 0.7.3: video nguoi dung da toi uu tay bi ghi de 8 muc). Video vua dang (v.tpl) giu cach cu.
        if (!v.tpl && !scanned) {
          const r0 = await inspectVideo(page, v.id, base, { urls: ctx.urls, log: ctx.log, onStep, video: v })
          Object.assign(v, { missing: r0.missing, unread: false, title: r0.title || v.title })
          scanned = true
          tpl = ot.missingTemplate(base, r0.missing, { watch: !prev })
        }
        let r = { id: v.id, title: v.title, changed: [], warnings: [], saved: false }
        // chua quet (hang cho sau khi dang): van mo trang Chi tiet de lay tieu de hien tai cho binh luan
        if (ot.studioFields(tpl).length || !scanned) r = await optimizeVideo(page, v.id, tpl, { urls: ctx.urls, log: ctx.log, onStep, video: v, channelName: name })
        else if (scanned) ctx.log('info', `${v.title || v.id}: các mục trong Studio đã đủ theo mẫu, không làm lại.`)
        const warnings = [...r.warnings]
        const text = ot.renderComment(tpl.comment, { tieu_de: r.title || v.title, link: `https://youtu.be/${v.id}`, ten_kenh: name })
        let c = null
        // che do hien thi luc quet co the da cu (cong chieu / len lich xong -> cong khai): doc lai o trang Chi tiet
        let vis = r.visibility || ''
        if ((tpl.like || text) && !vis && !ot.canCommentVisibility(v.visibility)) vis = await videoVisibility(page, v.id, { urls: ctx.urls }).catch(() => '')
        vis = vis || v.visibility
        if (vis !== v.visibility) {
          ctx.log('info', `${r.title || v.title || v.id}: chế độ hiển thị giờ là "${vis}" (lúc quét: "${v.visibility || '?'}").`)
          setV(v.id, { visibility: vis })
          v.visibility = vis
        }
        if (tpl.like || text) {
          if (ot.canCommentVisibility(vis)) {
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
          } else warnings.push(`Video đang "${vis}" nên chưa thích / bình luận được. Tối ưu lại khi video đã công khai.`)
        }
        // viec muon lam o trang xem video ma CHUA kiem lai duoc (sau khi tai lai trang).
        // Kenh khong ghim duoc (menu khong co Ghim / bam Ghim khong an): khong tinh la thieu, chi ghi chu.
        // lan nay khong lam gi o trang xem video (da xong tu lan truoc): giu ket qua lan truoc (ca ghi chu "chua ghim")
        const kept = !c && prev ? prev : {}
        const cannotPin = c ? !!c.cannotPin : !!kept.cannotPin
        const liked = !!(c && c.liked) || (base.like && !tpl.like) // khong thich lai vi lan truoc da thich
        const note = cannotPin ? (c ? pinNote(liked, !!c.commented) : kept.note || pinNote(liked, !!kept.commented)) : ''
        const missing = [tpl.like && !(c && c.liked) && 'thích', text && !(c && c.commented) && 'bình luận', text && tpl.pin && !(c && c.pinned) && !cannotPin && 'ghim'].filter(Boolean)
        for (const w of warnings) if (!r.warnings.includes(w)) ctx.log('warn', `${r.title || v.title}: ${w}`)
        if (missing.length) {
          n.partial++
          ctx.log('warn', `${r.title || v.title}: chưa ${missing.join(', ')} được (đã kiểm lại trên trang xem video).`)
        }
        if (note) ctx.log('ok', `${r.title || v.title}: ${note} (kênh không ghim được) - tính là đã tối ưu.`)
        const did = c || { liked: !!kept.liked || liked, commented: !!kept.commented, pinned: !!kept.pinned }
        writeDb(ot.markOptimized(readDb(), key, v.id, { title: r.title, changed: r.changed, liked: !!did.liked, commented: !!did.commented, pinned: !!did.pinned, cannotPin, note, missing, warnings }))
        // khong quet lai: muc con thieu = muc quet thay thieu ma toi uu chua doi duoc (chi khi co canh bao Studio)
        const left = [...(r.warnings.length ? (v.missing || []).filter((k) => !r.changed.includes(k) && !WATCH.includes(k)) : []), ...missing]
        setV(v.id, { status: left.length ? 'new' : 'done', step: '', title: r.title || v.title, warnings, missing: left, unread: false, note })
        n.ok++
      } catch (e) {
        if (page.snapshot) await page.snapshot(`toi-uu-${v.id}`)
        if (e.code === 'verify') blocked = e.message
        setV(v.id, { status: ctx.stopped() ? 'new' : 'error', step: '', error: e.message })
        ctx.log(ctx.stopped() ? 'warn' : 'error', `${v.title || v.id}: ${e.message}`)
      }
    }
  }

  async function optimizeMany(key, todo, { reset = true } = {}) {
    const name = nameOf(key) === key ? '' : nameOf(key)
    const setV = (id, patch) => setIn(key, id, patch)
    if (reset) ctx.resetStop()
    S.busy = true
    for (const v of todo) setV(v.id, { status: 'run', step: 'Chờ', error: '' })
    ctx.log('info', `Bắt đầu tối ưu ${todo.length} video${name ? ` của kênh ${name}` : ''}.`)
    const n = { ok: 0, partial: 0 }
    try {
      await ctx.withChannel(key, (page) => optimizeOn(page, key, todo, n), { label: 'Tối ưu video' })
    } catch (e) {
      ctx.log('error', `Không tối ưu được: ${e.message}`)
      for (const v of todo) { const x = findV(key, v.id); if (x && x.status === 'run') setV(v.id, { status: 'error', step: '', error: e.message }) }
    } finally {
      S.busy = false
      saveScan()
      push()
      doneLog(n, todo.length)
    }
    return n.ok
  }
  const doneLog = ({ ok, partial }, total) => ctx.log(ok === total && !partial ? 'ok' : 'warn', `Xong: tối ưu được ${ok}/${total} video${partial ? `, ${partial} video chưa thích / bình luận / ghim được (xem cảnh báo)` : ''}.`)
  // "Quét và tối ưu": sau khi quet xong kenh, toi uu ngay cac video con thieu tren cung trang (khong mo lai kenh)
  async function optimizeScanned(page, key, vids, n) {
    const todo = vids.filter((v) => v.status === 'new' && !(v.unread && /Xác minh danh tính/.test(v.note || '')))
    if (!todo.length || ctx.stopped()) return 0
    for (const v of todo) setIn(key, v.id, { status: 'run', step: 'Chờ', error: '' })
    ctx.log('info', `Kênh ${nameOf(key)}: tối ưu luôn ${todo.length} video còn thiếu.`)
    await optimizeOn(page, key, todo, n)
    return todo.length
  }

  async function run({ channelKey, ids } = {}) {
    const key = String(channelKey || S.channelKey || '')
    if (!ready(key)) return
    if (key !== S.channelKey) { S.channelKey = key; refresh() }
    const want = (ids && ids.length ? ids : S.videos.filter((v) => v.status === 'new').map((v) => v.id))
    const todo = want.map((id) => findV(key, id) || { id, title: id, visibility: '', date: '' })
    if (!todo.length) return ctx.log('warn', 'Không có video nào cần tối ưu.')
    await optimizeMany(key, todo)
  }

  // Toi uu cac video chua toi uu cua lan quet toan bo (tung kenh mot). items: [{ channelKey, ids }] (bo trong = moi video con thieu)
  async function runAll({ items } = {}) {
    if (!ctx.withChannel) return ctx.log('warn', 'Chưa có tài khoản Google nào (trang Tài khoản).')
    if (S.busy) return ctx.log('warn', 'Đang tối ưu, đợi xong rồi thử lại.')
    syncAll()
    const plan = (Array.isArray(items) && items.length
      ? items.map((x) => [String(x.channelKey || ''), (x.ids || []).map((id) => findV(String(x.channelKey || ''), id)).filter(Boolean)])
      : S.all.groups.map((g) => [g.key, g.videos.filter((v) => v.status === 'new' || v.status === 'error')])).filter(([k, l]) => k && l.length)
    if (!plan.length) return ctx.log('warn', 'Không có video nào cần tối ưu.')
    ctx.resetStop()
    ctx.log('info', `Tối ưu ${plan.reduce((n, [, l]) => n + l.length, 0)} video của ${plan.length} kênh (chỉ các mục còn thiếu).`)
    for (const [key, todo] of plan) {
      if (ctx.stopped()) break
      await optimizeMany(key, todo, { reset: false })
    }
  }

  // ---- tu toi uu sau khi dang ----
  // main.js goi ctx.afterUpload sau moi video dang xong voi mau `tpl` (src/optimize-template.js afterUploadTemplate):
  // hop thoai tai len da dat cac muc cua mau Studio, nen chi con thich / binh luan / ghim (preset.optimizeAfterUpload)
  // va cac muc chua dat duoc trong hop thoai. Video duoc xep hang cho toi khi qua gio dang + 15 phut (cho YouTube xu ly).
  // Toi gio roi van CHI tu chay khi tool ranh han (ctx.busyReason, src/idle.js): khong chen ngang dang video, dang bai,
  // Cong dong... va nguoi dung khong thao tac 5 phut. Chua ranh thi de lan kiem sau (moi phut), video van o hang cho.
  // Cong tac settings.optimizeAuto (trang Toi uu video; mac dinh bat = theo "Tự tối ưu sau khi đăng" cua mau):
  // tat thi khong tu chay; video moi dang van duoc xep hang de nguoi dung bam "Chạy ngay" / "Bỏ khỏi hàng chờ".
  const pendingFile = () => ctx.logFile('optimize-pending.json')
  const readPending = () => { try { return JSON.parse(fs.readFileSync(pendingFile(), 'utf8')) } catch (_) { return [] } }
  const writePending = (list) => { fs.writeFileSync(pendingFile(), JSON.stringify(list, null, 1)); syncPending() }
  const AFTER_MS = 15 * 60e3
  const CHECK_MS = 60e3 // kiem hang cho moi phut (chi chay khi toi gio va tool ranh)
  const autoOn = () => !ctx.store || ctx.store.settings.optimizeAuto !== false
  const presetName = (id) => { const p = id && ((ctx.store && ctx.store.settings.presets) || []).find((q) => q.id === id); return p ? p.name || '' : '' }
  const when = (ms) => new Date(ms).toLocaleString('vi-VN')
  function syncPending() {
    S.auto = autoOn()
    S.pending = readPending().map((x) => ({ id: x.id, title: x.title || x.id, channelKey: x.channelKey, channelName: nameOf(x.channelKey), due: new Date(x.due || 0).toISOString(), preset: presetName(x.presetId) }))
  }
  ctx.afterUpload = ({ videoId, title, publishAt, tpl, presetId, channelId } = {}) => {
    if (!tpl || !videoId || !channelId) return
    try { // khong bao gio lam hong buoc dang video
      const due = Math.max(Date.now(), (publishAt && Date.parse(publishAt)) || 0) + AFTER_MS
      const entry = { channelKey: channelId, id: videoId, title: title || videoId, due, presetId: presetId || '', tpl: ot.normalizeTemplate(tpl) }
      writePending(readPending().filter((x) => x.id !== videoId).concat([entry]))
      ctx.log('info', autoOn()
        ? `Đã xếp "${title || videoId}" vào hàng chờ tự tối ưu (từ ${when(due)}, khi tool rảnh).`
        : `Đã xếp "${title || videoId}" vào hàng chờ tự tối ưu. Tự tối ưu đang tắt: bấm "Chạy ngay" ở trang Tối ưu video khi muốn tối ưu.`)
      push()
    } catch (e) { ctx.log('warn', `Không xếp được video vào hàng chờ tối ưu: ${e.message}`) }
  }
  // Mau cho video trong hang cho: tpl luc dang, cac muc cua no lay gia tri moi nhat cua preset (nguoi dung co the
  // da sua preset sau khi dang); khong co tpl (hang cho rat cu) -> null (mau cua kenh).
  function pendingTemplate(x) {
    if (!x.tpl) return null
    const ps = (ctx.store && ctx.store.settings.presets) || []
    const p = x.presetId && ps.find((q) => q.id === x.presetId)
    return ot.refreshPending(x.tpl, p && p.optimize)
  }
  // bo `batch` (cung kenh) khoi hang cho roi toi uu: loi thi video van hien trong trang Toi uu video de chay lai
  function runBatch(key, batch, why, opts) {
    writePending(readPending().filter((x) => !batch.some((b) => b.id === x.id)))
    ctx.log('info', why)
    return optimizeMany(key, batch.map((x) => ({ id: x.id, title: x.title, visibility: '', date: '', tpl: pendingTemplate(x) })), opts)
  }
  let waitLogged = '' // da ghi nhat ky "chua ranh" cho dot cho nay (moi dot ghi mot lan)
  const setWait = (text) => { if (S.pendingWait !== text) { S.pendingWait = text; push() } }
  // Lan kiem tu dong (moi phut). Tra ve so video da toi uu (0 = khong chay).
  async function processPending(now = Date.now()) {
    if (S.busy || !ctx.withChannel) return 0
    const due = readPending().filter((x) => x.due <= now)
    if (!due.length) { waitLogged = ''; setWait(''); return 0 }
    if (!autoOn()) { setWait('Tự tối ưu đang tắt: video đã tới giờ vẫn nằm trong hàng chờ, bấm "Chạy ngay" để tối ưu.'); return 0 }
    const reason = ctx.busyReason ? ctx.busyReason() : ''
    if (reason) {
      setWait(`Đã tới giờ, chờ tool rảnh: ${reason}.`)
      if (!waitLogged) ctx.log('info', `Hàng chờ tự tối ưu: ${due.length} video đã tới giờ nhưng chưa chạy vì ${reason}. Tool tự chạy khi rảnh hẳn.`)
      waitLogged = reason
      return 0
    }
    waitLogged = ''
    setWait('')
    const key = due[0].channelKey
    const batch = due.filter((x) => x.channelKey === key)
    const names = [...new Set(batch.map((x) => presetName(x.presetId)).filter(Boolean))]
    const from = names.length ? `mẫu ${names.map((n) => `"${n}"`).join(', ')}` : 'mẫu đăng video'
    return runBatch(key, batch, `Tự tối ưu ${batch.length} video vừa đăng (theo "Tự tối ưu sau khi đăng" của ${from}; tắt ở trang Tối ưu video).`)
  }
  // "Chạy ngay" (nguoi dung bam): khong doi toi gio / tool ranh, ke ca khi dang tat tu toi uu. ids trong = ca hang cho
  async function runPendingNow({ ids } = {}) {
    if (!ctx.withChannel) return ctx.log('warn', 'Chưa có tài khoản Google nào (trang Tài khoản).')
    if (S.busy) return ctx.log('warn', 'Đang tối ưu, đợi xong rồi thử lại.')
    const want = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null
    const list = readPending().filter((x) => !want || want.has(x.id))
    if (!list.length) return ctx.log('warn', 'Hàng chờ tự tối ưu không có video cần chạy.')
    ctx.resetStop()
    for (const key of [...new Set(list.map((x) => x.channelKey))]) {
      if (ctx.stopped()) break
      const batch = list.filter((x) => x.channelKey === key)
      await runBatch(key, batch, `Tối ưu ngay ${batch.length} video trong hàng chờ tự tối ưu (bạn bấm "Chạy ngay").`, { reset: false })
    }
  }
  function removePending({ id } = {}) {
    const all = readPending()
    const x = all.find((p) => p.id === String(id || ''))
    if (!x) return
    writePending(all.filter((p) => p !== x))
    ctx.log('info', `Đã bỏ "${x.title || x.id}" khỏi hàng chờ tự tối ưu (video không bị tối ưu tự động nữa).`)
    push()
  }
  function setAuto(on) {
    on = on !== false
    if (ctx.store) ctx.store.save({ optimizeAuto: on })
    if (ctx.refreshSettings) ctx.refreshSettings()
    waitLogged = ''
    S.pendingWait = ''
    syncPending()
    ctx.log('info', on
      ? 'Đã bật tự tối ưu video sau khi đăng (theo mẫu đăng video): video trong hàng chờ tự chạy khi tới giờ và tool rảnh.'
      : 'Đã tắt tự tối ưu video sau khi đăng: tool không tự chạy nữa; hàng chờ vẫn giữ, bấm "Chạy ngay" khi muốn tối ưu.')
    push()
  }

  function saveTemplate({ channelKey, template } = {}) {
    const key = channelKey || 'default'
    const next = ot.setTemplate(templates(), key, template === null ? null : template || {})
    ctx.store.save({ optimizeTemplates: next })
    ctx.refreshSettings()
    S.templates = next
    ctx.log('ok', template === null ? 'Kênh này dùng lại mẫu tối ưu mặc định.' : key === 'default' ? 'Đã lưu mẫu tối ưu mặc định.' : `Đã lưu mẫu tối ưu cho kênh ${nameOf(key)}.`)
  }

  // Bam tieu de video: mo trang chinh sua video trong khung Studio cua trang Tai khoan, dung kenh
  async function openVideo({ channelKey, id } = {}) {
    const key = String(channelKey || S.channelKey || '')
    if (!/^[\w-]{6,}$/.test(String(id || ''))) return ctx.log('warn', 'Không rõ video cần mở.')
    if (!ctx.accounts || !ctx.accounts.openUrl) return ctx.log('warn', 'Chưa có tài khoản Google nào (trang Tài khoản).')
    await ctx.accounts.openUrl({ channelKey: key, url: `${ctx.urls.studio}/video/${id}/edit` })
  }

  return {
    commands: {
      optimize_open: () => refresh(),
      optimize_select: (key) => { if (!S.busy) { S.channelKey = String(key || ''); refresh() } },
      optimize_list: (p) => list(p),
      optimize_scan_all: (p) => scanAll(p || {}),
      optimize_rescan: (p) => rescan(p || {}),
      optimize_limit: (n) => setLimit(n),
      optimize_open_video: (p) => openVideo(p || {}),
      optimize_run: (p) => run(p || {}),
      optimize_run_all: (p) => runAll(p || {}),
      optimize_template_save: (p) => saveTemplate(p || {}),
      optimize_auto: (on) => setAuto(on),
      optimize_pending_run: (p) => runPendingNow(p || {}),
      optimize_pending_remove: (p) => removePending(p || {}),
    },
    start() {
      refresh()
      setInterval(() => processPending().catch((e) => ctx.log('error', `Tự tối ưu: ${e.message}`)), CHECK_MS)
    },
    processPending, // cho bai kiem
  }
}
