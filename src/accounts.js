// Danh sach tai khoan Google (moi tai khoan mot phien rieng 'persist:yt-<id>') va cac kenh
// cua tung tai khoan. Node thuan (khong require electron) de kiem thu bang node.
// Cookie cua phien chinh la "chia khoa": tool KHONG bao gio nhan hay luu mat khau.
const KEY = 'googleAccounts'
const LEGACY_PARTITION = 'persist:youtube' // phien Studio cua ban 0.3
const STATUS = ['unchecked', 'signed-in', 'needs-sign-in']

function slugId(raw) {
  return String(raw || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'tk'
}

const isUc = (s) => /^UC[\w-]{22}$/.test(String(s || ''))
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()

// Khoa cua kenh: UC ID khi da biet, neu chua thi '<accountId>:<ten>'. Hai kenh trung ten trong
// mot tai khoan (co that: hai kenh "Thắng Nguyễn" khac @handle) -> '<accountId>:<ten> <@handle>'.
function nameKey(account, ch) {
  const dup = ch.handle && account.channels.some((o) => o !== ch && norm(o.name) === norm(ch.name))
  return `${account.id}:${ch.name}${dup ? ` ${ch.handle}` : ''}`
}
const channelKey = (account, ch) => ch.ucId || nameKey(account, ch)

// Anh dai dien kenh: dia chi https (yt3.ggpht.com...); http chi cho Studio gia tren may (bai kiem)
const cleanAvatar = (s) => {
  const u = String(s || '').trim()
  return u.length <= 2000 && /^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/)\S+$/.test(u) ? u : ''
}

function cleanChannel(c) {
  return {
    name: String(c.name || '').trim(),
    handle: /^@/.test(String(c.handle || '').trim()) ? String(c.handle).trim() : '',
    subs: String(c.subs || '').trim(),
    ucId: isUc(c.ucId) ? c.ucId : '',
    avatar: cleanAvatar(c.avatar),
    enabled: !!c.enabled,
    active: !!c.active,
  }
}

// Cung mot kenh? Uu tien UC ID, roi @handle, roi ten.
function sameChannel(a, b) {
  if (a.ucId && b.ucId) return a.ucId === b.ucId
  if (a.handle && b.handle) return a.handle.toLowerCase() === b.handle.toLowerCase()
  return norm(a.name) === norm(b.name)
}

class Accounts {
  // store: { settings, save(patch) } (src/store.js). legacy: thu muc phien cu 'persist:youtube' co du lieu
  constructor(store, { legacy = false } = {}) {
    this.store = store
    const saved = store.settings[KEY]
    if (Array.isArray(saved)) {
      this.list_ = saved.map((a) => this.clean(a))
    } else {
      // Lan dau chay ban 0.4: phien Studio cu thanh tai khoan #1 (giu nguyen cookie, dung lai ten phien)
      this.list_ = [this.clean({ id: 'tk-1', label: 'Tài khoản 1', partition: legacy ? LEGACY_PARTITION : 'persist:yt-tk-1' })]
      this.migrated = legacy
    }
    delete store.settings.loginMode // ban 0.3 doi user agent khi dang nhap: bo han
    this.save()
  }

  clean(a) {
    const id = slugId(a.id)
    return {
      id,
      label: String(a.label || '').trim() || id,
      partition: a.partition === LEGACY_PARTITION ? LEGACY_PARTITION : `persist:yt-${id}`,
      status: STATUS.includes(a.status) ? a.status : 'unchecked',
      email: String(a.email || ''),
      name: String(a.name || ''), // ten tai khoan Google doc tu Studio
      checkedAt: a.checkedAt || '',
      channels: (Array.isArray(a.channels) ? a.channels : []).map(cleanChannel).filter((c) => c.name),
    }
  }

  save() { this.store.save({ [KEY]: this.list_ }) }
  list() { return this.list_.map((a) => ({ ...a, channels: a.channels.map((c) => ({ ...c, key: channelKey(a, c) })) })) }
  get(id) { return this.list_.find((a) => a.id === id) || null }

  add(label) {
    const base = slugId(label || `tk-${this.list_.length + 1}`)
    let id = base
    for (let n = 2; this.get(id); n++) id = `${base}-${n}`
    const a = this.clean({ id, label: String(label || '').trim() || `Tài khoản ${this.list_.length + 1}` })
    this.list_.push(a)
    this.save()
    return a
  }

  rename(id, label) {
    const a = this.get(id)
    if (!a || !String(label || '').trim()) return false
    a.label = String(label).trim()
    this.save()
    return true
  }

