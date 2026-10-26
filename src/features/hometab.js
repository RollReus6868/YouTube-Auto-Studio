// Tinh nang "Trang chu kenh": them kenh moi vao "Kenh noi bat" va them phan
// "Danh sach phat don" vao The Trang chu cua cac kenh cu (qua YouTube Studio).
const flow = require('../flows/hometab')
const input = require('../hometab-input')

const FIELDS = ['channelUrl', 'playlistUrl', 'position', 'doChannel', 'doPlaylist', 'selected']

module.exports = (ctx) => {
  const S = ctx.state.f.hometab = {
    channelUrl: '', playlistUrl: '', position: '', doChannel: true, doPlaylist: true,
    selected: [], // khoa cac kenh cu nguoi dung tich
    check: input.checkInput({}), // ket qua kiem dau vao (giao dien hien loi tung o)
    channels: [], // kenh cua nguoi dung (tu ctx.accounts), de giao dien liet ke
    newKey: '', // khoa cua kenh moi neu no nam trong tai khoan cua nguoi dung
    targets: [], // [{ key, name, status: queued|run|done|skipped|error|stopped, step, error, channel, playlist, moved }]
    busy: false, at: '',
  }

  // Moi kenh cua moi tai khoan (trang Tai khoan); nguoi dung tu tich kenh cu o trang nay
  const listChannels = () => {
    let accs = []
    try { accs = ctx.accounts ? ctx.accounts.list() : ((ctx.state.f.accounts && ctx.state.f.accounts.list) || []) } catch (_) { /* accounts chua san sang */ }
    const out = []
    for (const a of accs || []) for (const c of a.channels || []) out.push({ ...c, key: c.key || c.ucId || `${a.id}:${c.name}`, accountId: a.id })
    return out
  }
  // Kenh moi co nam trong danh sach kenh cua nguoi dung khong (de lay ten + UC id)
  const findNew = (ch) => (ch && ch.ok ? S.channels.find((c) => input.sameChannel(c, ch)) || null : null)

  function refresh() {
    S.channels = listChannels().map((c) => ({ key: c.key, name: c.name, handle: c.handle || '', ucId: c.ucId || '', accountId: c.accountId || '' }))
    S.check = input.checkInput(S)
    const mine = findNew(S.check.channel)
    S.newKey = mine ? mine.key : ''
  }

  function saveInput(patch = {}) {
    for (const k of FIELDS) if (patch[k] !== undefined) S[k] = k === 'selected' ? [].concat(patch[k]).map(String) : patch[k]
    S.doChannel = !!S.doChannel
    S.doPlaylist = !!S.doPlaylist
    refresh()
    if (ctx.store) ctx.store.save({ hometab: Object.fromEntries(FIELDS.map((k) => [k, S[k]])) })
  }

  const setTarget = (key, patch) => {
    const t = S.targets.find((x) => x.key === key)
    if (t) Object.assign(t, patch)
    ctx.push()
  }

  const STATUS = { added: 'đã thêm', already: 'đã có sẵn', self: 'bỏ qua (chính là kênh mới)', error: 'lỗi' }

  async function run(payload = {}) {
    if (S.busy || ctx.isBusy()) return ctx.log('warn', 'Tool đang chạy việc khác, chờ xong rồi thử lại.')
    saveInput(payload)
    if (payload.targets) S.selected = [].concat(payload.targets).map(String)
    const chk = S.check
    if (!chk.ok) { for (const e of chk.errors) ctx.log('error', `Trang chủ kênh: ${e}`); ctx.push(); return }
    if (!ctx.withChannel) {
      ctx.log('error', 'Chưa có tài khoản Google nào (trang Tài khoản). Thêm tài khoản rồi chạy lại.')
      return
    }
    const mine = findNew(chk.channel)
    // kenh moi la kenh cua minh: dung link UC (tim chac hon @handle) va biet truoc ten
    const channel = mine && mine.ucId && chk.channel.kind === 'handle'
      ? { ...chk.channel, kind: 'uc', ucId: mine.ucId, url: input.channelUrl(mine.ucId) } : chk.channel
    const byKey = new Map(S.channels.map((c) => [c.key, c]))
    let keys = S.selected.filter((k) => byKey.has(k) || !S.channels.length)
    if (S.doChannel && mine && keys.includes(mine.key)) {
      ctx.log('info', `Bỏ qua "${mine.name}": đây chính là kênh mới.`)
      keys = keys.filter((k) => k !== mine.key)
    }
    if (!keys.length) return ctx.log('warn', 'Chưa tích kênh cũ nào để thêm.')

    S.targets = keys.map((key) => ({ key, name: (byKey.get(key) || {}).name || key, status: 'queued', step: '', error: '', channel: '', playlist: '', moved: null }))
    S.busy = true
    ctx.resetStop()
    ctx.setBusy(true)
    let channelName = mine ? mine.name : ''
    let playlistTitle = ''
    let ok = 0
    ctx.log('info', `Trang chủ kênh: bắt đầu với ${keys.length} kênh.`)
    try {
      for (const t of S.targets) {
        if (ctx.stopped()) { setTarget(t.key, { status: 'stopped' }); continue }
        const ch = byKey.get(t.key) || {}
        setTarget(t.key, { status: 'run', step: 'switch' })
        try {
          const r = await ctx.withChannel(t.key, (page) => flow.updateHomeTab(page, {
            ucId: ch.ucId || '', target: { ucId: ch.ucId || '', handle: ch.handle || '' },
            channel, channelName, playlist: chk.playlist, playlistTitle,
            position: chk.position.value, doChannel: S.doChannel, doPlaylist: S.doPlaylist,
          }, {
            urls: ctx.urls,
            log: (level, msg) => ctx.log(level, `[${t.name}] ${msg}`),
            onStep: (step) => setTarget(t.key, { step }),
          }), { label: 'Trang chủ kênh' })
          if (r.channel && r.channel.name && r.channel.status !== 'self') channelName = channelName || r.channel.name
          if (r.playlist && r.playlist.title) playlistTitle = playlistTitle || r.playlist.title
          const changed = (r.channel && r.channel.status === 'added') || (r.playlist && r.playlist.status === 'added')
          setTarget(t.key, {
            status: r.errors.length ? 'error' : changed ? 'done' : 'skipped', step: '', error: r.errors.join(' · '),
            channel: r.channel ? r.channel.status : '', playlist: r.playlist ? r.playlist.status : '', moved: r.moved,
          })
          if (!r.errors.length) ok++
          const parts = []
          if (r.channel) parts.push(`Kênh nổi bật: ${STATUS[r.channel.status] || r.channel.status}`)
          if (r.playlist) parts.push(`Danh sách phát: ${STATUS[r.playlist.status] || r.playlist.status}`)
          if (r.moved === false) parts.push('chưa kéo được tới vị trí mong muốn')
          ctx.log(r.errors.length ? 'warn' : 'ok', `[${t.name}] ${parts.join(' · ')}${r.published ? ' · đã xuất bản' : ''}.`)
        } catch (e) {
          setTarget(t.key, { status: ctx.stopped() ? 'stopped' : 'error', step: '', error: e.message })
          ctx.log('error', `[${t.name}] ${e.message}`)
        }
      }
    } finally {
      S.busy = false
      S.at = new Date().toISOString()
      ctx.setBusy(false)
      ctx.log(ok === keys.length ? 'ok' : 'warn', `Trang chủ kênh: xong ${ok}/${keys.length} kênh.`)
    }
  }

  return {
    commands: {
      hometab_save_input: (p) => { saveInput(p || {}); ctx.push() },
      hometab_refresh: () => { refresh(); ctx.push() },
      hometab_run: (p) => run(p || {}),
    },
    start() {
      const saved = (ctx.store && ctx.store.settings.hometab) || {}
      for (const k of FIELDS) if (saved[k] !== undefined) S[k] = saved[k]
      refresh()
    },
  }
}
