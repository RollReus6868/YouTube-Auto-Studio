// Trang "Cộng đồng": tra loi binh luan cua nguoi xem qua hop thu Studio (Cong dong → Binh luan),
// gom ca binh luan duoi video, Shorts va bai dang. Lan luot qua cac kenh da chon (ctx.withChannel),
// Gemini soan nhap, nguoi dung duyet hoac tool tu gui loi khen ngan; chung hang doi CommentDesk
// (va gioi han moi gio) voi trang "Bình luận" (API).
const { replyPrompt, parseReply } = require('../google')
const { CommentDesk } = require('../comments')
const { channelOf, sleep } = require('../studio/driver')
const flow = require('../flows/inbox')

const POLL_MS = Number(process.env.YA_INBOX_POLL_MS || process.env.YA_COMMENT_POLL_MS) || 10 * 60e3
const MAX_READ = Number(process.env.YA_INBOX_MAX) || 60 // binh luan doc moi kenh moi luot
const DRAFTS_PER_ROUND = 60
const DRAFT_PARALLEL = 4 // Gemini soan cung luc
// cach nhau 2–5 giay giua hai lan gui trong cung mot luot (nguoi dung muon nhanh; van khong gui don dap)
const gap = () => (process.env.YA_INBOX_GAP_MS !== undefined ? Number(process.env.YA_INBOX_GAP_MS) : 2e3 + Math.random() * 3e3)
const ACCOUNTS_MISSING = 'Chưa có tài khoản Google nào (trang Tài khoản).'
const STOPPED = /Đã dừng theo yêu cầu/