  remove(id) {
    const i = this.list_.findIndex((a) => a.id === id)
    if (i < 0) return null
    const [a] = this.list_.splice(i, 1)
    this.save()
    return a
  }

  // patch: { status, email, name }
  update(id, patch) {
    const a = this.get(id)
    if (!a) return false
    if (STATUS.includes(patch.status)) { a.status = patch.status; a.checkedAt = new Date().toISOString() }
    if (typeof patch.email === 'string' && patch.email) a.email = patch.email
    if (typeof patch.name === 'string' && patch.name) a.name = patch.name
    this.save()
    return true
  }

  // Dang xuat: xoa phien nhung giu muc, kenh va lua chon cua nguoi dung
  signedOut(id) {
    const a = this.get(id)
    if (!a) return false
    a.status = 'needs-sign-in'
    for (const c of a.channels) c.active = false
    this.save()
    return true
  }

  // Ghep danh sach kenh vua doc tu Studio vao danh sach cu: giu tick va UC ID da hoc.
  // Kenh moi: chua tick (tru khi tai khoan chi co mot kenh). Kenh khong con: bo.
  setChannels(id, found) {
    const a = this.get(id)
    if (!a) return null
    const old = a.channels
    a.channels = found.map(cleanChannel).filter((c) => c.name).map((c) => {
      const prev = old.find((o) => sameChannel(o, c))
      return { ...c, enabled: prev ? prev.enabled : false, ucId: c.ucId || (prev && prev.ucId) || '', handle: c.handle || (prev && prev.handle) || '', avatar: c.avatar || (prev && prev.avatar) || '' }
    })
    if (a.channels.length === 1 && !old.length) a.channels[0].enabled = true
    this.save()
    return a.channels
  }

  // Studio dang o kenh ucId (ten name): hoc UC ID cho kenh do (va danh dau dang chon)
  learn(id, { ucId, name, handle }) {
    const a = this.get(id)
    if (!a || !isUc(ucId)) return null
    let c = a.channels.find((x) => x.ucId === ucId) ||
      (handle && a.channels.find((x) => !x.ucId && x.handle && x.handle.toLowerCase() === handle.toLowerCase())) ||
      (name && a.channels.find((x) => !x.ucId && norm(x.name) === norm(name)))
    if (!c && name) {
      c = cleanChannel({ name, handle, enabled: !a.channels.length })
      a.channels.push(c)
    }
    if (!c) return null
    c.ucId = ucId
    if (handle && !c.handle) c.handle = handle
    for (const x of a.channels) x.active = x === c
    this.save()
    return { ...c, key: channelKey(a, c) }
  }

  setEnabled(key, enabled) {
    const f = this.findRaw(key)
    if (!f) return false
    f.channel.enabled = !!enabled
    this.save()
    return true
  }

  findRaw(key) {
    // khoa '<accountId>:<ten>' van dung duoc sau khi da hoc UC ID (tinh nang khac co the da luu khoa cu)
    for (const a of this.list_) for (const c of a.channels) if ((c.ucId && c.ucId === key) || nameKey(a, c) === key) return { account: a, channel: c }
    for (const a of this.list_) for (const c of a.channels) if (`${a.id}:${c.name}` === key) return { account: a, channel: c }
    return null
  }

  // Kenh theo khoa (UC ID, hoac '<accountId>:<ten>'): { key, accountId, ucId, name, handle, subs, avatar, enabled }
  find(key) {
    const f = this.findRaw(key)
    if (!f) return null
    const c = f.channel
    return { key: channelKey(f.account, c), accountId: f.account.id, ucId: c.ucId, name: c.name, handle: c.handle, subs: c.subs, avatar: c.avatar, enabled: c.enabled }
  }

  // Cac kenh nguoi dung da tick, cua moi tai khoan
  channels() {
    const out = []
    for (const a of this.list_) for (const c of a.channels) if (c.enabled) out.push({ key: channelKey(a, c), accountId: a.id, ucId: c.ucId, name: c.name, handle: c.handle, avatar: c.avatar })
    return out
  }

  // Kenh (bat ky tai khoan) co UC ID nay
  byUc(ucId) {
    for (const a of this.list_) for (const c of a.channels) if (c.ucId && c.ucId === ucId) return { account: a, channel: c }
    return null
  }
}

module.exports = { Accounts, slugId, isUc, channelKey, sameChannel, cleanAvatar, LEGACY_PARTITION, KEY }
