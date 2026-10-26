// Chuan hoa dau vao cua tinh nang "Trang chu kenh": link kenh moi, link danh sach phat,
// vi tri dat danh sach phat. Thuan JS, khong phu thuoc Electron (kiem trong unit-test).
const UC_RE = /\bUC[\w-]{21,22}\b/
const HANDLE_RE = /^@[\p{L}\p{N}._·-]{3,30}$/u
const LIST_RE = /^(PL|OLAK5uy_|UU|FL)[\w-]{10,}$/
const MAX_SECTIONS = 12

const channelUrl = (ucId) => `https://www.youtube.com/channel/${ucId}`
const handleUrl = (handle) => `https://www.youtube.com/${handle}`
const playlistUrl = (id) => `https://www.youtube.com/playlist?list=${id}`

const fail = (error) => ({ ok: false, error })

// Bo khoang trang, dau ngoac, va them https:// neu nguoi dung dan "youtube.com/..."
function toUrl(s) {
  if (!/^[\w.-]*youtube\.com\//i.test(s) && !/^https?:\/\//i.test(s) && !/^youtu\.be\//i.test(s)) return null
  try { return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`) } catch (_) { return null }
}

// Link kenh: youtube.com/channel/UC..., studio.youtube.com/channel/UC..., youtube.com/@handle,
// @handle, hoac UC id tran. Tra ve { ok, kind: 'uc'|'handle', ucId, handle, url, error }
function parseChannelInput(raw) {
  const s = String(raw || '').trim().replace(/^<|>$/g, '')
  if (!s) return fail('Chưa nhập link kênh mới.')
  if (/^UC[\w-]+$/.test(s)) {
    return UC_RE.test(s) && s.length <= 24 ? { ok: true, kind: 'uc', ucId: s, handle: '', url: channelUrl(s) }
      : fail('Mã kênh phải có dạng UC + 22 ký tự (ví dụ UC4Dzx9CFcLbO9OGWNBJkwBQ).')
  }
  if (s.startsWith('@')) {
    return HANDLE_RE.test(s) ? { ok: true, kind: 'handle', ucId: '', handle: s, url: handleUrl(s) }
      : fail('Handle không hợp lệ: chỉ gồm chữ, số, dấu chấm, gạch dưới, gạch ngang (3–30 ký tự).')
  }
  const u = toUrl(s)
  if (!u || !/(^|\.)youtube\.com$/i.test(u.hostname)) return fail('Không phải link YouTube. Dán link kênh dạng https://www.youtube.com/channel/UC… hoặc @handle.')
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts[0] === 'channel') {
    const m = UC_RE.exec(parts[1] || '')
    if (m && parts[1].length <= 24) return { ok: true, kind: 'uc', ucId: m[0], handle: '', url: channelUrl(m[0]) }
    return fail('Link kênh thiếu mã UC… hợp lệ.')
  }
  if (parts[0] && parts[0].startsWith('@')) {
    const h = decodeURIComponent(parts[0])
    return HANDLE_RE.test(h) ? { ok: true, kind: 'handle', ucId: '', handle: h, url: handleUrl(h) } : fail('Handle trong link không hợp lệ.')
  }
  if (parts[0] === 'playlist' || u.searchParams.get('list')) return fail('Đây là link danh sách phát, không phải link kênh.')
  if (parts[0] === 'watch' || parts[0] === 'shorts' || parts[0] === 'live') return fail('Đây là link video, không phải link kênh.')
  if (parts[0] === 'c' || parts[0] === 'user') return fail('Link dạng /c/ hoặc /user/ chưa hỗ trợ. Dùng link youtube.com/channel/UC… (Tùy chỉnh → Hồ sơ → URL của kênh) hoặc @handle.')
  return fail('Link kênh không hợp lệ. Dán link dạng https://www.youtube.com/channel/UC… hoặc @handle.')
}

// Link danh sach phat: ...playlist?list=PL..., watch?v=..&list=PL..., studio .../playlist/PL.../edit,
// hoac ma PL... tran. Tra ve { ok, id, url, error }
function parsePlaylistInput(raw) {
  const s = String(raw || '').trim().replace(/^<|>$/g, '')
  if (!s) return fail('Chưa nhập link danh sách phát.')
  let id = ''
  if (/^[\w-]+$/.test(s)) id = s
  else {
    const u = toUrl(s)
    if (!u || !/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname)) return fail('Không phải link YouTube. Dán link dạng https://www.youtube.com/playlist?list=PL…')
    const parts = u.pathname.split('/').filter(Boolean)
    id = u.searchParams.get('list') || (parts[0] === 'playlist' && parts[1]) || ''
    if (!id) {
      if (parts[0] === 'channel' || (parts[0] || '').startsWith('@')) return fail('Đây là link kênh, không phải link danh sách phát.')
      if (parts[0] === 'watch' || parts[0] === 'shorts' || u.hostname === 'youtu.be') return fail('Link video này không chứa danh sách phát (thiếu "list=").')
      return fail('Link danh sách phát thiếu "list=".')
    }
  }
  if (/^RD/.test(id)) return fail('Danh sách kết hợp (Mix) không thêm được vào trang chủ.')
  if (id === 'WL' || id === 'LL') return fail('Danh sách "Xem sau" / "Video đã thích" là riêng tư, không thêm được.')
  if (!LIST_RE.test(id)) return fail('Mã danh sách phát không hợp lệ (thường bắt đầu bằng PL…).')
  return { ok: true, id, url: playlistUrl(id) }
}

// Vi tri dat phan "Danh sach phat don": 0 / '' / 'cuoi' = cuoi trang; so 1..12 = vi tri thu N.
function parsePosition(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 0 || /^(cuối|cuoi|end)$/i.test(String(raw).trim())) return { ok: true, value: 0 }
  const n = Number(String(raw).trim())
  if (!Number.isInteger(n)) return fail('Vị trí phải là số nguyên.')
  if (n < 1 || n > MAX_SECTIONS) return fail(`Vị trí phải từ 1 đến ${MAX_SECTIONS} (trang chủ có tối đa ${MAX_SECTIONS} phần).`)
  return { ok: true, value: n }
}

// Kiem tra ca bo dau vao (giao dien hien loi tung o).
function checkInput({ channelUrl: ch, playlistUrl: pl, position, doChannel = true, doPlaylist = true } = {}) {
  const out = {
    channel: doChannel || ch ? parseChannelInput(ch) : { ok: true, skip: true },
    playlist: doPlaylist || pl ? parsePlaylistInput(pl) : { ok: true, skip: true },
    position: parsePosition(position),
  }
  // o khong bat thi khong chan viec chay
  if (!doChannel) out.channel = { ...out.channel, ok: out.channel.ok || !ch, error: ch ? out.channel.error : '' }
  if (!doPlaylist) out.playlist = { ...out.playlist, ok: out.playlist.ok || !pl, error: pl ? out.playlist.error : '' }
  const errors = []
  if (!doChannel && !doPlaylist) errors.push('Hãy bật ít nhất một việc: thêm vào Kênh nổi bật hoặc thêm Danh sách phát đơn.')
  if (doChannel && !out.channel.ok) errors.push(out.channel.error)
  if (doPlaylist && !out.playlist.ok) errors.push(out.playlist.error)
  if (doPlaylist && !out.position.ok) errors.push(out.position.error)
  return { ...out, ok: !errors.length, errors }
}

// Kenh dich co chinh la kenh moi khong (khong duoc tu gioi thieu minh).
function sameChannel(a, b) {
  if (!a || !b) return false
  if (a.ucId && b.ucId) return a.ucId === b.ucId
  const h = (x) => String(x.handle || '').toLowerCase().replace(/^@?/, '@')
  return !!(a.handle && b.handle && h(a) === h(b))
}

module.exports = { parseChannelInput, parsePlaylistInput, parsePosition, checkInput, sameChannel, channelUrl, playlistUrl, MAX_SECTIONS }