module.exports = (ctx) => {
  const S = ctx.state.f.inbox = { channels: [], options: [], busy: false, current: '', at: '', items: [], sentLastHour: 0, sending: 0, paused: false }
  // nut Dung: tang gen -> moi viec bat dau truoc do (dang chay / dang xep hang) dung ngay o buoc dang cho;
  // paused: khong tu lay binh luan moi 10 phut nua cho toi khi nguoi dung bam "Lay binh luan moi"
  let gen = 0
  const halted = (g) => g !== gen
  const settings = () => ctx.store.settings
  const desk = () => ctx.desk

  // ---- trang thai gui giao dien ---------------------------------------------------------
  // Kenh dang tick tren trang Cong dong VA con tick o trang Tai khoan. Kenh da bo tick o mot trong hai noi:
  // khong doc hop thu, khong tu gui, khong "Gui het", khong hien binh luan cua kenh do.
  function selected() {
    const enabled = new Set(ctx.accounts ? ctx.accounts.channels().map((c) => c.key) : [])
    // khoa '<tai khoan>:<ten>' doi thanh UC ID khi da biet -> doi theo
    const keys = (settings().inboxChannels || []).map((k) => {
      const ch = ctx.accounts && ctx.accounts.find(k)
      return ch ? ch.key : k
    })
    return [...new Set(keys)].filter((k) => enabled.has(k))
  }
  // binh luan thuoc kenh dang chon? (khoa cu '<tai khoan>:<ten>' cua binh luan doi theo UC ID)
  function chosen(item, sel = new Set(selected())) {
    const ch = item && item.channelKey && ctx.accounts && ctx.accounts.find(item.channelKey)
    return !!ch && sel.has(ch.key)
  }

  function refresh() {
    S.paused = !!settings().inboxPaused
    S.options = ctx.accounts ? ctx.accounts.channels().map((c) => ({ key: c.key, name: c.name, handle: c.handle, accountId: c.accountId })) : []
    S.channels = selected()
    const d = desk()
    if (d) {
      const sel = new Set(S.channels)
      S.items = d.items.filter((x) => x.source === 'studio' && chosen(x, sel)).slice(0, 200)
      S.sentLastHour = d.sentLastHour()
      ctx.state.comments.sentLastHour = S.sentLastHour // gioi han chung voi trang Binh luan
    }
    ctx.push()
  }

  // ---- doc hop thu ------------------------------------------------------------------------
  // Hang Studio -> dang ket qua API cho CommentDesk.merge (bo binh luan cua chinh kenh / da tra loi).
  function mergeRows(rows, ch) {
    const own = (ch.handle || '').toLowerCase()
    const list = rows.map((r) => ({
      commentId: r.id, videoId: '', videoTitle: r.contentTitle, author: r.author, text: r.text,
      publishedAt: r.publishedAt || new Date().toISOString(), likeCount: 0,
      authorChannelId: own && r.author.toLowerCase() === own ? 'self' : '', ownerReplied: r.ownerReplied,
      extra: { contentType: r.contentType, ago: r.ago },
    }))
    const d = desk()
    // da co trong hang doi nhung nay thay kenh da tra loi (vd tra loi tay tren YouTube) -> thoi
    for (const r of rows) {
      const it = d.get(r.id)
      if (r.ownerReplied && it && ['new', 'ready', 'error'].includes(it.status)) d.update(r.id, { status: 'skipped', note: 'Kênh đã trả lời trên YouTube' })
    }
    return d.merge(list, { channelId: 'self', skipWords: settings().skipWords, extra: { source: 'studio', channelKey: ch.key, channelName: ch.name } })
  }

  async function draft(item) {
    const s = settings()
    const p = replyPrompt({ style: s.replyStyle, channel: item.channelName || s.channel, videoTitle: item.videoTitle, author: item.author, text: item.text })
    const r = parseReply(await ctx.gemini({ system: p.system, prompt: p.prompt, json: true }))
    if (r.kind === 'spam' || !r.reply) return desk().update(item.id, { status: 'skipped', kind: r.kind, draft: '', note: 'Gemini đánh giá là spam' })
    return desk().update(item.id, { status: 'ready', kind: r.kind, draft: r.reply, error: '' })
  }

  // ---- gui tra loi: moi kenh mot lan mo hop thu, gui lien tiep (tim lai hang, kiem kenh, khong gui hai lan) ----
  // list: [{ item, text }] cung mot kenh. Chay trong page da o dung kenh (trong withChannel). Tra ve so da gui.
  async function sendOn(page, ch, list, g) {
    let sent = 0
    let opened = false
    for (const { item, text } of list) {
      if (halted(g)) break
      const it = desk().get(item.id) || item
      if (it.status === 'sent') continue
      if (!desk().canSend(settings().replyPerHour)) {
        ctx.log('warn', `Đã gửi đủ ${settings().replyPerHour} trả lời trong 1 giờ qua (giới hạn trong Cài đặt). Thử lại sau.`)
        break
      }
      try {
        if (!opened) { await flow.openInbox(page, channelOf(page.url()), { urls: ctx.urls, log: ctx.log }); opened = true }
        else await sleep(gap())
        if (halted(g)) break
        // uc = kenh cua binh luan (khong lay tu trang): Studio lech sang kenh khac thi reply() khong gui
        const r = await flow.reply(page, { id: it.id, author: it.author }, text, { uc: ch.ucId || channelOf(page.url()), handle: ch.handle, urls: ctx.urls, log: ctx.log })
        if (r.status === 'already') desk().update(it.id, { status: 'skipped', note: 'Kênh đã trả lời bình luận này rồi' })
        else { desk().markSent(it.id, text); sent++ }
      } catch (e) {
        if (halted(g) || STOPPED.test(e.message)) break
        desk().update(it.id, { status: 'error', error: e.message })
        ctx.log('error', `Không gửi được trả lời cho ${it.author} (${it.channelName}): ${e.message}`)
      } finally {
        S.sending = Math.max(0, S.sending - 1)
        refresh()
      }
    }
    return sent
  }

  // list: [{ item, text }] (nhieu kenh) -> gom theo kenh, moi kenh mot lan chuyen kenh
  async function sendMany(list) {
    if (!ctx.withChannel) { ctx.log('warn', ACCOUNTS_MISSING); return 0 }
    list = list.map((x) => ({ item: x.item, text: String(x.text || '').trim().replace(/[<>]/g, '') })).filter((x) => x.item && x.text && x.item.status !== 'sent')
    const off = list.filter((x) => !chosen(x.item))
    if (off.length) {
      ctx.log('warn', `Không gửi ${off.length} trả lời của kênh đã bỏ tick (${[...new Set(off.map((x) => x.item.channelName))].join(', ')}).`)
      list = list.filter((x) => chosen(x.item))
    }
    if (!list.length) return 0
    if (!desk().canSend(settings().replyPerHour)) {
      ctx.log('warn', `Đã gửi đủ ${settings().replyPerHour} trả lời trong 1 giờ qua (giới hạn trong Cài đặt). Thử lại sau.`)
      return 0
    }
    const g = gen
    const groups = new Map()
    for (const x of list) groups.set(x.item.channelKey, [...(groups.get(x.item.channelKey) || []), x])
    S.sending += list.length
    refresh()
    let sent = 0
    for (const [key, part] of groups) {
      const ch = ctx.accounts && ctx.accounts.find(key)
      const left = () => part.filter((x) => (desk().get(x.item.id) || {}).status !== 'sent')
      if (!ch || halted(g)) {
        if (!ch) for (const x of part) desk().update(x.item.id, { status: 'error', error: `Không còn kênh "${x.item.channelName}" ở trang Tài khoản.` })
        S.sending = Math.max(0, S.sending - part.length)
        refresh()
        continue
      }
      const before = S.sending - part.length
      try {
        sent += await ctx.withChannel(ch.key, (page) => sendOn(page, ch, part, g), { label: part.length > 1 ? `Trả lời ${part.length} bình luận` : `Trả lời ${part[0].item.author}`, shouldStop: () => halted(g) })
      } catch (e) {
        if (!(halted(g) || STOPPED.test(e.message))) {
          for (const x of left()) desk().update(x.item.id, { status: 'error', error: e.message })
          ctx.log('error', `Không gửi được trả lời ở kênh "${ch.name}": ${e.message}`)
        }
      } finally {
        S.sending = Math.max(0, Math.min(S.sending, before)) // phan chua gui (dung / loi) khong con cho
        refresh()
      }
    }
    if (halted(g)) ctx.log('info', `Cộng đồng: đã dừng, đã gửi ${sent} trả lời.`)
    return sent
  }

  // Gemini soan nhieu binh luan cung luc (DRAFT_PARALLEL); key sai / het han muc -> dung ca luot
  async function draftAll(list, g) {
    let i = 0
    let fatal = false
    const worker = async () => {
      while (!fatal && !halted(g) && i < list.length) {
        const it = list[i++]
        try { await draft(it) } catch (e) {
          desk().update(it.id, { status: 'error', error: e.message })
          if (['badKey', 'quota', 'model'].includes(e.reason)) { if (!fatal) ctx.log('error', `Gemini: ${e.message}`); fatal = true }
        }
        refresh()
      }
    }
    await Promise.all(Array.from({ length: Math.min(DRAFT_PARALLEL, list.length) }, worker))
  }

  // ---- mot luot: moi kenh mot lan chuyen kenh: doc hop thu -> Gemini soan -> (tu gui) loi khen ----
  async function round(manual, keys) {
    if (S.busy) return
    if (!manual && (settings().replyMode === 'off' || settings().inboxPaused)) return
    if (!ctx.withChannel || !ctx.accounts) return manual && ctx.log('warn', ACCOUNTS_MISSING)
    const sel = selected()
    keys = keys && keys.length ? keys.map((k) => { const ch = ctx.accounts.find(k); return ch ? ch.key : k }).filter((k) => sel.includes(k)) : sel
    if (!keys.length) return manual && ctx.log('warn', 'Chọn ít nhất một kênh để lấy bình luận (trang Cộng đồng).')
    if (manual && settings().inboxPaused) ctx.store.save({ inboxPaused: false }) // bam lay tay = bat lai tu dong
    const g = gen
    S.busy = true
    refresh()
    let added = 0
    let sent = 0
    let noKey = false
    try {
      for (const key of keys) {
        if (halted(g)) break
        const ch = ctx.accounts.find(key)
        if (!ch) { ctx.log('warn', `Không có kênh "${key}" ở trang Tài khoản, bỏ qua.`); continue }
        S.current = ch.name
        refresh()
        try {
          await ctx.withChannel(key, async (page) => {
            await flow.openInbox(page, channelOf(page.url()), { urls: ctx.urls, log: ctx.log })
            const rows = await flow.readComments(page, { max: MAX_READ, handle: ch.handle })
            const n = mergeRows(rows, ch)
            added += n
            if (n || manual) ctx.log('info', `"${ch.name}": ${n} bình luận mới chưa phản hồi (đọc ${rows.length} trong hộp thư Studio).`)
            refresh()
            if (settings().replyMode === 'off' || halted(g)) return
            const mine = (status) => desk().items.filter((x) => x.source === 'studio' && x.channelKey === ch.key && x.status === status)
            const fresh = mine('new').slice(0, DRAFTS_PER_ROUND)
            if (fresh.length && !ctx.store.hasSecret('gemini')) noKey = true
            else await draftAll(fresh, g)
            // tu gui loi khen ngan (ca ban nhap tu luot truoc chua gui vi het gioi han) ngay tren hop thu dang mo
            if (settings().replyMode !== 'auto' || halted(g)) return
            const auto = mine('ready').filter((x) => CommentDesk.autoOk(x))
            if (!auto.length || !desk().canSend(settings().replyPerHour)) return
            S.sending += auto.length
            refresh()
            sent += await sendOn(page, ch, auto.map((it) => ({ item: it, text: String(it.draft || '').replace(/[<>]/g, '') })), g)
            S.sending = 0
          }, { label: `Bình luận ${ch.name}`, shouldStop: () => halted(g) })
        } catch (e) {
          S.sending = 0
          if (halted(g) || STOPPED.test(e.message)) break
          ctx.log('error', `"${ch.name}": không đọc được hộp thư bình luận: ${e.message}`)
        }
        refresh()
      }
      if (noKey) ctx.log('warn', 'Chưa có Gemini API key nên chưa soạn được trả lời (Cài đặt → Gemini API).')
      if (halted(g)) ctx.log('info', `Cộng đồng: đã dừng${sent ? ` (đã tự gửi ${sent} trả lời)` : ''}.`)
      else if (sent) ctx.log('ok', `Cộng đồng: đã tự gửi ${sent} trả lời cho bình luận khen.`)
      else if (manual && !added) ctx.log('info', 'Cộng đồng: không có bình luận mới.')
    } finally {
      S.busy = false
      S.current = ''
      S.at = new Date().toISOString()
      refresh()
    }
  }

  return {
    commands: {
      inbox_channels: (keys) => {
        ctx.store.save({ inboxChannels: (Array.isArray(keys) ? keys : []).map(String) })
        refresh()
      },
      inbox_fetch: (p) => round(true, p && p.channelKeys),
      // Dung ngay (ca viec dang xep hang) va khong tu lay binh luan nua cho toi khi bam "Lay binh luan moi"
      inbox_stop: () => {
        gen++
        ctx.store.save({ inboxPaused: true })
        ctx.log('info', 'Cộng đồng: đã bấm Dừng. Tool dừng việc đang làm và không tự lấy bình luận nữa cho tới khi bạn bấm "Lấy bình luận mới".')
        refresh()
      },
      inbox_resume: () => { ctx.store.save({ inboxPaused: false }); ctx.log('info', 'Cộng đồng: bật lại tự lấy bình luận mỗi 10 phút.'); refresh() },
      inbox_send: async (p) => {
        const it = p && desk().get(p.id)
        if (it) await sendMany([{ item: it, text: p.text }]) // luong da ghi "Da tra loi ..." vao nhat ky
      },
      // gui het ban nhap dang cho (ids: dung cac binh luan dang hien; texts: chu da sua tren the)
      inbox_send_all: async (p) => {
        const texts = (p && p.texts) || {}
        const ids = p && Array.isArray(p.ids) ? new Set(p.ids) : null
        const list = desk().items.filter((x) => x.source === 'studio' && x.status === 'ready' && (!ids || ids.has(x.id)) && chosen(x))
          .map((it) => ({ item: it, text: texts[it.id] !== undefined ? texts[it.id] : it.draft }))
        if (!list.length) return ctx.log('info', 'Cộng đồng: không có bản nháp nào để gửi.')
        ctx.log('info', `Cộng đồng: gửi ${list.length} trả lời…`)
        const n = await sendMany(list)
        ctx.log(n === list.length ? 'ok' : 'warn', `Cộng đồng: đã gửi ${n}/${list.length} trả lời.`)
      },
      inbox_skip: (id) => { desk().update(id, { status: 'skipped', note: 'Bạn bỏ qua' }); refresh() },
      inbox_redraft: async (id) => {
        const it = desk().get(id)
        if (!it) return
        try { await draft(it) } catch (e) { desk().update(id, { status: 'error', error: e.message }) }
        refresh()
      },
    },
    start() {
      refresh()
      // tu lay binh luan moi dinh ky (khi che do tra loi khong "Tat") qua moi kenh da chon
      setInterval(() => round(false).catch((e) => ctx.log('error', `Cộng đồng: ${e.message}`)), POLL_MS)
      // danh sach kenh o trang Tai khoan co the doi -> cap nhat lua chon
      let last = ''
      setInterval(() => {
        const now = JSON.stringify(ctx.accounts ? ctx.accounts.channels() : [])
        if (now !== last && !S.busy) { last = now; refresh() }
      }, 5000)
    },
  }
}
