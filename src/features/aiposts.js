// Trang "Đăng bài tự động": Gemini viet bai Cong dong cho tung kenh (chu, anh, tham do, cau do, tham do anh),
// chia vao cac ngay / gio da chon roi dang (len lich bang chinh bang "Lên lịch đăng bài" cua YouTube, nen tool khong
// can mo luc toi gio). Nguoi dung chon: kenh, loai bai, so bai, ngay, gio, yeu cau rieng tung kenh (prompt), nguon anh.
// Ban nhap luu o ai-posts.json (mo lai tool van con); lich su bai da dang o ai-posts-history.json (Gemini tranh lap lai).
const fs = require('fs')
const path = require('path')
const AI = require('../ai-posts')
const { createPost } = require('../flows/post')
const { channelOf } = require('../studio/driver')

const DEFAULTS = {
  channels: [], types: ['text', 'image', 'poll', 'quiz'], count: 7, days: 7, from: '', to: '', times: '09:00, 20:00',
  language: 'en', hashtags: true, emoji: true, imageSource: 'gemini', imageModel: AI.IMAGE_MODELS[0][0], imageStyle: '', imageFolder: '', style: '',
  review: true, perChannel: {},
}
const MAX_HISTORY = 60

module.exports = (ctx) => {
  const S = ctx.state.f.aiposts = { busy: '', progress: '', drafts: [], warnings: [], imageModels: AI.IMAGE_MODELS, langs: Object.entries(AI.LANGS), channels: [], opts: { ...DEFAULTS } }
  const draftsFile = () => ctx.logFile('ai-posts.json')
  const historyFile = () => ctx.logFile('ai-posts-history.json')
  const imgDir = () => ctx.logFile(path.join('ai-posts', 'anh'))
  const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (_) { return fb } }
  const writeJson = (f, v) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)) } catch (e) { ctx.log('warn', `Không lưu được ${path.basename(f)}: ${e.message}`) } }
  const saveDrafts = () => writeJson(draftsFile(), S.drafts)
  const opts = () => {
    const o = { ...DEFAULTS, ...(ctx.store.settings.aiPosts || {}) }
    o.perChannel = { ...(o.perChannel || {}) }
    return o
  }
  const channels = () => (ctx.accounts ? ctx.accounts.channels() : [])
  const syncChannels = () => {
    const list = channels().map((c) => ({ key: c.key, name: c.name, handle: c.handle || '', ucId: c.ucId || '', avatar: c.avatar || '' }))
    if (JSON.stringify(list) !== JSON.stringify(S.channels)) { S.channels = list; ctx.push() }
  }
  const push = () => { saveDrafts(); ctx.push() }
  let seq = Date.now()
  const newId = () => `ai${(seq++).toString(36)}`
  const fileUrl = (f) => (f ? require('url').pathToFileURL(f).href : '')
  const withUrls = (d) => ({ ...d, imageUrls: (d.images || []).map(fileUrl), options: (d.options || []).map((o) => ({ ...o, imageUrl: fileUrl(o.image) })) })
  const setDraft = (id, patch) => {
    const i = S.drafts.findIndex((d) => d.id === id)
    if (i < 0) return null
    S.drafts[i] = withUrls({ ...S.drafts[i], ...patch })
    return S.drafts[i]
  }

  // ---- lich su: bai da dang + anh trong thu muc da dung (theo kenh) ----
  const history = () => readJson(historyFile(), {})
  function remember(key, d) {
    const h = history()
    const c = h[key] || { posts: [], images: [] }
    c.posts = [{ at: new Date().toISOString(), type: d.type, text: d.text }, ...(c.posts || [])].slice(0, MAX_HISTORY)
    c.images = [...new Set([...(c.images || []), ...(d.folderImages || [])])].slice(-2000)
    h[key] = c
    writeJson(historyFile(), h)
  }
  // video gan day cua kenh (lan quet o trang Toi uu video) de Gemini nhac toi chu de that
  function recentVideos(key) {
    const scan = readJson(ctx.logFile('optimize-scan.json'), {})
    const c = scan.channels && scan.channels[key]
    return c && Array.isArray(c.videos) ? c.videos.map((v) => v && v.title).filter(Boolean).slice(0, 8) : []
  }

  // ---- anh cho mot ban nhap (Gemini tao hoac lay trong thu muc). Loi -> bai ha cap (anh -> chu, tham do anh -> tham do) ----
  async function addImages(d, o, ch) {
    const pc = o.perChannel[ch.key] || {}
    const need = d.type === 'image' ? [d.imagePrompt || d.text] : d.type === 'image_poll' ? d.options.map((x) => x.imagePrompt || x.text) : []
    if (!need.length) return d
    const downgrade = (why) => {
      const warnings = [...(d.warnings || []), why]
      if (d.type === 'image') return { ...d, type: 'text', images: [], warnings }
      return { ...d, type: 'poll', options: d.options.map((x) => ({ text: x.text.slice(0, AI.LIMITS.poll.len), image: '' })), warnings }
    }
    try {
      let files
      if (o.imageSource === 'none') return downgrade('Đã chọn "Không dùng ảnh": đăng thành bài không ảnh.')
      if (o.imageSource === 'folder') {
        const used = new Set([...(history()[ch.key] || {}).images || [], ...S.drafts.filter((x) => x.channelKey === ch.key).flatMap((x) => x.folderImages || [])])
        const r = AI.pickFolderImages(pc.imageFolder || o.imageFolder, need.length, used)
        files = r.files
        d = { ...d, folderImages: files }
        if (r.reused) d.warnings = [...(d.warnings || []), 'Thư mục ảnh đã hết ảnh mới: dùng lại ảnh cũ.']
      } else {
        fs.mkdirSync(imgDir(), { recursive: true })
        files = []
        for (const [i, desc] of need.entries()) {
          S.progress = `Gemini đang vẽ ảnh ${i + 1}/${need.length} cho kênh "${ch.name}"…`
          ctx.push()
          const img = await AI.geminiImage({ key: ctx.store.getSecret('gemini'), model: o.imageModel, prompt: AI.imagePrompt(desc, pc.imageStyle || o.imageStyle) })
          const f = path.join(imgDir(), `${d.id}-${i + 1}${img.ext}`)
          fs.writeFileSync(f, img.data)
          files.push(f)
        }
      }
      if (d.type === 'image') return { ...d, images: files }
      return { ...d, options: d.options.map((x, i) => ({ ...x, image: files[i] || '' })) }
    } catch (e) {
      ctx.log('warn', `Kênh "${ch.name}": chưa có ảnh cho bài ${AI.TYPE_LABEL[d.type]} (${e.message}).`)
      return downgrade(`Chưa có ảnh (${e.message}): đăng thành bài ${d.type === 'image' ? 'chữ' : 'thăm dò chữ'}.`)
    }
  }

  // Gemini viet `slots` bai cho kenh ch -> ban nhap (co anh)
  async function writeFor(ch, slots, o) {
    const pc = o.perChannel[ch.key] || {}
    const h = history()[ch.key] || {}
    const recent = [...(h.posts || []).map((p) => p.text), ...S.drafts.filter((x) => x.channelKey === ch.key).map((x) => x.text)]
    const types = slots.map((s) => s.type)
    const prompt = AI.postsPrompt({
      channel: ch, request: pc.request || '', style: o.style, language: pc.language || o.language, types, recent,
      hashtags: o.hashtags, emoji: o.emoji, videos: recentVideos(ch.key), when: slots.map((s) => AI.ymd(new Date(s.when))),
    })
    S.progress = `Gemini đang viết ${slots.length} bài cho kênh "${ch.name}"…`
    ctx.push()
    let posts
    for (let attempt = 0; ; attempt++) {
      try {
        posts = AI.parsePosts(await ctx.gemini({ prompt, json: true }), types)
        break
      } catch (e) {
        if (attempt >= 1 || /API key|hạn mức|model/i.test(e.message)) throw e
        ctx.log('warn', `Kênh "${ch.name}": ${e.message} Thử lại một lần.`)
      }
    }
    const out = []
    for (const [i, p] of posts.entries()) {
      if (ctx.stopped()) break
      if (!p) { ctx.log('warn', `Kênh "${ch.name}": Gemini bỏ trống bài ${i + 1} (${AI.TYPE_LABEL[types[i]]}).`); continue }
      let d = { id: newId(), channelKey: ch.key, channelName: ch.name, when: slots[i].when, origType: types[i], status: 'draft', error: '', url: '', line: '', images: [], options: [], answers: [], explanation: '', ...p }
      d = await addImages(d, o, ch)
      S.drafts.push(withUrls(d))
      push()
      out.push(d)
    }
    return out
  }

  // khoang ngay: bo trong / da qua -> hom nay; "den ngay" bo trong -> 7 ngay ke tu "tu ngay" (giong giao dien)
  function range(o) {
    const today = AI.ymd(new Date())
    const from = o.from && o.from >= today ? o.from : today
    const [y, m, d] = from.split('-').map(Number)
    const to = o.to && o.to >= from ? o.to : AI.ymd(new Date(y, m - 1, d + 6))
    return { from, to }
  }

  async function generate({ post = false } = {}) {
    if (S.busy) return ctx.log('warn', 'Đang làm việc khác ở trang Đăng bài tự động, chờ xong đã.')
    if (!ctx.store.getSecret('gemini')) return ctx.log('warn', 'Chưa nhập Gemini API key (Cài đặt).')
    const o = opts()
    const list = channels().filter((c) => o.channels.includes(c.key))
    if (!list.length) return ctx.log('warn', 'Chọn ít nhất một kênh để Gemini viết bài.')
    if (!ctx.isBusy()) ctx.resetStop()
    S.busy = 'generate'
    S.warnings = []
    const made = []
    try {
      for (const ch of list) {
        if (ctx.stopped()) break
        // tiep noi loai bai sau ban nhap cu cua kenh (xoay vong deu)
        const prev = S.drafts.filter((d) => d.channelKey === ch.key && d.status !== 'done').length
        const { slots, warnings } = AI.planSlots({ count: o.count, ...range(o), times: o.times, types: (o.perChannel[ch.key] || {}).types || o.types, startIndex: prev })
        for (const w of warnings) { S.warnings.push(`${ch.name}: ${w}`); ctx.log('warn', `Kênh "${ch.name}": ${w}`) }
        if (!slots.length) continue
        try {
          const ds = await writeFor(ch, slots, o)
          made.push(...ds)
          ctx.log('ok', `Gemini đã viết ${ds.length} bài cho kênh "${ch.name}".`)
        } catch (e) {
          S.warnings.push(`${ch.name}: ${e.message}`)
          ctx.log('error', `Kênh "${ch.name}": Gemini chưa viết được bài: ${e.message}`)
        }
      }
    } finally {
      S.busy = ''
      S.progress = ''
      push()
    }
    if (post && made.length && !ctx.stopped()) await run({ ids: made.map((d) => d.id) })
  }

  // Dang (hoac len lich) cac ban nhap, lan luot; moi bai mot lan withChannel
  async function run({ ids = [] } = {}) {
    if (S.busy) return ctx.log('warn', 'Đang làm việc khác ở trang Đăng bài tự động, chờ xong đã.')
    if (!ctx.withChannel) return ctx.log('error', 'Chưa có tài khoản Google nào (trang Tài khoản).')
    const list = S.drafts.filter((d) => ids.includes(d.id) && d.status !== 'done')
    if (!list.length) return ctx.log('warn', 'Chưa chọn bài nào để đăng.')
    if (!ctx.isBusy()) ctx.resetStop()
    S.busy = 'post'
    for (const d of list) setDraft(d.id, { status: 'queued', error: '' })
    push()
    let ok = 0
    try {
      for (const d0 of list) {
        if (ctx.stopped()) { setDraft(d0.id, { status: 'draft' }); continue }
        const d = S.drafts.find((x) => x.id === d0.id)
        if (!d) continue
        const ch = channels().find((c) => c.key === d.channelKey)
        if (!ch) { setDraft(d.id, { status: 'error', error: 'Kênh không còn ở trang Tài khoản (đã bỏ tick?).' }); continue }
        // gio da qua (ban nhap cu) -> dang ngay
        const when = d.when && new Date(d.when).getTime() > Date.now() + 5 * 60e3 ? d.when : null
        setDraft(d.id, { status: 'run', step: 'open' })
        S.progress = `Đang ${when ? 'lên lịch' : 'đăng'} bài ${ok + 1}/${list.length} lên kênh "${ch.name}"…`
        push()
        try {
          const r = await ctx.withChannel(ch.key, (page) => createPost(page, {
            type: d.type, text: d.text, images: d.images || [], options: (d.options || []).map((x) => ({ text: x.text, image: x.image || '' })),
            answers: d.answers || [], explanation: d.explanation || '', video: '', when,
            channel: { ucId: channelOf(page.url()) || ch.ucId, handle: ch.handle, name: ch.name },
          }, {
            urls: ctx.urls,
            log: (level, msg) => ctx.log(level, `Bài Gemini (${ch.name}): ${msg}`),
            onStep: (step) => { setDraft(d.id, { step }); ctx.push() },
          }), { label: `dang-bai-ai-${ch.name}`, shouldStop: () => ctx.stopped() })
          setDraft(d.id, { status: 'done', step: '', url: r.url || '', line: r.line || '', result: r.status })
          remember(ch.key, d)
          ok++
          ctx.log('ok', `Kênh "${ch.name}": ${r.status === 'scheduled' ? `đã lên lịch bài ${AI.TYPE_LABEL[d.type]}${r.line ? ` (${r.line})` : ''}` : r.status === 'duplicate' ? 'bài đã có sẵn trên kênh, không đăng lại' : `đã đăng bài ${AI.TYPE_LABEL[d.type]}`}${r.url ? ` ${r.url}` : ''}.`)
        } catch (e) {
          setDraft(d.id, { status: ctx.stopped() ? 'draft' : 'error', step: '', error: e.message })
          ctx.log('error', `Kênh "${ch.name}": chưa đăng được bài ${AI.TYPE_LABEL[d.type]}: ${e.message}`)
        }
        push()
      }
    } finally {
      S.busy = ''
      S.progress = ''
      ctx.log(ok === list.length ? 'ok' : 'warn', `Đăng bài tự động: xong ${ok}/${list.length} bài.`)
      push()
    }
  }

  const commands = {
    // patch cai dat (perChannel: { key: { request, imageStyle, imageFolder, language, types } } gop theo kenh)
    aipost_save: (patch = {}) => {
      const o = opts()
      const next = { ...o, ...patch }
      if (patch.perChannel) {
        next.perChannel = { ...o.perChannel }
        for (const [k, v] of Object.entries(patch.perChannel)) next.perChannel[k] = { ...(o.perChannel[k] || {}), ...(v || {}) }
      }
      if (patch.count !== undefined) next.count = Math.max(1, Math.min(60, Math.floor(Number(patch.count) || 1)))
      ctx.store.save({ aiPosts: next })
      ctx.refreshSettings()
      S.opts = opts()
      ctx.push()
    },
    aipost_generate: (p = {}) => generate(p),
    aipost_run: (p = {}) => run(p),
    aipost_update: ({ id, patch = {} } = {}) => {
      const d = S.drafts.find((x) => x.id === id)
      if (!d || ['run', 'queued', 'done'].includes(d.status)) return
      const keep = {}
      if (typeof patch.text === 'string') keep.text = patch.text.slice(0, AI.LIMITS.text)
      if (typeof patch.when === 'string' || patch.when === null) keep.when = patch.when
      if (Array.isArray(patch.options)) keep.options = d.options.map((o, i) => ({ ...o, text: String(patch.options[i] ?? o.text).slice(0, d.type === 'image_poll' ? AI.LIMITS.imagePoll.len : AI.LIMITS.poll.len) }))
      if (Array.isArray(patch.answers)) keep.answers = d.answers.map((a, i) => ({ ...a, text: String((patch.answers[i] && patch.answers[i].text) ?? a.text).slice(0, AI.LIMITS.quiz.len), correct: patch.answers[i] ? !!patch.answers[i].correct : a.correct }))
      if (typeof patch.explanation === 'string') keep.explanation = patch.explanation.slice(0, AI.LIMITS.quiz.explain)
      setDraft(id, { ...keep, status: d.status === 'error' ? 'draft' : d.status, error: '' })
      push()
    },
    // viet lai mot bai (cung kenh, cung loai, cung gio)
    aipost_regen: async ({ id } = {}) => {
      if (S.busy) return
      const d = S.drafts.find((x) => x.id === id)
      const ch = d && channels().find((c) => c.key === d.channelKey)
      if (!d || !ch || d.status === 'done') return
      S.busy = 'generate'
      const i = S.drafts.indexOf(d)
      S.drafts.splice(i, 1)
      try {
        const [nd] = await writeFor(ch, [{ when: d.when, type: d.origType || d.type }], opts())
        if (!nd) throw new Error('Gemini không trả về bài nào.')
        const j = S.drafts.findIndex((x) => x.id === nd.id)
        const [moved] = S.drafts.splice(j, 1)
        S.drafts.splice(i, 0, moved)
        ctx.log('ok', `Gemini đã viết lại bài cho kênh "${ch.name}".`)
      } catch (e) {
        if (!S.drafts.includes(d)) S.drafts.splice(i, 0, d)
        ctx.log('error', `Chưa viết lại được bài: ${e.message}`)
      } finally {
        S.busy = ''
        S.progress = ''
        push()
      }
    },
    aipost_remove: ({ ids = [] } = {}) => {
      S.drafts = S.drafts.filter((d) => !ids.includes(d.id) || ['run', 'queued'].includes(d.status))
      push()
    },
    // xoa cac bai da dang xong khoi danh sach
    aipost_clear_done: () => { S.drafts = S.drafts.filter((d) => d.status !== 'done'); push() },
    aipost_pick_folder: async ({ channelKey } = {}) => {
      const folder = ctx.pickFolder ? await ctx.pickFolder('Chọn thư mục ảnh cho bài đăng của kênh') : ''
      if (!folder) return
      if (channelKey) commands.aipost_save({ perChannel: { [channelKey]: { imageFolder: folder } } })
      else commands.aipost_save({ imageFolder: folder })
    },
  }

  return {
    commands,
    start() {
      S.drafts = (readJson(draftsFile(), []) || []).filter((d) => d && d.id).map((d) => withUrls({ ...d, status: ['run', 'queued'].includes(d.status) ? 'draft' : d.status }))
      S.opts = opts()
      syncChannels()
      setInterval(syncChannels, 3000).unref()
      ctx.push()
    },
  }
}
