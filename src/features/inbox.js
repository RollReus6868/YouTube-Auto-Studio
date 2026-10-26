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
const DRAFTS_PER_ROUND = 20
// cach nhau 20–60 giay giua hai lan tu gui (tranh bo loc spam cua YouTube)
const gap = () => (process.env.YA_INBOX_GAP_MS !== undefined ? Number(process.env.YA_INBOX_GAP_MS) : 20e3 + Math.random() * 40e3)
const ACCOUNTS_MISSING = 'Chưa có tài khoản Google nào (trang Tài khoản).'

module.exports = (ctx) => {
  const S = ctx.state.f.inbox = { channels: [], options: [], busy: false, current: '', at: '', items: [], sentLastHour: 0 }
  let stopReq = false
  const settings = () => ctx.store.settings
  const desk = () => ctx.desk

  // ---- trang thai gui giao dien ---------------------------------------------------------
  function selected() {
    // khoa '<tai khoan>:<ten>' doi thanh UC ID khi da biet -> doi theo
    const keys = (settings().inboxChannels || []).map((k) => {
      const ch = ctx.accounts && ctx.accounts.find(k)
      return ch ? ch.key : k
    })
    return [...new Set(keys)]
  }
  function refresh() {
    S.options = ctx.accounts ? ctx.accounts.channels().map((c) => ({ key: c.key, name: c.name, handle: c.handle, accountId: c.accountId })) : []
    S.channels = selected()
    const d = desk()
    if (d) {
      S.items = d.items.filter((x) => x.source === 'studio').slice(0, 200)
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

  // ---- gui mot tra loi (tim lai hang, kiem kenh, khong gui hai lan) -------------------------
  async function sendOne(item, text) {
    text = String(text || '').trim().replace(/[<>]/g, '')
    if (!item || !text) return false
    if (!ctx.withChannel) { ctx.log('warn', ACCOUNTS_MISSING); return false }
    if (item.status === 'sent') return false
    if (!desk().canSend(settings().replyPerHour)) {
      ctx.log('warn', `Đã gửi đủ ${settings().replyPerHour} trả lời trong 1 giờ qua (giới hạn trong Cài đặt). Thử lại sau.`)
      return false
    }
    const ch = ctx.accounts && ctx.accounts.find(item.channelKey)
    if (!ch) { desk().update(item.id, { status: 'error', error: `Không còn kênh "${item.channelName}" ở trang Tài khoản.` }); return false }
    try {
      const r = await ctx.withChannel(ch.key, async (page) => {
        const uc = channelOf(page.url())
        await flow.openInbox(page, uc, { urls: ctx.urls, log: ctx.log })
        return flow.reply(page, { id: item.id, author: item.author }, text, { uc, handle: ch.handle, urls: ctx.urls, log: ctx.log })
      }, { label: `Trả lời ${item.author}` })
      if (r.status === 'already') {
        desk().update(item.id, { status: 'skipped', note: 'Kênh đã trả lời bình luận này rồi' })
        return false
      }
      desk().markSent(item.id, text)
      return true
    } catch (e) {
      desk().update(item.id, { status: 'error', error: e.message })
      ctx.log('error', `Không gửi được trả lời cho ${item.author} (${item.channelName}): ${e.message}`)
      return false
    } finally { refresh() }
  }

  // ---- mot luot: doc tung kenh -> Gemini soan -> (tu gui) loi khen ---------------------------
  async function round(manual, keys) {
    if (S.busy) return
    if (!manual && settings().replyMode === 'off') return
    if (!ctx.withChannel || !ctx.accounts) return manual && ctx.log('warn', ACCOUNTS_MISSING)
    keys = (keys && keys.length ? keys : selected()).filter(Boolean)
    if (!keys.length) return manual && ctx.log('warn', 'Chọn ít nhất một kênh để lấy bình luận (trang Cộng đồng).')
    S.busy = true
    stopReq = false
    refresh()
    let added = 0
    let sent = 0
    try {
      for (const key of keys) {
        if (stopReq) break
        const ch = ctx.accounts.find(key)
        if (!ch) { ctx.log('warn', `Không có kênh "${key}" ở trang Tài khoản, bỏ qua.`); continue }
        S.current = ch.name
        refresh()
        try {
          const rows = await ctx.withChannel(key, async (page) => {
            await flow.openInbox(page, channelOf(page.url()), { urls: ctx.urls, log: ctx.log })
            return flow.readComments(page, { max: MAX_READ, handle: ch.handle })
          }, { label: `Bình luận ${ch.name}` })
          const n = mergeRows(rows, ch)
          added += n
          if (n || manual) ctx.log('info', `"${ch.name}": ${n} bình luận mới chưa phản hồi (đọc ${rows.length} trong hộp thư Studio).`)
        } catch (e) {
          ctx.log('error', `"${ch.name}": không đọc được hộp thư bình luận: ${e.message}`)
          continue
        }
        refresh()
        const mine = (status) => desk().items.filter((x) => x.source === 'studio' && x.channelKey === ch.key && x.status === status)
        if (settings().replyMode === 'off') continue
        const fresh = mine('new')
        if (fresh.length && !ctx.store.hasSecret('gemini')) ctx.log('warn', 'Chưa có Gemini API key nên chưa soạn được trả lời (Cài đặt → Gemini API).')
        else {
          let i = 0
          for (const it of fresh) {
            if (stopReq || i++ >= DRAFTS_PER_ROUND) break
            try { await draft(it) } catch (e) {
              desk().update(it.id, { status: 'error', error: e.message })
              if (['badKey', 'quota', 'model'].includes(e.reason)) { ctx.log('error', `Gemini: ${e.message}`); break }
            }
            refresh()
          }
        }
        // tu gui loi khen ngan (ca ban nhap tu luot truoc chua gui vi het gioi han)
        if (settings().replyMode !== 'auto') continue
        for (const it of mine('ready').filter((x) => CommentDesk.autoOk(x))) {
          if (stopReq || !desk().canSend(settings().replyPerHour)) break
          if (sent) await sleep(gap())
          if (await sendOne(it, it.draft)) sent++
        }
      }
      if (sent) ctx.log('ok', `Cộng đồng: đã tự gửi ${sent} trả lời cho bình luận khen.`)
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
      inbox_stop: () => { stopReq = true; ctx.log('info', 'Cộng đồng: dừng sau bước đang làm.') },
      inbox_send: async (p) => {
        const it = p && desk().get(p.id)
        if (it) await sendOne(it, p.text) // luong da ghi "Da tra loi ..." vao nhat ky
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
