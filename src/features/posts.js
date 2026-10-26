// Trang "Dang bai": dang bai len tab Bai dang cua kenh (chu, anh, tham do, do vui, chia se video),
// dang ngay hoac len lich. Moi bai la mot thu muc trong posts/ (scanner.scanPost); xong thi chuyen
// vao da-dang/ kem ket-qua.txt.
const path = require('path')
const scanner = require('../scanner')
const { moveDone } = require('../uploader')
const { createPost } = require('../flows/post')
const { channelOf } = require('../studio/driver')

const norm = (s) => String(s || '').normalize('NFC').trim().toLowerCase().replace(/^@/, '')

module.exports = (ctx) => {
  const S = ctx.state.f.posts = { channelKey: '', channels: [], jobs: {}, busy: false }
  const channels = () => (ctx.accounts ? ctx.accounts.channels() : [])
  const syncChannels = () => {
    const list = channels().map((c) => ({ key: c.key, name: c.name, handle: c.handle || '', ucId: c.ucId || '' }))
    if (JSON.stringify(list) !== JSON.stringify(S.channels)) { S.channels = list; ctx.push() }
  }
  const setJob = (id, patch) => { S.jobs[id] = { status: '', step: '', error: '', url: '', line: '', ...(S.jobs[id] || {}), ...patch }; ctx.push() }

  // Kenh cho mot bai: dong "Kenh:" trong noidung.txt (ten, @handle, UC...) > kenh chon tren trang
  function channelFor(item, fallback) {
    const list = channels()
    if (item.channel) {
      const want = norm(item.channel)
      const hit = list.find((c) => [c.key, c.ucId, c.name, c.handle].some((v) => v && norm(v) === want))
      if (!hit) throw new Error(`Dòng "Kênh: ${item.channel}" không khớp kênh nào ở trang Tài khoản (đã tick).`)
      return hit
    }
    const hit = list.find((c) => c.key === fallback)
    if (!hit) throw new Error(fallback ? 'Kênh đã chọn không còn ở trang Tài khoản.' : 'Chưa chọn kênh để đăng bài.')
    return hit
  }

  function resultLines(item, ch, r) {
    const kind = { posted: 'Đã đăng', scheduled: 'Đã lên lịch', duplicate: 'Đã có sẵn trên kênh (không đăng lại)' }[r.status]
    return [
      `${kind}: ${new Date().toLocaleString('vi-VN')}`,
      `Kênh: ${ch.name}${ch.handle ? ` (${ch.handle})` : ''}${ch.ucId ? ` ${ch.ucId}` : ''}`,
      `Loại: ${scanner.POST_TYPE_LABEL[item.type] || item.type}`,
      r.when ? `Giờ đăng: ${new Date(r.when).toLocaleString('vi-VN')}` : '',
      r.line ? `YouTube hiện: ${r.line}` : '',
      r.url ? `Đường dẫn: ${r.url}` : '',
    ].filter(Boolean)
  }

  async function runOne(id, fallbackKey) {
    const root = ctx.store.settings.root
    const dir = id.replace(/^posts\//, '')
    let item
    try { item = scanner.scanPost(path.join(root, scanner.DIRS.posts), dir) } catch (e) { throw new Error(`Không đọc được thư mục bài: ${e.message}`) }
    if (item.errors.length) throw new Error(item.errors[0])
    const ch = channelFor(item, fallbackKey)
    const what = item.name || dir
    ctx.log('info', `Bài "${what}": đăng lên kênh "${ch.name}"${item.when ? ` lúc ${new Date(item.when).toLocaleString('vi-VN')}` : ''}.`)
    const r = await ctx.withChannel(ch.key, (page) => createPost(page, {
      type: item.type, text: item.text, images: item.images, options: item.options, answers: item.answers,
      explanation: item.explanation, video: item.video, when: item.when,
      // UC that cua trang vua chuyen kenh (kenh moi them co the chua co UC trong danh sach)
      channel: { ucId: channelOf(page.url()) || ch.ucId, handle: ch.handle, name: ch.name },
    }, {
      urls: ctx.urls,
      log: (level, msg) => ctx.log(level, `Bài "${what}": ${msg}`),
      onStep: (step) => setJob(id, { step }),
    }), { label: `dang-bai-${dir}` })
    const moved = moveDone(root, item.folder, resultLines(item, ch, r))
    if (!moved.moved) ctx.log('warn', `Bài "${what}": chưa chuyển được thư mục vào da-dang/ (${moved.error}).`)
    else ctx.state.scan.posts = ctx.state.scan.posts.filter((p) => p.id !== id)
    return r
  }

  const commands = {
    posts_channel: (key) => {
      S.channelKey = String(key || '')
      ctx.store.save({ postsChannel: S.channelKey })
      ctx.push()
    },
    // ids: cac bai can dang (id trong state.scan.posts); channelKey: kenh mac dinh
    posts_run: async ({ ids = [], channelKey } = {}) => {
      if (S.busy) return ctx.log('warn', 'Đang đăng bài, chờ xong lượt này.')
      if (!ctx.withChannel) return ctx.log('error', 'Chưa có tài khoản Google nào (trang Tài khoản).')
      if (!ctx.store.settings.root) return ctx.log('warn', 'Chưa chọn thư mục gốc (Cài đặt).')
      if (channelKey !== undefined && channelKey !== S.channelKey) commands.posts_channel(channelKey)
      const list = ids.filter((id) => !S.jobs[id] || !['done', 'run', 'queued'].includes(S.jobs[id].status))
      if (!list.length) return ctx.log('warn', 'Chưa chọn bài nào để đăng.')
      if (!ctx.isBusy()) ctx.resetStop()
      S.busy = true
      for (const id of list) setJob(id, { status: 'queued', step: '', error: '', url: '', line: '' })
      ctx.log('info', `Bắt đầu đăng ${list.length} bài.`)
      let ok = 0
      try {
        for (const id of list) {
          if (ctx.stopped()) { setJob(id, { status: 'stopped', step: '' }); continue }
          setJob(id, { status: 'run', step: 'open' })
          try {
            const r = await runOne(id, S.channelKey)
            setJob(id, { status: 'done', step: '', url: r.url, line: r.line, result: r.status })
            ok++
            const msg = r.status === 'duplicate' ? 'đã có sẵn trên kênh, không đăng lại' : r.status === 'scheduled' ? `đã lên lịch${r.line ? ` (${r.line})` : ''}` : 'đã đăng'
            ctx.log('ok', `Bài ${id.replace(/^posts\//, '')}: ${msg}${r.url ? ` ${r.url}` : ''}.`)
          } catch (e) {
            setJob(id, { status: ctx.stopped() ? 'stopped' : 'error', error: e.message })
            ctx.log('error', `Bài ${id.replace(/^posts\//, '')}: ${e.message}`)
          }
        }
      } finally {
        S.busy = false
        ctx.log(ok === list.length ? 'ok' : 'warn', `Xong: ${ok}/${list.length} bài.`)
        ctx.push()
      }
    },
  }

  return {
    commands,
    start() {
      S.channelKey = ctx.store.settings.postsChannel || ''
      syncChannels()
      if (!S.channelKey && S.channels[0]) S.channelKey = S.channels[0].key
      setInterval(syncChannels, 3000).unref()
    },
  }
}
