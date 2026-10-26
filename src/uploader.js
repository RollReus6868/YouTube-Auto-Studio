// Dang mot video tu dau den cuoi: tai len -> thumbnail -> playlist -> phu de -> chuyen
// thu muc vao da-dang/. Loi o buoc phu (thumbnail, playlist, phu de) chi canh bao, khong
// lam hong video da tai. Khong require('electron') de kiem thu bang node.
const fs = require('fs')
const path = require('path')
const { DIRS } = require('./scanner')

// Thu muc dich khong trung ten: "ten", "ten (2)", ...
function freeName(dir, name) {
  let target = path.join(dir, name)
  for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, `${name} (${i})`)
  return target
}

// Chuyen thu muc da dang vao <goc>/da-dang/ va ghi ket-qua.txt. Tra ve duong dan moi.
function moveDone(root, folder, lines) {
  fs.writeFileSync(path.join(folder, 'ket-qua.txt'), lines.join('\r\n') + '\r\n')
  const doneDir = path.join(root, DIRS.done)
  fs.mkdirSync(doneDir, { recursive: true })
  const target = freeName(doneDir, path.basename(folder))
  try {
    fs.renameSync(folder, target)
  } catch (e) {
    // Windows: file dang mo (vd trinh xem anh) -> thu lai sau, khong coi la loi dang video
    return { moved: false, folder, error: e.message }
  }
  return { moved: true, folder: target }
}

// item: { folder, video, meta (co thumbnail, subtitles: [{file, lang}]) }
async function uploadOne(google, item, { root, log = () => {}, onStep = () => {}, shouldStop = () => false } = {}) {
  const m = item.meta
  const warnings = []
  onStep('upload', 0)
  const res = await google.uploadVideo(item.video, m, { onProgress: (p) => onStep('upload', p), shouldStop })
  const id = res.id
  const url = `https://youtu.be/${id}`
  log('ok', `Đã tải lên "${m.title}": ${url}`)
  // Du an Google Cloud chua qua kiem duyet: YouTube khoa video o che do Rieng tu
  if (m.privacy !== 'private' && res.status && res.status.privacyStatus === 'private') {
    warnings.push('YouTube đã khóa video ở chế độ Riêng tư vì dự án Google Cloud chưa qua kiểm duyệt API (YouTube API Services Audit).')
  }

  if (m.thumbnail) {
    onStep('thumbnail')
    try { await google.setThumbnail(id, m.thumbnail) } catch (e) {
      warnings.push(e.status === 403 ? 'Không đặt được thumbnail: kênh cần xác minh số điện thoại để dùng thumbnail tùy chỉnh.' : `Không đặt được thumbnail: ${e.message}`)
    }
  }
  if (m.playlist) {
    onStep('playlist')
    try {
      const pl = await google.ensurePlaylist(m.playlist, m.publishAt ? 'public' : m.privacy)
      await google.addToPlaylist(pl, id)
    } catch (e) { warnings.push(`Không thêm vào playlist "${m.playlist}": ${e.message}`) }
  }
  for (const s of m.subtitles || []) {
    onStep('subtitles')
    try { await google.addCaption(id, s.file, s.lang || m.language || 'vi') } catch (e) { warnings.push(`Không thêm phụ đề ${path.basename(s.file)}: ${e.message}`) }
  }
  for (const w of warnings) log('warn', `${m.title}: ${w}`)

  const lines = [
    `Video: ${url}`,
    `Studio: https://studio.youtube.com/video/${id}/edit`,
    `Tiêu đề: ${m.title}`,
    `Đăng lúc: ${new Date().toLocaleString('vi-VN')}`,
    m.publishAt ? `Lên lịch công khai: ${new Date(m.publishAt).toLocaleString('vi-VN')}` : `Chế độ: ${m.privacy}`,
    ...warnings.map((w) => `Lưu ý: ${w}`),
  ]
  const mv = root ? moveDone(root, item.folder, lines) : { moved: false, folder: item.folder }
  if (root && !mv.moved) log('warn', `Không chuyển được thư mục vào ${DIRS.done}/ (${mv.error}). Hãy tự chuyển để lần sau không đăng lại.`)
  return { id, url, warnings, folder: mv.folder, moved: mv.moved }
}

module.exports = { uploadOne, moveDone, freeName }
